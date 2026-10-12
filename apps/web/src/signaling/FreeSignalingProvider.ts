import type { DataConnection } from 'peerjs';
import { FREE_ICE_SERVERS, FREE_SESSION_LIFETIME_MS, FREE_SESSION_ID_PATTERN, freeWatchUrl, playerBaseUrl, type WatchSession } from '../../../shared/freeConfiguration';
import { SERVICE_UNAVAILABLE } from '../../../shared/service';
import type { CreatedSession, SignalData } from '../protocol';
import { CloudConnection, type PeerFactoryLoader } from './CloudConnection';
import { ControlChannel } from './ControlChannel';
import { createIdentity, dtlsFingerprint, randomHex, verifyIdentity, type HostProof, type SessionIdentity } from './sessionIdentity';
import type { ControlMessage } from './controlProtocol';
import type { JoinedSession, SignalingProvider, SignalingState, ProviderEvent } from './types';
import { verifyPublishedPlayer } from './playerAvailability';

type Options = { playerUrl?: string; allowLocalPlayer?: boolean; peerLoader?: PeerFactoryLoader; lifetimeMs?: number };
type HostSession = { identity: SessionIdentity; controlToken: string; expiresAt: number; maxViewers: number };

export class FreeSignalingProvider implements SignalingProvider {
  readonly name = 'PeerJS Cloud · P2P';
  onMessage: (message: ProviderEvent) => void = () => {};
  onStatus: (state: SignalingState, error?: string) => void = () => {};
  private cloud: CloudConnection;
  private channels = new Map<string, ControlChannel>();
  private hostSession?: HostSession;
  private role?: 'host' | 'viewer';
  private closed = false;
  private expiry?: ReturnType<typeof setTimeout>;
  private joinFailure?: (error: Error) => void;
  private joining = new Set<string>();
  private endingToken = '';

  constructor(private readonly options: Options = {}) {
    this.cloud = new CloudConnection(options.peerLoader);
    this.cloud.onStatus = (state, error) => this.onStatus(state, error);
    this.cloud.onConnection = connection => this.accept(connection);
    this.cloud.onPeerUnavailable = () => this.joinFailure?.(new Error('session-unavailable'));
  }

  async connect(signal: AbortSignal): Promise<void> {
    if (!this.options.playerUrl) throw new Error('O player gratuito ainda não foi configurado pelo desenvolvedor.');
    const base = playerBaseUrl(this.options.playerUrl, this.options.allowLocalPlayer);
    if (!this.options.allowLocalPlayer) await verifyPublishedPlayer(base, signal);
    await this.cloud.connect(signal);
  }

  async createSession(maxViewers: number, signal: AbortSignal): Promise<CreatedSession> {
    if (this.closed || signal.aborted || !this.cloud.connected || this.hostSession) throw new Error(SERVICE_UNAVAILABLE);
    if (!this.options.playerUrl) throw new Error('O player gratuito ainda não foi publicado/configurado pelo desenvolvedor.');
    const base = playerBaseUrl(this.options.playerUrl, this.options.allowLocalPlayer);
    const identity = await createIdentity();
    if (signal.aborted || this.closed || !this.cloud.connected) throw new Error(SERVICE_UNAVAILABLE);
    const ttl = Math.max(1, Math.min(this.options.lifetimeMs ?? FREE_SESSION_LIFETIME_MS, FREE_SESSION_LIFETIME_MS));
    const expiresAt = Date.now() + ttl;
    this.role = 'host';
    this.hostSession = { identity, controlToken: randomHex(32), expiresAt, maxViewers: Number.isInteger(maxViewers) ? Math.max(1, Math.min(maxViewers, 100)) : 4 };
    this.expiry = setTimeout(() => { this.endSession(this.hostSession?.controlToken ?? ''); this.onMessage({ type: 'session-ended' }); }, ttl);
    return { type: 'created', sessionId: this.cloud.sessionId, controlToken: this.hostSession.controlToken, expiresAt,
      playerUrl: freeWatchUrl(base, { id: this.cloud.sessionId, publicKey: identity.publicKey, expiresAt }), iceServers: structuredClone(FREE_ICE_SERVERS) };
  }

