import { createSession, openSocket, parseMessage, send, validateIceServers, type CreatedSession, type SignalData } from '../protocol';
import { discoverService } from '../serviceConnection';
import { SERVICE_UNAVAILABLE, validateSessionUrl, type ServiceManifest } from '../../../shared/service';
import type { WatchSession } from '../../../shared/freeConfiguration';
import type { JoinedSession, SignalingProvider, SignalingState, ProviderEvent } from './types';

export class LegacyNodeSignalingProvider implements SignalingProvider {
  readonly name = 'Node.js (legado)';
  onMessage: (message: ProviderEvent) => void = () => {};
  onStatus: (state: SignalingState, error?: string) => void = () => {};
  private socket?: WebSocket;
  private manifest?: ServiceManifest;
  private closed = false;
  private controlToken = '';

  constructor(private readonly discovery = discoverService) {}

  async connect(signal: AbortSignal): Promise<void> {
    this.onStatus('connecting');
    this.manifest = await this.discovery(signal);
    if (signal.aborted || this.closed) throw new Error(SERVICE_UNAVAILABLE);
    this.socket = await openSocket(this.manifest.signalingUrl, signal);
    this.socket.onmessage = event => {
      const message = parseMessage(event);
      if (message && message.type !== 'created' && message.type !== 'joined') this.onMessage(message);
    };
    this.socket.onclose = () => { if (!this.closed) this.onStatus('error', SERVICE_UNAVAILABLE); };
    this.onStatus('connected');
  }

  async createSession(maxViewers: number, signal: AbortSignal): Promise<CreatedSession> {
    if (!this.socket || !this.manifest) throw new Error(SERVICE_UNAVAILABLE);
    const session = await createSession(this.socket, maxViewers, signal);
    this.controlToken = session.controlToken;
    validateIceServers(session.iceServers);
    try { validateSessionUrl(session.playerUrl, session.sessionId, this.manifest.playerOrigin); }
    catch (error) { this.endSession(session.controlToken); throw error; }
    return session;
  }

  joinSession(session: WatchSession, signal: AbortSignal): Promise<JoinedSession> {
    const socket = this.socket;
    if (!socket) return Promise.reject(new Error(SERVICE_UNAVAILABLE));
    return new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); socket.removeEventListener('message', receive); socket.removeEventListener('close', fail); signal.removeEventListener('abort', fail); };
      const fail = () => { cleanup(); reject(new Error(SERVICE_UNAVAILABLE)); };
      const receive = (event: MessageEvent) => {
        const message = parseMessage(event);
        if (message?.type === 'error') { cleanup(); reject(new Error(message.code)); }
        else if (message?.type === 'joined') {
          try { const iceServers = validateIceServers(message.iceServers); cleanup(); resolve({ peerId: message.peerId, iceServers }); }
          catch { fail(); }
        }
      };
      const timer = setTimeout(fail, 8000);
      socket.addEventListener('message', receive); socket.addEventListener('close', fail); signal.addEventListener('abort', fail, { once: true });
      if (signal.aborted) { fail(); return; }
      send(socket, { type: 'join', sessionId: session.id });
    });
  }

  sendSignal(peerId: string, data: SignalData): void { if (this.socket) send(this.socket, { type: 'signal', peerId, data }); }
  disconnectViewer(peerId: string): void {
    if (this.socket && this.controlToken && this.manifest?.features?.includes('viewer-disconnect')) send(this.socket, { type: 'disconnect-viewer', peerId, controlToken: this.controlToken });
  }
  endSession(controlToken: string): void { if (this.socket) send(this.socket, { type: 'stop', controlToken }); this.disconnect(); }
  disconnect(): void { this.closed = true; this.controlToken = ''; this.socket?.close(); this.onStatus('offline'); }
}
