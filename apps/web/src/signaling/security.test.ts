import assert from 'node:assert/strict';
import test from 'node:test';
import { createIdentity, verifyIdentity, type HostProof } from './sessionIdentity';
import { parseControlMessage } from './controlProtocol';
import { playerBaseUrl, freeWatchUrl, parseWatchSession } from '../../../shared/freeConfiguration';
import { validSignal } from '../../../shared/signaling';
import { parseServerMessage } from '../serverMessages';
import { ControlChannel } from './ControlChannel';
import { EventEmitter } from 'node:events';
import type { DataConnection } from 'peerjs';

test('host proof binds session, viewer, nonce, expiry and DTLS identity', async () => {
  const identity = await createIdentity();
  const proof: HostProof = { sessionId: 'a'.repeat(36), viewerId: 'viewer', nonce: 'b'.repeat(64), expiresAt: Date.now() + 10000, fingerprint: 'AA' };
  const signed = await identity.sign(proof);
  assert(await verifyIdentity(identity.publicKey, proof, signed));
  for (const tampered of [{ ...proof, nonce: 'other' }, { ...proof, viewerId: 'intruder' }, { ...proof, fingerprint: 'BB' }, { ...proof, expiresAt: proof.expiresAt + 1000 }]) {
    assert(!await verifyIdentity(identity.publicKey, tampered, signed));
  }
});

test('rejects oversized payload, unsupported control and malformed SDP/ICE', () => {
  assert.equal(parseControlMessage('x'.repeat(72 * 1024)), null);
  assert.equal(parseControlMessage(JSON.stringify({ type: 'stop', controlToken: 'public-id' })), null);
  assert.equal(parseControlMessage(JSON.stringify({ type: 'signal', data: { description: { type: 'offer', sdp: 'x'.repeat(64001) } } })), null);
  assert.equal(parseControlMessage(JSON.stringify({ type: 'signal', data: { candidate: { candidate: 'x', sdpMid: {}, sdpMLineIndex: 'invalid' } } })), null);
});

test('Pages subdirectory link roundtrips with public identity and rejects incomplete links', async () => {
  const base = playerBaseUrl('https://kzinski01.github.io/DCLIVE/');
  const identity = await createIdentity();
  const watch = { id: 'a'.repeat(36), publicKey: identity.publicKey, expiresAt: Date.now() + 10000 };
  const url = freeWatchUrl(base, watch);
  assert(url.startsWith('https://kzinski01.github.io/DCLIVE/?watch='));
  assert.deepEqual(parseWatchSession(new URL(url)), watch);
  assert.throws(() => parseWatchSession(new URL(`${base}?watch=${watch.id}`)));
  assert.throws(() => playerBaseUrl('https://live.example.com/'));
  assert.throws(() => playerBaseUrl('http://127.0.0.1:5173/'));
});

test('rejects ambiguous or malformed signaling while accepting browser ICE JSON', () => {
  const candidate = { candidate: 'candidate:1', sdpMid: '0', sdpMLineIndex: 0, usernameFragment: 'browser-ufrag' };
  assert(validSignal({ candidate }));
  for (const invalid of [
    { description: { type: 'offer', sdp: 'v=0' }, candidate },
    { candidate: { ...candidate, sdpMLineIndex: -1 } },
    { candidate: { ...candidate, sdpMLineIndex: 65536 } },
    { candidate: { ...candidate, usernameFragment: 'x'.repeat(257) } },
    { description: { type: 'answer', sdp: 'é'.repeat(40000) } },
  ]) assert.equal(validSignal(invalid), false);
  assert.equal(parseControlMessage(JSON.stringify({ type: 'ended', administrative: true })), null);
  assert.equal(parseServerMessage(JSON.stringify({ type: 'viewer-count', count: -1 })), null);
  assert.equal(parseServerMessage(JSON.stringify({ type: 'unknown' })), null);
  assert.equal(parseServerMessage(JSON.stringify({ type: 'created', controlToken: 'bad' })), null);
});

test('rejects duplicate link parameters and expiry values that overflow browser timers', async () => {
  const base = 'https://kzinski01.github.io/DCLIVE/';
  const identity = await createIdentity();
  const original = freeWatchUrl(base, { id: 'a'.repeat(36), publicKey: identity.publicKey, expiresAt: Date.now() + 10000 });
  const duplicate = new URL(original); duplicate.searchParams.append('watch', 'b'.repeat(36));
  assert.throws(() => parseWatchSession(duplicate));
  const overflow = new URL(original); overflow.searchParams.set('expires', String(Number.MAX_SAFE_INTEGER));
  assert.throws(() => parseWatchSession(overflow));
  const duplicateKey = new URL(original); duplicateKey.hash += `&key=${identity.publicKey}`;
  assert.throws(() => parseWatchSession(duplicateKey));
  assert.throws(() => playerBaseUrl(`${base}%2fother/`));
});

test('control channel closes once and cleans up even if the transport never opened', () => {
  const connection = Object.assign(new EventEmitter(), { open: false, close: () => {}, dataChannel: { bufferedAmount: 0 } });
  let closed = 0;
  const channel = new ControlChannel(connection as unknown as DataConnection, () => {}, () => { closed++; });
  channel.close(); channel.close(); connection.emit('close'); connection.emit('error', new Error('Closed'));
  assert.equal(closed, 1);
});

test('unauthenticated channels expire even when they answer heartbeats', context => {
  let now = 0;
  context.mock.method(Date, 'now', () => now);
  context.mock.timers.enable({ apis: ['setInterval'] });
  const connection = Object.assign(new EventEmitter(), { open: true, close: () => {}, send: () => {}, dataChannel: { bufferedAmount: 0 } });
  let closed = 0;
  const channel = new ControlChannel(connection as unknown as DataConnection, () => {}, () => { closed++; });
  try {
    for (let i = 0; i < 4; i++) { now += 5000; connection.emit('data', JSON.stringify({ type: 'pong' })); context.mock.timers.tick(5000); }
    assert.equal(closed, 1);
  } finally { channel.close(); context.mock.timers.reset(); }
});
