import test from 'node:test';
import assert from 'node:assert/strict';
import { requestIdentity, checkWriteOrigin } from '../lib/browser-identity.mjs';

const origin = 'https://bid.example';
const req = (headers = {}, method = 'GET') => new Request(origin + '/api/bootstrap', { method, headers });
const cookie = identity => identity.setCookie.split(';')[0];

test('anonymous visits get independent, persistent identities without exposing the cookie secret', async () => {
  const first = await requestIdentity(req()), other = await requestIdentity(req());
  assert.notEqual(first.userId, other.userId);
  assert.equal((await requestIdentity(req({ cookie: cookie(first) }))).userId, first.userId);
  assert.equal((await requestIdentity(req({ cookie: cookie(first) }, 'POST'))).userId, first.userId);
  assert(!first.userId.includes(cookie(first).split('=')[1]));
  assert.match(first.setCookie, /^__Host-bid-compass-browser=/);
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=31536000']) assert(first.setCookie.includes(flag));
});

test('existing accounts retain their original owner ID and take precedence over browser cookies', async () => {
  const guest = await requestIdentity(req());
  const account = { userId: 'existing-account', displayName: 'Owner' };
  const identity = await requestIdentity(req({ cookie: cookie(guest) }), account);
  assert.equal(identity.userId, account.userId);
  assert.equal(identity.isGuest, false);
  assert.equal(identity.setCookie, null);
});

test('missing, malformed and ambiguous browser cookies cannot authorize writes', async () => {
  for (const value of ['', '__Host-bid-compass-browser=existing-account', '__Host-bid-compass-browser=%E0%A4%A']) {
    await assert.rejects(requestIdentity(req({ cookie: value }, 'POST')), { code: 'BROWSER_STORAGE_REQUIRED' });
  }
  const guest = await requestIdentity(req());
  await assert.rejects(requestIdentity(req({ cookie: cookie(guest) + '; ' + cookie(guest) }, 'POST')), { code: 'BROWSER_STORAGE_REQUIRED' });
});

test('foreign-site and missing-origin writes are rejected before authorization', () => {
  assert.doesNotThrow(() => checkWriteOrigin(req({ origin }, 'POST')));
  for (const headers of [{}, { origin: 'https://other.example' }, { origin, 'sec-fetch-site': 'cross-site' }]) {
    assert.throws(() => checkWriteOrigin(req(headers, 'POST')), { code: 'INVALID_ORIGIN' });
  }
});
