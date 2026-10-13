import { createSession, openSocket, parseMessage, send, validateIceServers, type CreatedSession, type SignalData } from '../protocol';
import { discoverService } from '../serviceConnection';
import { SERVICE_UNAVAILABLE, validateSessionUrl, type ServiceManifest } from '../../../shared/service';
import type { WatchSession } from '../../../shared/freeConfiguration';
import type { JoinedSession, SignalingProvider, SignalingState, ProviderEvent } from './types';
import { randomPassword, type SessionSettings, type StreamAccess } from '../../../shared/streamAccess';
import { randomHex } from './sessionIdentity';

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

  async createSession(maxViewers: number, signal: AbortSignal, access: StreamAccess = { mode: 'private', password: randomPassword() }): Promise<CreatedSession> {
    if (!this.socket || !this.manifest) throw new Error(SERVICE_UNAVAILABLE);
    if (access.mode === 'private' && !this.manifest.features?.includes('session-access')) throw new Error('access-unsupported');
    const session = await createSession(this.socket, maxViewers, signal, access);
    this.controlToken = session.controlToken;
    validateIceServers(session.iceServers);
    try { validateSessionUrl(session.playerUrl, session.sessionId, this.manifest.playerOrigin); }
    catch (error) { this.endSession(session.controlToken); throw error; }
    return session;
  }

  joinSession(session: WatchSession, signal: AbortSignal, password?: string): Promise<JoinedSession> {
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
      send(socket, { type: 'join', sessionId: session.id, password });
    });
  }

  sendSignal(peerId: string, data: SignalData): void { if (this.socket) send(this.socket, { type: 'signal', peerId, data }); }
  disconnectViewer(peerId: string): void {
    if (this.socket && this.controlToken && this.manifest?.features?.includes('viewer-disconnect')) send(this.socket, { type: 'disconnect-viewer', peerId, controlToken: this.controlToken });
  }
  async configureSession(controlToken: string, settings: SessionSettings): Promise<void> {
    await this.manage({ type: 'configure-session', controlToken, settings });
  }
  async regenerateLink(controlToken: string): Promise<string> {
    const managed = await this.manage({ type: 'regenerate-link', controlToken });
    if (!managed.playerUrl || !managed.sessionId || !this.manifest) throw new Error('Resposta de link inválida.');
    validateSessionUrl(managed.playerUrl, managed.sessionId, this.manifest.playerOrigin);
    return managed.playerUrl;
  }
  private manage(command: object): Promise<{ playerUrl?: string; sessionId?: string }> {
    const socket = this.socket;
    if (!socket || !this.manifest?.features?.includes('session-access')) return Promise.reject(new Error('access-unsupported'));
    const requestId = randomHex(16);
    return new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); socket.removeEventListener('message', receive); socket.removeEventListener('close', fail); };
      const fail = () => { cleanup(); reject(new Error(SERVICE_UNAVAILABLE)); };
      const receive = (event: MessageEvent) => {
        const message = parseMessage(event);
        if (message?.type === 'managed' && message.requestId === requestId) { cleanup(); resolve(message); }
        else if (message?.type === 'error') { cleanup(); reject(new Error(message.code)); }
      };
      const timer = setTimeout(fail, 8000);
      socket.addEventListener('message', receive); socket.addEventListener('close', fail);
      send(socket, { ...command, requestId });
    });
  }
  endSession(controlToken: string): void { if (this.socket) send(this.socket, { type: 'stop', controlToken }); this.disconnect(); }
  disconnect(): void { this.closed = true; this.controlToken = ''; this.socket?.close(); this.onStatus('offline'); }
}
