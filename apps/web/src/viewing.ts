import { errorMessage, validateIceServers, type SignalData } from './protocol';
import type { WatchSession } from '../../shared/freeConfiguration';
import { createSignalingProvider } from './signaling/factory';
import type { ProviderEvent, SignalingProvider, SignalingState } from './signaling/types';
import { MAX_ICE_CANDIDATES, validSignal } from '../../shared/signaling';

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
  private candidateCount = 0;
  private answered = false;
  private signalingState: SignalingState = 'offline';
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
    this.signalingState = status;
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
          else { this.set({ phase: 'error', error: errorMessage(new Error(message.code)) }); this.dispose(); }
          break;
      }
    } catch (error) { this.set({ phase: 'error', error: errorMessage(error) }); this.dispose(); }
  }

  private async makeOffer(peerId: string, iceServers: RTCIceServer[]): Promise<void> {
    this.peer?.close();
    this.peerId = peerId;
    this.pending = [];
    this.candidateCount = 0; this.answered = false;
    this.lastStats = undefined;
    const peer = new RTCPeerConnection({ iceServers });
    this.peer = peer;
    peer.addTransceiver('video', { direction: 'recvonly' });
    peer.addTransceiver('audio', { direction: 'recvonly' });
    peer.ontrack = event => {
      if (this.closed || this.peer !== peer) return;
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      this.retries = 0;
      this.set({ phase: 'waiting', error: '' }, stream);
    };
    peer.onicecandidate = event => {
      if (event.candidate) this.provider?.sendSignal(peerId, { candidate: event.candidate.toJSON() });
    };
    peer.onconnectionstatechange = () => {
      if (this.closed || this.peer !== peer) return;
      if (peer.connectionState === 'failed' || peer.connectionState === 'disconnected') this.reconnect();
    };
    await peer.setLocalDescription(await peer.createOffer());
    if (this.closed || this.peer !== peer) return;
    if (peer.localDescription) this.provider?.sendSignal(peerId, { description: peer.localDescription });
    if (this.statsTimer) window.clearInterval(this.statsTimer);
    this.statsTimer = window.setInterval(() => void this.collectStats().catch(error => this.set({ error: `Falha ao ler métricas: ${errorMessage(error)}` })), 2000);
  }

  private async onSignal(data: SignalData): Promise<void> {
    const peer = this.peer;
    if (!peer) return;
    if (!validSignal(data)) throw new Error('Sinal inválido.');
    if ('description' in data && data.description.type === 'answer') {
      if (this.answered) throw new Error('Resposta duplicada ou fora de ordem.');
      this.answered = true;
      await peer.setRemoteDescription(data.description);
      if (this.closed || this.peer !== peer) return;
      for (const candidate of this.pending) await peer.addIceCandidate(candidate);
      this.pending = [];
    } else if ('candidate' in data) {
      if (++this.candidateCount > MAX_ICE_CANDIDATES) throw new Error('Limite de candidatos ICE excedido.');
      if (peer.remoteDescription) await peer.addIceCandidate(data.candidate);
      else this.pending.push(data.candidate);
    } else throw new Error('Descrição fora de ordem.');
  }

  private async collectStats(): Promise<void> {
    const peer = this.peer;
    if (!peer) return;
    let bytes = 0;
    let frames = 0;
    let height = 0;
    const stats = await peer.getStats();
    if (this.closed || this.peer !== peer) return;
    for (const report of stats.values()) {
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
        phase: this.signalingState !== 'reconnecting' && peer.connectionState === 'connected' && frames > 0 ? 'playing' : this.state.phase });
    }
    this.lastStats = { bytes, frames, time };
  }

  private reconnect(): void {
    if (this.closed || this.retryTimer) return;
    this.peer?.close();
    this.pending = []; this.lastStats = undefined;
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
    this.peer = undefined; this.pending = []; this.lastStats = undefined;
    this.provider?.disconnect();
  }
}