  private accept(connection: DataConnection): void {
    const metadata = connection.metadata;
    const session = this.hostSession;
    if (this.closed || this.role !== 'host' || !session || session.expiresAt <= Date.now()
      || metadata?.protocol !== 'dc-live' || metadata.version !== 2 || metadata.sessionId !== this.cloud.sessionId
      || !/^dc-[a-f0-9]{36}$/.test(connection.peer) || this.channels.has(connection.peer) || this.channels.size >= session.maxViewers + 4) {
      connection.close(); return;
    }
    const channel = new ControlChannel(connection, message => {
      void this.hostMessage(channel, message).catch(() => channel.close());
    }, () => this.removeViewer(connection.peer));
    this.channels.set(connection.peer, channel);
  }

  private async hostMessage(channel: ControlChannel, message: ControlMessage): Promise<void> {
    const session = this.hostSession;
    if (!session || this.closed) return;
    if (message.type === 'join' && !channel.joined && !this.joining.has(channel.connection.peer)) {
      await this.authorizeViewer(channel, message); return;
    }
    if (!channel.joined) { channel.close(); return; }
    if (message.type === 'leave') { channel.close(); return; }
    if (message.type === 'signal' && (!('description' in message.data) || message.data.description.type === 'offer')) {
      this.onMessage({ type: 'signal', peerId: channel.connection.peer, data: message.data }); return;
    }
    // Viewer messages can never terminate or administer the host's session.
    channel.close();
  }

  private async authorizeViewer(channel: ControlChannel, message: Extract<ControlMessage, { type: 'join' }>): Promise<void> {
    const session = this.hostSession;
    if (!session || message.sessionId !== this.cloud.sessionId || session.expiresAt <= Date.now()) { channel.close(); return; }
    this.joining.add(channel.connection.peer);
    try {
      const count = [...this.channels.values()].filter(item => item.joined).length + this.joining.size - 1;
      if (count >= session.maxViewers) { channel.send({ type: 'rejected', code: 'session-full' }); setTimeout(() => channel.close(), 100); return; }
      const proof: HostProof = { sessionId: this.cloud.sessionId, viewerId: channel.connection.peer, nonce: message.nonce,
        expiresAt: session.expiresAt, fingerprint: dtlsFingerprint(channel.connection.peerConnection.localDescription) };
      const signature = await session.identity.sign(proof);
      if (this.closed || !channel.connection.open || this.hostSession !== session) return;
      channel.joined = true;
      this.onMessage({ type: 'viewer-joined', peerId: channel.connection.peer });
      channel.send({ type: 'welcome', proof, signature });
      this.viewerCount();
    } finally { this.joining.delete(channel.connection.peer); }
  }

  joinSession(session: WatchSession, signal: AbortSignal): Promise<JoinedSession> {
    if (!this.cloud.peer || this.closed || !FREE_SESSION_ID_PATTERN.test(session.id) || !session.publicKey || !session.expiresAt) return Promise.reject(new Error('Link inválido.'));
    if (session.expiresAt <= Date.now()) return Promise.reject(new Error('session-unavailable'));
    this.role = 'viewer';
    const connection = this.cloud.peer.connect(`dc-${session.id}`, { serialization: 'raw', reliable: true, metadata: { protocol: 'dc-live', version: 2, sessionId: session.id } });
    return this.authenticateHost(connection, session as Required<WatchSession>, signal);
  }

