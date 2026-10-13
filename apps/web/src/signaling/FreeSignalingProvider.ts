import type { DataConnection } from 'peerjs';
import { FREE_ICE_SERVERS, FREE_SESSION_LIFETIME_MS, FREE_SESSION_ID_PATTERN, freeWatchUrl, playerBaseUrl, type WatchSession, type VerifiedWatchSession } from '../../../shared/freeConfiguration';
import { SERVICE_UNAVAILABLE } from '../../../shared/service';
import type { CreatedSession, SignalData } from '../protocol';
import { CloudConnection, type PeerFactoryLoader } from './CloudConnection';
import { ControlChannel } from './ControlChannel';
import { ViewerHandshake } from './ViewerHandshake';
import { createIdentity, dtlsFingerprint, randomHex, type HostProof, type SessionIdentity } from './sessionIdentity';
import type { ControlMessage } from './controlProtocol';
import type { JoinedSession, SignalingProvider, SignalingState, ProviderEvent } from './types';
import { verifyPublishedPlayer } from './playerAvailability';
import { StreamAdmission, randomPassword, validSettings, type SessionSettings, type StreamAccess } from '../../../shared/streamAccess';

type Options = { playerUrl?: string; allowLocalPlayer?: boolean; peerLoader?: PeerFactoryLoader; lifetimeMs?: number };
type HostSession = { identity: SessionIdentity; controlToken: string; expiresAt: number; maxViewers: number; admission: StreamAdmission; blocked: boolean; rotated: boolean };
type PendingProof = { proof: HostProof; signature: string; session: HostSession };

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
  private proofs = new Map<string, PendingProof>();
  private revoked = new Set<string>();

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

  async createSession(maxViewers: number, signal: AbortSignal, access: StreamAccess = { mode: 'private', password: randomPassword() }): Promise<CreatedSession> {
    if (this.closed || signal.aborted || !this.cloud.connected || this.hostSession) throw new Error(SERVICE_UNAVAILABLE);
    if (!this.options.playerUrl) throw new Error('O player gratuito ainda não foi publicado/configurado pelo desenvolvedor.');
    const base = playerBaseUrl(this.options.playerUrl, this.options.allowLocalPlayer);
    const identity = await createIdentity();
    const admission = await StreamAdmission.create(access);
    if (signal.aborted || this.closed || !this.cloud.connected) throw new Error(SERVICE_UNAVAILABLE);
    const ttl = Math.max(1, Math.min(this.options.lifetimeMs ?? FREE_SESSION_LIFETIME_MS, FREE_SESSION_LIFETIME_MS));
    const expiresAt = Date.now() + ttl;
    this.role = 'host';
    this.hostSession = { identity, admission, blocked: false, rotated: false, controlToken: randomHex(32), expiresAt, maxViewers: Number.isInteger(maxViewers) ? Math.max(1, Math.min(maxViewers, 100)) : 4 };
    this.expiry = setTimeout(() => { this.endSession(this.hostSession?.controlToken ?? ''); this.onMessage({ type: 'session-ended' }); }, ttl);
    return { type: 'created', sessionId: this.cloud.sessionId, controlToken: this.hostSession.controlToken, expiresAt,
      playerUrl: freeWatchUrl(base, { id: this.cloud.sessionId, publicKey: identity.publicKey, expiresAt, accessVersion: 1 }), iceServers: structuredClone(FREE_ICE_SERVERS) };
  }

  private accept(connection: DataConnection): void {
    const metadata = connection.metadata;
    const session = this.hostSession;
    if (this.closed || this.role !== 'host' || !session || session.expiresAt <= Date.now()
      || metadata?.protocol !== 'dc-live' || metadata.version !== 2 || metadata.sessionId !== this.cloud.sessionId
      || !/^dc-[a-f0-9]{36}$/.test(connection.peer) || this.revoked.has(connection.peer) || this.channels.has(connection.peer) || this.channels.size >= session.maxViewers + 4) {
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
    if (message.type === 'authenticate' && !channel.joined && !this.joining.has(channel.connection.peer)) {
      await this.authenticateViewer(channel, message.password); return;
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
    if (this.proofs.has(channel.connection.peer)) { channel.close(); return; }
    if (session.blocked) { this.reject(channel, 'entries-blocked'); return; }
    if (message.publicKey !== session.identity.publicKey && (message.publicKey !== undefined || session.rotated)) { this.reject(channel, 'link-invalid'); return; }
    if (!message.publicKey && session.admission.mode === 'private') { this.reject(channel, 'password-required'); return; }
    this.joining.add(channel.connection.peer);
    try {
      const count = [...this.channels.values()].filter(item => item.joined).length + this.joining.size - 1;
      if (count >= session.maxViewers) { this.reject(channel, 'session-full'); return; }
      const proof: HostProof = { sessionId: this.cloud.sessionId, viewerId: channel.connection.peer, nonce: message.nonce,
        expiresAt: session.expiresAt, fingerprint: dtlsFingerprint(channel.connection.peerConnection.localDescription) };
      const signature = await session.identity.sign(proof);
      if (this.closed || !channel.connection.open || this.hostSession !== session) return;
      this.proofs.set(channel.connection.peer, { proof, signature, session });
      if (!message.publicKey) this.admit(channel, { proof, signature, session });
      else channel.send({ type: 'challenge', proof, signature, passwordRequired: session.admission.mode === 'private' });
    } finally { this.joining.delete(channel.connection.peer); }
  }

  private reject(channel: ControlChannel, code: string): void {
    this.proofs.delete(channel.connection.peer);
    channel.send({ type: 'rejected', code });
    setTimeout(() => channel.close(), 100);
  }

  private async authenticateViewer(channel: ControlChannel, password?: string): Promise<void> {
    const pending = this.proofs.get(channel.connection.peer);
    if (!pending || pending.session !== this.hostSession) { channel.close(); return; }
    this.joining.add(channel.connection.peer);
    this.proofs.delete(channel.connection.peer);
    try {
      const error = await pending.session.admission.authenticate(password);
      if (this.closed || pending.session !== this.hostSession || !channel.connection.open) return;
      if (error) { this.reject(channel, error); return; }
      if (pending.session.blocked) { this.reject(channel, 'entries-blocked'); return; }
      const reserved = [...this.channels.values()].filter(item => item.joined).length + this.joining.size - 1;
      if (reserved >= pending.session.maxViewers) { this.reject(channel, 'session-full'); return; }
      this.admit(channel, pending);
    } finally { this.joining.delete(channel.connection.peer); }
  }

  private admit(channel: ControlChannel, pending: PendingProof): void {
    this.proofs.delete(channel.connection.peer);
    channel.joined = true;
    this.onMessage({ type: 'viewer-joined', peerId: channel.connection.peer });
    channel.send({ type: 'welcome', proof: pending.proof, signature: pending.signature });
    this.viewerCount();
  }

  joinSession(session: WatchSession, signal: AbortSignal, password?: string): Promise<JoinedSession> {
    if (!this.cloud.peer || this.closed || !FREE_SESSION_ID_PATTERN.test(session.id) || !session.publicKey || !session.expiresAt) return Promise.reject(new Error('Link inválido.'));
    if (session.expiresAt <= Date.now()) return Promise.reject(new Error('session-unavailable'));
    this.role = 'viewer';
    const connection = this.cloud.peer.connect(`dc-${session.id}`, { serialization: 'raw', reliable: true, metadata: { protocol: 'dc-live', version: 2, sessionId: session.id } });
    return this.authenticateHost(connection, session as VerifiedWatchSession, signal, password);
  }

  private authenticateHost(connection: DataConnection, session: VerifiedWatchSession, signal: AbortSignal, password?: string): Promise<JoinedSession> {
    const handshake = new ViewerHandshake({ connection, session, signal, password,
      viewerId: () => this.cloud.peer?.id ?? '', onMessage: (channel, message) => this.viewerMessage(channel, message),
      onAccepted: () => { this.expiry = setTimeout(() => { this.onMessage({ type: 'session-ended' }); this.disconnect(); }, Math.max(0, session.expiresAt - Date.now())); },
      onClosed: () => { if (!this.closed) this.onMessage({ type: 'error', code: 'connection-lost' }); },
      onSettled: () => { this.joinFailure = undefined; },
    });
    this.channels.set(connection.peer, handshake.channel);
    this.joinFailure = error => handshake.fail(error);
    return handshake.completed;
  }
  private viewerMessage(channel: ControlChannel, message: ControlMessage): void {
    if (message.type === 'rejected') { this.onMessage({ type: 'error', code: message.code }); channel.close(); return; }
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
    if (this.role !== 'host') return;
    if (this.revoked.size < 100) this.revoked.add(peerId);
    const channel = this.channels.get(peerId);
    if (channel) { this.reject(channel, 'viewer-kicked'); channel.joined = false; this.onMessage({ type: 'viewer-left', peerId }); this.viewerCount(); }
  }

  private managedSession(token: string): HostSession {
    const session = this.hostSession;
    if (this.role !== 'host' || !session || this.closed || token !== session.controlToken) throw new Error('Comando de gerenciamento não autorizado.');
    return session;
  }

  async configureSession(token: string, settings: SessionSettings): Promise<void> {
    const session = this.managedSession(token);
    if (!validSettings(settings)) throw new Error('Configuração inválida.');
    const admission = settings.access ? await StreamAdmission.create(settings.access) : session.admission;
    if (this.managedSession(token) !== session) throw new Error('Configuração substituída. Tente novamente.');
    this.hostSession = { ...session, admission, maxViewers: settings.maxViewers, blocked: settings.blocked };
    if (settings.access) this.closeViewers('password-required');
    else for (const channel of this.channels.values()) if (!channel.joined) channel.close();
  }

  async regenerateLink(token: string): Promise<string> {
    const session = this.managedSession(token);
    const identity = await createIdentity();
    if (this.managedSession(token) !== session) throw new Error('Configuração substituída. Tente novamente.');
    this.hostSession = { ...session, identity, rotated: true };
    this.closeViewers('link-invalid');
    return freeWatchUrl(playerBaseUrl(this.options.playerUrl!, this.options.allowLocalPlayer), { id: this.cloud.sessionId, publicKey: identity.publicKey, expiresAt: session.expiresAt, accessVersion: 1 });
  }

  private closeViewers(code: string): void {
    for (const channel of [...this.channels.values()]) {
      channel.send({ type: 'rejected', code });
      // Revoke authorization synchronously before the reliable close notice is flushed.
      if (channel.joined) { channel.joined = false; this.onMessage({ type: 'viewer-left', peerId: channel.connection.peer }); }
      this.proofs.delete(channel.connection.peer);
      setTimeout(() => channel.close(), 100);
    }
    this.viewerCount();
  }

  private removeViewer(peerId: string): void {
    const channel = this.channels.get(peerId);
    this.channels.delete(peerId); this.joining.delete(peerId); this.proofs.delete(peerId);
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
    this.proofs.clear(); this.revoked.clear();
  }
}
