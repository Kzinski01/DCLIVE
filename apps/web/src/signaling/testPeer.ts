import { EventEmitter } from 'node:events';
import type { DataConnection, Peer } from 'peerjs';
import type { PeerFactoryLoader } from './CloudConnection';

const fingerprint = (byte: string) => Array(32).fill(byte).join(':');

class TestConnection extends EventEmitter {
  open = false;
  opposite?: TestConnection;
  dataChannel = { bufferedAmount: 0 };
  peerConnection: { localDescription: { sdp: string }; remoteDescription: { sdp: string } };
  constructor(readonly peer: string, readonly metadata: unknown, local: string, remote: string) {
    super();
    this.peerConnection = { localDescription: { sdp: `v=0\r\na=fingerprint:sha-256 ${fingerprint(local)}\r\n` }, remoteDescription: { sdp: `v=0\r\na=fingerprint:sha-256 ${fingerprint(remote)}\r\n` } };
  }
  send(value: unknown): void { queueMicrotask(() => { if (this.opposite?.open) this.opposite.emit('data', value); }); }
  close(): void {
    if (!this.open) return;
    this.open = false; this.emit('close');
    if (this.opposite?.open) { this.opposite.open = false; this.opposite.emit('close'); }
  }
}

class TestPeer extends EventEmitter {
  disconnected = false;
  destroyed = false;
  links: TestConnection[] = [];
  constructor(readonly id: string, private readonly bus: PeerTestBus, collision = false) {
    super();
    if (!collision) bus.peers.set(id, this);
    queueMicrotask(() => this.emit(collision ? 'error' : 'open', collision ? Object.assign(new Error('Taken'), { type: 'unavailable-id' }) : id));
  }
  connect(id: string, options: { metadata: unknown }): TestConnection {
    const host = this.bus.peers.get(id);
    const outgoing = new TestConnection(id, options.metadata, 'BB', 'AA');
    this.links.push(outgoing);
    if (!host) { queueMicrotask(() => this.emit('error', { type: 'peer-unavailable' })); return outgoing; }
    const incoming = new TestConnection(this.id, options.metadata, 'AA', 'BB');
    host.links.push(incoming); outgoing.opposite = incoming; incoming.opposite = outgoing;
    queueMicrotask(() => {
      host.emit('connection', incoming);
      incoming.open = true; outgoing.open = true;
      incoming.emit('open'); outgoing.emit('open');
    });
    return outgoing;
  }
  disconnect(): void { this.disconnected = true; this.emit('disconnected'); }
  reconnect(): void { this.disconnected = false; queueMicrotask(() => this.emit('open', this.id)); }
  destroy(): void {
    this.destroyed = true;
    for (const connection of this.links) connection.close();
    if (this.bus.peers.get(this.id) === this) this.bus.peers.delete(this.id);
  }
}

// SDK transport doubles are confined to contract tests; production loads the real PeerJS SDK.
export class PeerTestBus {
  peers = new Map<string, TestPeer>();
  registrations = 0;
  options: unknown[] = [];
  collideFirst = false;
  loader: PeerFactoryLoader = async () => (id, options) => {
    this.options.push(options);
    const collision = this.collideFirst && this.registrations++ === 0;
    return new TestPeer(id, this, collision) as unknown as Peer;
  };
  connection(peerId: string): DataConnection { return this.peers.get(peerId)?.links[0] as unknown as DataConnection; }
  close(): void { for (const peer of this.peers.values()) peer.destroy(); }
}
