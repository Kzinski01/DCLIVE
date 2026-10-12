import assert from 'node:assert/strict';
import test from 'node:test';
import { parseServiceManifest, serviceOrigin, validateSessionUrl } from './service';

test('production rejects unconfigured, reserved and insecure origins', () => {
  for (const origin of ['', 'https://live.example.com', 'http://stream.fixture.dev', 'https://127.0.0.1', 'https://tauri.localhost', 'https://192.168.1.10', 'https://stream.fixture.dev/path']) {
    assert.throws(() => serviceOrigin(origin));
  }
  assert.equal(serviceOrigin('https://stream.fixture.dev'), 'https://stream.fixture.dev');
  assert.equal(serviceOrigin('http://127.0.0.1:8787', true), 'http://127.0.0.1:8787');
});

test('service discovery and session URL must agree with the configured service', () => {
  const origin = 'https://stream.fixture.dev';
  const manifest = { protocolVersion: 1, mode: 'public', playerOrigin: origin, signalingUrl: 'wss://stream.fixture.dev/ws' };
  assert.deepEqual(parseServiceManifest(manifest, origin), manifest);
  assert.throws(() => parseServiceManifest({ ...manifest, signalingUrl: 'wss://other.fixture.dev/ws' }, origin));
  assert.throws(() => parseServiceManifest({ ...manifest, mode: 'development' }, origin));
  const id = 'a'.repeat(24);
  assert.equal(validateSessionUrl(`${origin}/s/${id}`, id, origin), `${origin}/s/${id}`);
  assert.throws(() => validateSessionUrl(`https://other.fixture.dev/s/${id}`, id, origin));
  assert.throws(() => validateSessionUrl(`${origin}/s/guessable`, 'guessable', origin));
});
