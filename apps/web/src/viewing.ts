import { errorMessage, validateIceServers, type SignalData } from './protocol';
import type { WatchSession } from '../../shared/freeConfiguration';
import { createSignalingProvider } from './signaling/factory';
import type { ProviderEvent, SignalingProvider, SignalingState } from './signaling/types';

export type ViewerState = {
  phase: 'connecting' | 'waiting' | 'playing' | 'reconnecting' | 'ended' | 'error';
  error: string;
  receivedMbps: number;
  receivedFps: number;
  height: number;
};

export class Viewing {
  private provider?: SignalingProvider;
  private peer?: RTCPeerConnection;
  private peerId = '';
  private pending: RTCIceCandidateInit[] = [];
  private retries = 0;
  private retryTimer?: number;
  private statsTimer?: number;
  private lastStats?: { bytes: number; frames: number; time: number };
  private closed = false;
  private startup = new AbortController();
  state: ViewerState = { phase: 'connecting', error: '', receivedMbps: 0, receivedFps: 0, height: 0 };

  constructor(private readonly session: WatchSession, private readonly update: (state: ViewerState, stream?: MediaStream) => void, private readonly providerFactory = createSignalingProvider) {}

  private set(change: Partial<ViewerState>, stream?: MediaStream): void {
    this.state = { ...this.state, ...change };
    this.update(this.state, stream);
  }

  async start(): Promise<void> {
    try {
      const provider = this.providerFactory();
      this.provider = provider;
      provider.onMessage = message => { if (this.provider === provider) void this.onMessage(message); };
      provider.onStatus = (status, error) => { if (this.provider === provider) this.providerStatus(status, error); };
      await provider.connect(this.startup.signal);
      const joined = await provider.joinSession(this.session, this.startup.signal);
      if (this.closed || this.provider !== provider) { provider.disconnect(); return; }
      await this.makeOffer(joined.peerId, validateIceServers(joined.iceServers));
    } catch (error) {
      if (this.closed) return;
      if (error instanceof Error && error.message === 'session-unavailable') { this.end(); return; }
      this.set({ phase: 'error', error: errorMessage(error) }); this.reconnect();
    }
  }

  private providerStatus(status: SignalingState, error?: string): void {
    if (this.closed) return;
    if (status === 'reconnecting') this.set({ phase: 'reconnecting' });
    else if (status === 'connected' && this.peer) this.set({ phase: this.state.receivedFps > 0 ? 'playing' : 'waiting', error: '' });
    else if (status === 'error') { this.set({ error: error || 'A sinalização foi interrompida.' }); this.reconnect(); }
  }

  private async onMessage(message: ProviderEvent): Promise<void> {
    if (this.closed) return;
    try {
      switch (message.type) {
        case 'signal': if (message.peerId === this.peerId) await this.onSignal(message.data); break;
        case 'session-ended': this.end(); break;
        case 'error':
          if (message.code === 'session-unavailable') this.end();
          else if (message.code === 'connection-lost') this.reconnect();
          else this.set({ phase: 'error', error: `Erro de sinalização: ${message.code}` });
          break;
      }
    } catch (error) { this.set({ phase: 'error', error: errorMessage(error) }); }
  }

  private async makeOffer(peerId: string, iceServers: RTCIceServer[]): Promise<void> {
    this.peer?.close();
    this.peerId = peerId;
    this.pending = [];
    this.lastStats = undefined;
    const peer = new RTCPeerConnection({ iceServers });
    this.peer = peer;
    peer.addTransceiver('video', { direction: 'recvonly' });
    peer.addTransceiver('audio', { direction: 'recvonly' });
    peer.ontrack = event => {
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      this.retries = 0;
      this.set({ phase: 'waiting', error: '' }, stream);
    };
    peer.onicecandidate = event => {
      if (event.candidate) this.provider?.sendSignal(peerId, { candidate: event.candidate.toJSON() });
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'failed' || peer.connectionState === 'disconnected') this.reconnect();
    };
    await peer.setLocalDescription(await peer.createOffer());
    if (peer.localDescription) this.provider?.sendSignal(peerId, { description: peer.localDescription });
    if (this.statsTimer) window.clearInterval(this.statsTimer);
    this.statsTimer = window.setInterval(() => void this.collectStats().catch(error => this.set({ error: `Falha ao ler métricas: ${errorMessage(error)}` })), 2000);
  }

  private async onSignal(data: SignalData): Promise<void> {
    if (!this.peer) return;
    if ('description' in data && data.description.type === 'answer') {
      await this.peer.setRemoteDescription(data.description);
      for (const candidate of this.pending) await this.peer.addIceCandidate(candidate);
      this.pending = [];
    } else if ('candidate' in data) {
      if (this.peer.remoteDescription) await this.peer.addIceCandidate(data.candidate);
      else this.pending.push(data.candidate);
    }
  }

  private async collectStats(): Promise<void> {
    if (!this.peer) return;
    let bytes = 0;
    let frames = 0;
    let height = 0;
    for (const report of (await this.peer.getStats()).values()) {
      if (report.type === 'inbound-rtp' && report.kind === 'video') {
        bytes += report.bytesReceived ?? 0;
        frames += report.framesDecoded ?? 0;
        height = report.frameHeight ?? height;
      }
    }
    if (this.closed) return;
    const time = performance.now();
    if (this.lastStats) {
      const seconds = (time - this.lastStats.time) / 1000;
      this.set({ receivedMbps: Math.max(0, (bytes - this.lastStats.bytes) * 8 / seconds / 1_000_000),
        receivedFps: Math.max(0, (frames - this.lastStats.frames) / seconds), height,
        phase: frames > 0 ? 'playing' : this.state.phase });
    }
    this.lastStats = { bytes, frames, time };
  }

  private reconnect(): void {
    if (this.closed || this.retryTimer) return;
    this.peer?.close();
    this.peer = undefined;
    const provider = this.provider;
    this.provider = undefined;
    provider?.disconnect();
    if (this.statsTimer) window.clearInterval(this.statsTimer);
    this.set({ phase: 'reconnecting' });
    if (this.retries >= 5) { this.set({ phase: 'error', error: 'A conexão não pôde ser restabelecida.' }); return; }
    this.retries += 1;
    this.retryTimer = window.setTimeout(() => { this.retryTimer = undefined; void this.start(); }, Math.min(1000 * 2 ** this.retries, 10000));
  }

  private end(): void {
    this.dispose();
    this.set({ phase: 'ended' });
  }

  dispose(): void {
    this.closed = true;
    this.startup.abort();
    if (this.retryTimer) window.clearTimeout(this.retryTimer);
    if (this.statsTimer) window.clearInterval(this.statsTimer);
    this.peer?.close();
    this.provider?.disconnect();
  }
}
