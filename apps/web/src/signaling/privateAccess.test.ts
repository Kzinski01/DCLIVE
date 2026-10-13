import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { FreeSignalingProvider } from './FreeSignalingProvider';
import { PeerTestBus } from './testPeer';
import { parseWatchSession } from '../../../shared/freeConfiguration';
import type { ProviderEvent } from './types';
import { createIdentity, type HostProof } from './sessionIdentity';
import { freeWatchUrl } from '../../../shared/freeConfiguration';

const signal = () => new AbortController().signal;
const password = 'private-test-password';
const provider = (bus: PeerTestBus) => new FreeSignalingProvider({ playerUrl: 'http://127.0.0.1:5173/', allowLocalPlayer: true, peerLoader: bus.loader });

test('host rejects passwords and pre-auth media signaling before any viewer/media event', async () => {
  const bus = new PeerTestBus(); const host = provider(bus); const clients: FreeSignalingProvider[] = [];
  const events: ProviderEvent[] = []; host.onMessage = event => events.push(event);
  try {
    await host.connect(signal());
    const created = await host.createSession(4, signal(), { mode: 'private', password });
    assert(!created.playerUrl.includes(password));
    const watch = parseWatchSession(new URL(created.playerUrl))!;
    for (const secret of [undefined, 'wrong-password']) {
      const client = provider(bus); clients.push(client); await client.connect(signal());
      await assert.rejects(client.joinSession(watch, signal(), secret), /password-(required|invalid)/);
    }
    assert(!events.some(event => event.type === 'viewer-joined' || event.type === 'signal'));
    const raw = await bus.loader();
    const intruder = raw(`dc-${'9'.repeat(36)}`, {});
    const connection = intruder.connect(`dc-${created.sessionId}`, { metadata: { protocol: 'dc-live', version: 2, sessionId: created.sessionId }, serialization: 'raw' });
    connection.on('open', () => connection.send(JSON.stringify({ type: 'signal', data: { description: { type: 'offer', sdp: 'v=0' } } })));
    await nextTurn();
    assert(!events.some(event => event.type === 'signal'));
    const valid = provider(bus); clients.push(valid); await valid.connect(signal());
    const joined = await valid.joinSession(watch, signal(), password);
    assert(events.some(event => event.type === 'viewer-joined'));
    valid.sendSignal(joined.peerId, { description: { type: 'offer', sdp: 'v=0' } }); await nextTurn();
    assert(events.some(event => event.type === 'signal'));
  } finally { clients.forEach(client => { client.disconnect(); }); host.disconnect(); bus.close(); }
});

test('host controls block, capacity, kick, password replacement and link revocation', async () => {
  const bus = new PeerTestBus(); const host = provider(bus); const clients: FreeSignalingProvider[] = [];
  try {
    await host.connect(signal());
    const created = await host.createSession(2, signal(), { mode: 'private', password });
    let watch = parseWatchSession(new URL(created.playerUrl))!;
    const join = async (secret = password) => { const client = provider(bus); clients.push(client); await client.connect(signal()); return { client, joined: await client.joinSession(watch, signal(), secret) }; };
    const first = await join(); const departed: ProviderEvent[] = []; first.client.onMessage = event => departed.push(event);
    await assert.rejects(host.configureSession('wrong', { maxViewers: 1, blocked: true }), /autorizado/);
    await host.configureSession(created.controlToken, { maxViewers: 2, blocked: true });
    await assert.rejects(join(), /entries-blocked/);
    assert(!departed.some(event => event.type === 'error'));
    await host.configureSession(created.controlToken, { maxViewers: 1, blocked: false });
    await assert.rejects(join(), /session-full/);
    host.disconnectViewer(first.joined.peerId); await nextTurn();
    assert(departed.some(event => event.type === 'error' && event.code === 'viewer-kicked'));
    await host.configureSession(created.controlToken, { maxViewers: 2, blocked: false, access: { mode: 'private', password: 'new-test-password' } });
    await assert.rejects(join(password), /password-invalid/);
    await join('new-test-password');
    const previous = watch;
    const rotatedUrl = await host.regenerateLink(created.controlToken);
    watch = parseWatchSession(new URL(rotatedUrl))!;
    assert.notEqual(watch.publicKey, previous.publicKey);
    const old = provider(bus); clients.push(old); await old.connect(signal());
    await assert.rejects(old.joinSession(previous, signal(), 'new-test-password'), /link-invalid/);
    await join('new-test-password');
  } finally { clients.forEach(client => { client.disconnect(); }); host.disconnect(); bus.close(); }
});

test('does not send a password to a signed identity on the wrong DTLS channel', async () => {
  const bus = new PeerTestBus(); const client = provider(bus);
  const identity = await createIdentity(); const id = 'a'.repeat(36); const expiresAt = Date.now() + 10000;
  const factory = await bus.loader(); const host = factory(`dc-${id}`, {});
  const received: Record<string, unknown>[] = [];
  host.on('connection', connection => connection.on('data', async raw => {
    const message = JSON.parse(String(raw)); received.push(message);
    if (message.type !== 'join') return;
    const proof: HostProof = { sessionId: id, viewerId: connection.peer, nonce: message.nonce, expiresAt, fingerprint: Array(32).fill('CC').join(':') };
    connection.send(JSON.stringify({ type: 'challenge', proof, signature: await identity.sign(proof), passwordRequired: true }));
  }));
  try {
    await client.connect(signal());
    const watch = parseWatchSession(new URL(freeWatchUrl('http://127.0.0.1:5173/', { id, expiresAt, publicKey: identity.publicKey, accessVersion: 1 })))!;
    await assert.rejects(client.joinSession(watch, signal(), password), /Identidade/);
    assert(!received.some(message => message.type === 'authenticate'));
    assert(!JSON.stringify(received).includes(password));
  } finally { client.disconnect(); host.destroy(); bus.close(); }
});

test('new player keeps the old host join contract for old links', async () => {
  const bus = new PeerTestBus(); const client = provider(bus);
  const identity = await createIdentity(); const id = 'b'.repeat(36); const expiresAt = Date.now() + 10000;
  const factory = await bus.loader(); const host = factory(`dc-${id}`, {});
  let compatible = false;
  host.on('connection', connection => connection.on('data', async raw => {
    const message = JSON.parse(String(raw));
    if (message.type !== 'join') return;
    compatible = Object.keys(message).sort().join(',') === 'nonce,sessionId,type';
    const proof: HostProof = { sessionId: id, viewerId: connection.peer, nonce: message.nonce, expiresAt, fingerprint: Array(32).fill('AA').join(':') };
    connection.send(JSON.stringify({ type: 'welcome', proof, signature: await identity.sign(proof) }));
  }));
  try {
    await client.connect(signal());
    await client.joinSession({ id, publicKey: identity.publicKey, expiresAt }, signal());
    assert(compatible);
  } finally { client.disconnect(); host.destroy(); bus.close(); }
});
