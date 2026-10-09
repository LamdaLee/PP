import { test } from 'node:test';
import assert from 'node:assert/strict';
import { realtimeSubscription } from '../lib/realtime-subscription.mjs';

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
function client({ sessionGate, authGate, userId = 'owner' } = {}) {
  const calls = { channels: [], removed: [], tokens: [] };
  const db = {
    auth: { getSession: async () => sessionGate ? sessionGate.promise : { data: { session: { user: { id: userId }, access_token: 'test-token' } } } },
    realtime: { setAuth: async (token) => { calls.tokens.push(token); if (authGate) await authGate.promise; } },
    channel(name) {
      const ch = {
        name, handlers: [],
        on(event, filter, callback) { this.handlers.push({ event, filter, callback }); return this; },
        subscribe(callback) { this.status = callback; return this; },
      };
      calls.channels.push(ch);return ch;
    },
    async removeChannel(ch) { calls.removed.push(ch); },
  };
  return { db, calls };
}
function start(db, extra = {}) {
  return realtimeSubscription({ client: db, userId: 'owner', name: 'account-owner', tables: ['memos','entries'], onChange() {}, ...extra });
}
test('cleanup during pending session lookup never creates a late channel', async () => {
  const gate = deferred(), { db, calls } = client({ sessionGate: gate });
  const sub = start(db);
  await sub.dispose();
  gate.resolve({ data: { session: { user: { id: 'owner' }, access_token: 'old' } } });
  await sub.ready;
  assert.equal(calls.channels.length, 0);
  assert.equal(calls.tokens.length, 0);
});
test('cleanup during token authentication prevents the reported post-cleanup subscription race', async () => {
  const gate = deferred(), { db, calls } = client({ authGate: gate });
  const sub = start(db);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.tokens.length, 1);
  await sub.dispose();gate.resolve();await sub.ready;
  assert.equal(calls.channels.length, 0);
});
test('account mismatch does not subscribe to the replacement user', async () => {
  const { db, calls } = client({ userId: 'other' });
  await start(db).ready;
  assert.equal(calls.tokens.length, 0);
  assert.equal(calls.channels.length, 0);
});
test('one channel watches all owner tables and cleanup suppresses stale events', async () => {
  const { db, calls } = client();let changes = 0, statuses = 0;
  const sub = start(db, { onChange: () => changes++, onStatus: () => statuses++ });
  await sub.ready;
  assert.equal(calls.channels.length, 1);
  const ch = calls.channels[0];
  assert.deepEqual(ch.handlers.map(h => h.filter), ['memos','entries'].map(table => ({event:'*',schema:'public',table,filter:'user_id=eq.owner'})));
  ch.status('SUBSCRIBED');ch.handlers[0].callback();
  assert.equal(changes, 1);assert.equal(statuses, 1);
  await sub.dispose();await sub.dispose();
  ch.status('CHANNEL_ERROR');ch.handlers[0].callback();
  assert.equal(changes, 1);assert.equal(statuses, 1);
  assert.equal(calls.removed.length, 1);
});
test('strict-mode mount, cleanup and remount leave only the new subscription', async () => {
  const gate = deferred(), { db, calls } = client({ authGate: gate });
  const old = start(db);await new Promise(resolve => setImmediate(resolve));
  await old.dispose();const current = start(db);
  gate.resolve();await Promise.all([old.ready,current.ready]);
  assert.equal(calls.channels.length, 1);
  await current.dispose();assert.equal(calls.removed.length, 1);
});
