import assert from 'node:assert/strict';
import { setImmediate as nextTurn } from 'node:timers/promises';
import test from 'node:test';
import { FreeSignalingProvider } from './FreeSignalingProvider';
import { CloudConnection } from './CloudConnection';
import { PeerTestBus } from './testPeer';
import { parseWatchSession, type WatchSession } from '../../../shared/freeConfiguration';
import type { ProviderEvent } from './types';
import { SERVICE_UNAVAILABLE } from '../../../shared/service';

const signal = () => new AbortController().signal;
const provider = (bus: PeerTestBus, lifetimeMs?: number) => new FreeSignalingProvider({ playerUrl: 'http://127.0.0.1:5173/', allowLocalPlayer: true, peerLoader: bus.loader, lifetimeMs });

test('unavailable public player reports the connection error before registering a Cloud session', async context => {
  const bus = new PeerTestBus();
  const host = new FreeSignalingProvider({ playerUrl: 'https://kzinski01.github.io/DCLIVE/', peerLoader: bus.loader });
  context.mock.method(globalThis, 'fetch', async () => { throw new TypeError('Network request failed'); });
  try {
    await assert.rejects(host.connect(signal()), { message: SERVICE_UNAVAILABLE });
    assert.equal(bus.options.length, 0);
    await assert.rejects(host.createSession(4, signal()), { message: SERVICE_UNAVAILABLE });
  } finally { host.disconnect(); bus.close(); }
});

async function session(bus: PeerTestBus, maxViewers = 4, lifetimeMs?: number) {
  const host = provider(bus, lifetimeMs);
  await host.connect(signal());
  const created = await host.createSession(maxViewers, signal(), { mode: 'link' });
  const watch = parseWatchSession(new URL(created.playerUrl));
  assert(watch);
  return { host, created, watch };
}

async function viewer(bus: PeerTestBus, watch: WatchSession) {
  const instance = provider(bus);
  await instance.connect(signal());
  const joined = await instance.joinSession(watch, signal());
  return { instance, joined };
}

test('free provider retries a collision and uses explicit STUN with no TURN', async () => {
  const bus = new PeerTestBus(); bus.collideFirst = true;
  const { host, created } = await session(bus);
  try {
    assert.match(created.sessionId, /^[a-f0-9]{36}$/);
    assert(!created.playerUrl.includes(created.controlToken));
    assert.equal(bus.options.length, 2);
    assert(!JSON.stringify(bus.options).includes('turn:'));
    assert.match(JSON.stringify(bus.options), /stun:stun.l.google.com/);
    assert.throws(() => host.endSession(created.sessionId), /autorizado/);
  } finally { host.disconnect(); bus.close(); }
});

test('authenticates join, exchanges media SDP/ICE and closes viewers on authorized stop', async () => {
  const bus = new PeerTestBus();
  const { host, created, watch } = await session(bus);
  const events: ProviderEvent[] = [];
  host.onMessage = message => events.push(message);
  const { instance, joined } = await viewer(bus, watch);
  const received: ProviderEvent[] = [];
  instance.onMessage = message => received.push(message);
  try {
    instance.sendSignal(joined.peerId, { description: { type: 'offer', sdp: 'v=0' } });
    instance.sendSignal(joined.peerId, { candidate: { candidate: 'candidate:1', sdpMid: '0', sdpMLineIndex: 0 } });
    await nextTurn();
    assert.equal(events.filter(event => event.type === 'signal').length, 2);
    assert(events.some(event => event.type === 'viewer-joined'));
    host.sendSignal(joined.peerId, { description: { type: 'answer', sdp: 'v=0' } });
    await nextTurn();
    assert(received.some(event => event.type === 'signal'));
    host.endSession(created.controlToken);
    await nextTurn();
    assert(received.some(event => event.type === 'session-ended'));
  } finally { host.disconnect(); instance.disconnect(); bus.close(); }
});

test('viewer cannot send a stop command or bypass the viewer cap', async () => {
  const bus = new PeerTestBus();
  const { host, watch } = await session(bus, 1);
  const first = await viewer(bus, watch);
  const extra = provider(bus);
  try {
    await extra.connect(signal());
    await assert.rejects(extra.joinSession(watch, signal()), /session-full/);
    bus.connection(first.joined.peerId).send(JSON.stringify({ type: 'ended' }));
    await nextTurn();
    const next = await viewer(bus, watch);
    next.instance.disconnect();
  } finally { first.instance.disconnect(); extra.disconnect(); host.disconnect(); bus.close(); }
});

test('expires the free session and rejects a changed identity', async () => {
  const bus = new PeerTestBus();
  const first = await session(bus);
  const malicious = provider(bus);
  try {
    await malicious.connect(signal());
    await assert.rejects(malicious.joinSession({ ...first.watch, publicKey: 'a'.repeat(87) }, signal()), /link-invalid/);
  } finally { malicious.disconnect(); first.host.disconnect(); }
  const expired = await session(bus, 1, 20);
  const client = provider(bus);
  try {
    await new Promise(resolve => setTimeout(resolve, 25));
    await client.connect(signal());
    await assert.rejects(client.joinSession(expired.watch, signal()), /session-unavailable/);
  } finally { client.disconnect(); expired.host.disconnect(); bus.close(); }
});

test('reconnects to the same provider and ID without migrating to another service', async context => {
  const bus = new PeerTestBus();
  const cloud = new CloudConnection(bus.loader);
  const states: string[] = [];
  cloud.onStatus = state => states.push(state);
  await cloud.connect(signal());
  const id = cloud.sessionId;
  context.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    bus.peers.get(`dc-${id}`)?.disconnect();
    context.mock.timers.tick(2000);
    await nextTurn();
    assert(states.includes('reconnecting'));
    assert.equal(states.at(-1), 'connected');
    assert.equal(cloud.sessionId, id);
    assert.equal(bus.options.length, 1);
  } finally { cloud.disconnect(); bus.close(); context.mock.timers.reset(); }
});
