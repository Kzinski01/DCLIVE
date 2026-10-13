import type { DataConnection } from 'peerjs';
import { FREE_ICE_SERVERS, type VerifiedWatchSession } from '../../../shared/freeConfiguration';
import { ControlChannel } from './ControlChannel';
import type { ControlMessage } from './controlProtocol';
import { dtlsFingerprint, randomHex, verifyIdentity } from './sessionIdentity';
import type { JoinedSession } from './types';

type Options = {
  connection: DataConnection; session: VerifiedWatchSession; signal: AbortSignal; password?: string;
  viewerId: () => string; onMessage: (channel: ControlChannel, message: ControlMessage) => void;
  onAccepted: () => void; onClosed: () => void; onSettled: () => void;
};

export class ViewerHandshake {
  readonly channel: ControlChannel;
  readonly completed: Promise<JoinedSession>;
  private nonce = randomHex(32);
  private accepted = false;
  private settled = false;
  private checking = false;
  private challenged = false;
  private resolve!: (joined: JoinedSession) => void;
  private reject!: (error: Error) => void;
  private timer: ReturnType<typeof setTimeout>;
  private abort = () => this.fail(new Error('Conexão cancelada.'));

  constructor(private readonly options: Options) {
    this.completed = new Promise((resolve, reject) => { this.resolve = resolve; this.reject = reject; });
    this.timer = setTimeout(() => this.fail(new Error('Não foi possível estabelecer P2P. Verifique NAT, firewall e STUN; TURN está desativado.')), 15000);
    this.channel = new ControlChannel(options.connection, message => { void this.receive(message).catch(error => this.fail(error instanceof Error ? error : new Error('Handshake inválido.'))); }, () => {
      if (this.accepted) options.onClosed(); else this.fail(new Error('Canal de controle encerrado.'));
    });
    options.signal.addEventListener('abort', this.abort, { once: true });
    options.connection.on('open', () => this.channel.send({ type: 'join', sessionId: options.session.id, nonce: this.nonce,
      ...(options.session.accessVersion === 1 ? { publicKey: options.session.publicKey } : {}) }));
    if (options.signal.aborted) this.abort();
  }

  fail(error: Error): void {
    if (this.settled) return;
    this.cleanup(); this.reject(error); this.channel.close();
  }

  private cleanup(): void {
    this.settled = true; clearTimeout(this.timer);
    this.options.signal.removeEventListener('abort', this.abort); this.options.onSettled();
  }

  private async receive(message: ControlMessage): Promise<void> {
    if (this.accepted) { this.options.onMessage(this.channel, message); return; }
    if (this.settled) return;
    if (message.type === 'rejected') { this.fail(new Error(message.code)); return; }
    if (message.type !== 'welcome' && message.type !== 'challenge' || this.checking) { this.fail(new Error('Handshake fora de ordem.')); return; }
    if (message.type === 'challenge' && this.challenged) { this.fail(new Error('Desafio duplicado.')); return; }
    this.checking = true;
    if (!await this.verifyHost(message)) { this.fail(new Error('Identidade do transmissor não confirmada.')); return; }
    this.checking = false;
    if (this.settled || this.options.signal.aborted || !this.options.connection.open) return;
    if (message.type === 'challenge') { this.respondToChallenge(message); return; }
    this.accepted = true; this.channel.joined = true; this.cleanup(); this.options.onAccepted();
    this.resolve({ peerId: this.options.viewerId(), iceServers: structuredClone(FREE_ICE_SERVERS) });
  }

  private respondToChallenge(message: Extract<ControlMessage, { type: 'challenge' }>): void {
    this.challenged = true;
    if (message.passwordRequired && !this.options.password) { this.fail(new Error('password-required')); return; }
    // The credential is sent only after binding the signed host identity to this DTLS channel.
    this.channel.send({ type: 'authenticate', ...(message.passwordRequired ? { password: this.options.password } : {}) });
  }

  private async verifyHost(message: Extract<ControlMessage, { type: 'welcome' | 'challenge' }>): Promise<boolean> {
    const { session, connection } = this.options; const proof = message.proof;
    return proof.sessionId === session.id && proof.viewerId === this.options.viewerId() && proof.nonce === this.nonce
      && proof.expiresAt === session.expiresAt && proof.expiresAt > Date.now()
      && proof.fingerprint === dtlsFingerprint(connection.peerConnection.remoteDescription)
      && await verifyIdentity(session.publicKey, proof, message.signature);
  }
}
