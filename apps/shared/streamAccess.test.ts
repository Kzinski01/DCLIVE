import assert from 'node:assert/strict';
import test from 'node:test';
import { StreamAdmission, randomPassword, validAccess, validPassword, validSettings } from './streamAccess';

test('private verifier rejects missing/wrong passwords and accepts the exact secret', async () => {
  const admission = await StreamAdmission.create({ mode: 'private', password: 'private-fixture-2026' });
  assert.equal(await admission.authenticate(), 'password-required');
  assert.equal(await admission.authenticate('another-fixture'), 'password-invalid');
  assert.equal(await admission.authenticate('private-fixture-2026'), null);
  assert(!JSON.stringify(admission).includes('private-fixture-2026'));
  assert(!validPassword('short')); assert(!validPassword('x'.repeat(129)));
  assert(!validAccess({ mode: 'private' })); assert(!validAccess({ mode: 'link', password: 'secret' }));
});

test('authentication work is bounded across anonymous viewer IDs', async () => {
  const admission = await StreamAdmission.create({ mode: 'private', password: 'fixture-2026-password' });
  const burst = await Promise.all(Array.from({ length: 8 }, () => admission.authenticate('fixture-2026-password')));
  assert.equal(burst.filter(code => code === null).length, 2);
  assert.equal(burst.filter(code => code === 'auth-rate-limit').length, 6);
  for (let i = 0; i < 18; i++) assert.equal(await admission.authenticate('fixture-2026-password'), null);
  assert.equal(await admission.authenticate('fixture-2026-password'), 'auth-rate-limit');
});

test('link mode is explicit and settings/password generation are bounded', async () => {
  assert.equal(await (await StreamAdmission.create({ mode: 'link' })).authenticate(), null);
  const generated = new Set(Array.from({ length: 20 }, randomPassword));
  assert.equal(generated.size, 20); assert([...generated].every(value => /^[a-f0-9]{32}$/.test(value)));
  assert(validSettings({ maxViewers: 4, blocked: true }));
  assert(!validSettings({ maxViewers: 101, blocked: false }));
  assert(!validSettings({ maxViewers: 4, blocked: 'false' }));
});
