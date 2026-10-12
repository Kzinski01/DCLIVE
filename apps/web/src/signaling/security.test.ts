import assert from 'node:assert/strict';
import test from 'node:test';
import { createIdentity, verifyIdentity, type HostProof } from './sessionIdentity';
import { parseControlMessage } from './controlProtocol';
import { playerBaseUrl, freeWatchUrl, parseWatchSession } from '../../../shared/freeConfiguration';

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