  private authenticateHost(connection: DataConnection, session: Required<WatchSession>, signal: AbortSignal): Promise<JoinedSession> {
    return new Promise((resolve, reject) => {
      const nonce = randomHex(32);
      let accepted = false;
      let authenticating = false;
      const cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort', fail); this.joinFailure = undefined; };
      const fail = () => { cleanup(); reject(new Error('Não foi possível estabelecer P2P. Verifique NAT, firewall e STUN; TURN está desativado.')); channel.close(); };
      const receive = async (message: ControlMessage) => {
        if (accepted) { this.viewerMessage(channel, message); return; }
        if (message.type === 'rejected') { cleanup(); reject(new Error(message.code)); channel.close(); return; }
        if (message.type !== 'welcome') { fail(); return; }
        if (authenticating) { fail(); return; }
        authenticating = true;
        if (!await this.validHostProof(connection, session, nonce, message)) { cleanup(); reject(new Error('Identidade do transmissor não confirmada.')); channel.close(); return; }
        if (signal.aborted || this.closed || !connection.open) { fail(); return; }
        accepted = true; channel.joined = true; cleanup();
        this.expiry = setTimeout(() => { this.onMessage({ type: 'session-ended' }); this.disconnect(); }, Math.max(0, session.expiresAt - Date.now()));
        resolve({ peerId: this.cloud.peer?.id ?? '', iceServers: structuredClone(FREE_ICE_SERVERS) });
      };
      const channel = new ControlChannel(connection, message => { void receive(message).catch(fail); }, () => {
        if (!accepted) fail(); else if (!this.closed) this.onMessage({ type: 'error', code: 'connection-lost' });
      });
      this.channels.set(connection.peer, channel);
      const timer = setTimeout(fail, 15000);
      this.joinFailure = error => { cleanup(); reject(error); channel.close(); };
      signal.addEventListener('abort', fail, { once: true });
      connection.on('open', () => channel.send({ type: 'join', sessionId: session.id, nonce }));
      if (signal.aborted) fail();
    });
  }

  private async validHostProof(connection: DataConnection, session: Required<WatchSession>, nonce: string, message: Extract<ControlMessage, { type: 'welcome' }>): Promise<boolean> {
    const proof = message.proof;
    return proof.sessionId === session.id && proof.viewerId === this.cloud.peer?.id && proof.nonce === nonce
      && proof.expiresAt === session.expiresAt && proof.expiresAt > Date.now()
      && proof.fingerprint === dtlsFingerprint(connection.peerConnection.remoteDescription)
      && await verifyIdentity(session.publicKey, proof, message.signature);
  }

  private viewerMessage(channel: ControlChannel, message: ControlMessage): void {
    if (message.type === 'ended') { this.onMessage({ type: 'session-ended' }); return; }
    if (message.type === 'signal' && (!('description' in message.data) || message.data.description.type === 'answer')) {
      this.onMessage({ type: 'signal', peerId: this.cloud.peer?.id ?? '', data: message.data }); return;
    }
    channel.close();
  }

  sendSignal(peerId: string, data: SignalData): void {
    const channel = this.role === 'host' ? this.channels.get(peerId) : [...this.channels.values()][0];
    if (channel?.joined) channel.send({ type: 'signal', data });
  }

  disconnectViewer(peerId: string): void {
    if (this.role === 'host') this.channels.get(peerId)?.close();
  }

  private removeViewer(peerId: string): void {
    const channel = this.channels.get(peerId);
    this.channels.delete(peerId); this.joining.delete(peerId);
    if (!this.closed && channel?.joined) { this.onMessage({ type: 'viewer-left', peerId }); this.viewerCount(); }
  }

  private viewerCount(): void { this.onMessage({ type: 'viewer-count', count: [...this.channels.values()].filter(item => item.joined).length }); }

  endSession(controlToken: string): void {
    if (this.endingToken && controlToken === this.endingToken) return;
    if (!this.hostSession || controlToken !== this.hostSession.controlToken) throw new Error('Comando de encerramento não autorizado.');
    this.endingToken = controlToken; this.hostSession = undefined; clearTimeout(this.expiry);
    for (const channel of this.channels.values()) if (channel.joined) channel.send({ type: 'ended' });
    // Give the reliable control channel a turn to flush the end notice before destroying its RTC connection.
    this.expiry = setTimeout(() => this.disconnect(), 100);
  }

  disconnect(): void {
    if (this.closed) return;
    this.closed = true; clearTimeout(this.expiry); this.hostSession = undefined;
    for (const channel of this.channels.values()) channel.close();
    this.channels.clear(); this.cloud.disconnect();
  }
}
