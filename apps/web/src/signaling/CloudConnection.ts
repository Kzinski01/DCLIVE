import type { DataConnection, Peer, PeerJSOption } from 'peerjs';
import { CLOUD_PEER_OPTIONS, FREE_ICE_SERVERS } from '../../../shared/freeConfiguration';
import { SERVICE_UNAVAILABLE } from '../../../shared/service';
import { randomHex } from './sessionIdentity';
import type { SignalingState } from './types';

export type PeerFactory = (id: string, options: PeerJSOption) => Peer;
export type PeerFactoryLoader = () => Promise<PeerFactory>;
export const loadPeer: PeerFactoryLoader = async () => {
  const { Peer } = await import('peerjs');
  return (id, options) => new Peer(id, options);
};

function register(peer: Peer, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); peer.off('open', open); peer.off('error', fail); signal.removeEventListener('abort', abort); };
    const open = () => { cleanup(); resolve(); };
    const fail = (error: Error) => { cleanup(); reject(error); };
    const abort = () => fail(new Error(SERVICE_UNAVAILABLE));
    const timer = setTimeout(abort, 10000);
    peer.on('open', open); peer.on('error', fail); signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}

export class CloudConnection {
  peer?: Peer;
  sessionId = '';
  onConnection: (connection: DataConnection) => void = connection => connection.close();
  onStatus: (status: SignalingState, error?: string) => void = () => {};
  onPeerUnavailable: () => void = () => {};
  private closed = false;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private reconnectWatch?: ReturnType<typeof setTimeout>;
  private retries = 0;
  private registered = false;
  get connected(): boolean { return this.registered && !this.closed && this.peer?.disconnected === false && !this.peer.destroyed; }

  constructor(private readonly factoryLoader = loadPeer) {}

  async connect(signal: AbortSignal): Promise<void> {
    this.onStatus('connecting');
    const factory = await this.factoryLoader();
    for (let attempt = 0; attempt < 3; attempt++) {
      if (signal.aborted || this.closed) throw new Error(SERVICE_UNAVAILABLE);
      this.sessionId = randomHex(18);
      const peer = factory(`dc-${this.sessionId}`, { ...CLOUD_PEER_OPTIONS, token: randomHex(32), config: { iceServers: FREE_ICE_SERVERS, iceTransportPolicy: 'all' } });
      this.peer = peer;
      peer.on('connection', connection => this.onConnection(connection));
      try { await register(peer, signal); }
      catch (error) {
        peer.destroy();
        if ((error as { type?: string }).type === 'unavailable-id' && attempt < 2) continue;
        throw new Error(SERVICE_UNAVAILABLE, { cause: error });
      }
      if (signal.aborted || this.closed) { peer.destroy(); throw new Error(SERVICE_UNAVAILABLE); }
      this.registered = true;
      this.attachRuntime(peer);
      this.onStatus('connected');
      return;
    }
  }

  private attachRuntime(peer: Peer): void {
    peer.on('open', () => {
      this.registered = true;
      clearTimeout(this.reconnectWatch); clearTimeout(this.retryTimer);
      this.retryTimer = undefined; this.retries = 0;
      if (!this.closed) this.onStatus('connected');
    });
    peer.on('disconnected', () => { this.registered = false; this.reconnect(); });
    peer.on('error', error => {
      if (this.closed) return;
      if (error.type === 'peer-unavailable') this.onPeerUnavailable();
      else if (error.type === 'network' || error.type === 'disconnected') this.reconnect();
      else this.onStatus('error', SERVICE_UNAVAILABLE);
    });
  }

  private reconnect(): void {
    if (this.closed || this.retryTimer) return;
    this.registered = false; this.onStatus('reconnecting');
    if (this.retries >= 5 || this.peer?.destroyed) { this.onStatus('error', SERVICE_UNAVAILABLE); return; }
    this.retries += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      try { if (this.peer?.disconnected) this.peer.reconnect(); }
      catch { this.onStatus('error', SERVICE_UNAVAILABLE); return; }
      this.reconnectWatch = setTimeout(() => {
        if (!this.registered && !this.closed) { this.peer?.disconnect(); this.reconnect(); }
      }, 10000);
    }, Math.min(1000 * 2 ** this.retries, 10000));
  }

  disconnect(): void {
    this.closed = true; this.registered = false; clearTimeout(this.retryTimer); clearTimeout(this.reconnectWatch);
    this.peer?.destroy(); this.peer = undefined;
    this.onStatus('offline');
  }
}
