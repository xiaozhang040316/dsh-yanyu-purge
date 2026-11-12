import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { Readable } from 'node:stream';
import { createBalanceService } from '../balance.js';
import { createSessionStore } from '../session-store.js';

const source = fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const instrumented = source.replace('    function useAccount() {', '    globalThis.testAccount = { store: accountStore, card: AccountCard, dock: BalanceDock, panel: AccountPanel };\n    function useAccount() {');
assert.notEqual(instrumented, source);
const key = 'yanyu-purge.account-session.v1';
const fixture = { email: 'client-fixture@example.com', password: 'client-fixture-password' };
const tokens = { access_token: 'client-fixture-access', refresh_token: 'client-fixture-refresh', expires_in: 86400 };
const tick = () => new Promise(resolve => setImmediate(resolve));
async function settle() { for (let i = 0; i < 8; i++) await tick(); }

function clock() {
  let now = 1_800_000_000_000, sequence = 0;
  const timers = new Map();
  return {
    now: () => now,
    setTimeout(fn, delay) { const id = ++sequence; timers.set(id, { fn, due: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    get timers() { return timers.size; },
    async advance(delay) {
      const until = now + delay;
      while (true) {
        const next = [...timers].sort((a, b) => a[1].due - b[1].due).find(([, timer]) => timer.due <= until);
        if (!next) break;
        now = next[1].due; timers.delete(next[0]); next[1].fn(); await settle();
      }
      now = until; await settle();
    }
  };
}
function disk() {
  const data = new Map();
  return { data, getItem: name => data.get(name) ?? null, setItem: (name, value) => data.set(name, value), removeItem: name => data.delete(name) };
}
function events() {
  const handlers = new Map();
  return {
    addEventListener(name, fn) { if (!handlers.has(name)) handlers.set(name, new Set()); handlers.get(name).add(fn); },
    removeEventListener(name, fn) { handlers.get(name)?.delete(fn); },
    emit(name) { for (const fn of handlers.get(name) || []) fn(); }
  };
}
function client(fetch, { protocol = 'dsh-app:', saved = disk(), time = clock() } = {}) {
  const effects = [];
  const React = {
    createElement: (tag, props, ...children) => ({ tag, props: props || {}, children }),
    useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
    useEffect: fn => effects.push(fn), useRef: value => ({ current: value }), useId: () => 'test-id', Fragment: 'fragment'
  };
  const window = { ...events(), location: { protocol }, localStorage: saved, __ModuleLoader__: { load({ factory }) { factory(name => name === 'react' ? React : { createPortal: () => null }); } } };
  const document = { ...events(), hidden: false };
  const context = vm.createContext({ window, document, console, AbortController, Intl, Node: class {}, fetch, setTimeout: time.setTimeout, clearTimeout: time.clearTimeout });
  vm.runInContext(instrumented, context, { filename: 'client.js' });
  const account = context.testAccount;
  function mount(component) {
    effects.length = 0; account[component]();
    const disposers = effects.splice(0).map(effect => effect());
    return () => { for (const dispose of disposers) dispose?.(); };
  }
  return { ...account, time, saved, window, document, mount,
    dockText: () => text(account.dock()), cardText: () => text(account.card({ account: account.store.read() })) };
}
function text(node) {
  if (Array.isArray(node)) return node.map(text).join(' ');
  if (typeof node === 'string') return node;
  return node && typeof node === 'object' ? text(node.children) : '';
}
function nodes(node, predicate) {
  if (!node || typeof node !== 'object') return [];
  const children = Array.isArray(node) ? node : node.children || [];
  return [...(predicate(node) ? [node] : []), ...children.flatMap(child => nodes(child, predicate))];
}
const wire = (value, headers = {}, status = 200) => new Response(JSON.stringify({ ok: true, value }), { status, headers });
const signedOut = { status: 'signed_out', authenticated: false, balance: null, persistent: false, sessionProtocol: 1, refreshAfterMs: 15000 };

function backend(t, { persistent = true } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'yanyu-client-test-'));
  const time = clock(), calls = [], requests = [];
  let balance = 20, service, fail = '', override = null;
  const sessionStore = persistent ? createSessionStore({ directory, now: time.now }) : undefined;
  function start() {
    service = createBalanceService({ sessionStore, now: time.now, fetchImpl: async (url, options) => {
      const pathname = new URL(url).pathname.slice('/api/v1'.length); calls.push(pathname);
      if (override) return override(pathname, options);
      if (fail === 'network') throw new TypeError('Synthetic offline');
      if (fail === 'expired') return new Response('{}', { status: 401 });
      const data = pathname === '/auth/login' || pathname === '/auth/refresh' ? tokens : pathname === '/auth/me' ? { username: 'Client fixture', email: fixture.email, balance } : {};
      return new Response(JSON.stringify({ code: 0, data }), { status: 200 });
    } });
  }
  start();
  t.after(() => { service.dispose(); fs.rmSync(directory, { recursive: true, force: true }); });
  async function fetch(url, options) {
    const pathname = new URL(url, 'dsh-app://app').pathname;
    const headers = new Headers(options.headers);
    // Match the desktop proxy: browser Cookie and Origin are replaced, Set-Cookie is withheld.
    for (const name of ['host', 'origin', 'cookie', 'sec-fetch-site']) headers.delete(name);
    headers.set('host', 'localhost:4321'); headers.set('cookie', 'dsh_host=synthetic-host-cookie');
    requests.push({ path: pathname, method: options.method, headers: Object.fromEntries(headers) });
    const req = Readable.from(options.body ? [Buffer.from(options.body)] : []);
    req.method = options.method; req.headers = Object.fromEntries(headers); req.socket = { encrypted: false };
    const outgoing = new Headers(); let body;
    const res = { statusCode: 0, setHeader(name, value) { outgoing.set(name, value); }, end(value) { body = value; } };
    await service.handle(req, res, pathname.slice('/plugins/yanyu-purge/api'.length), options.method);
    outgoing.delete('set-cookie');
    return new Response(body, { status: res.statusCode, headers: outgoing });
  }
  return { time, calls, requests, fetch,
    setBalance(value) { balance = value; }, fail(value) { fail = value; }, override(fn) { override = fn; },
    restart() { service.dispose(); start(); } };
}

test('legacy desktop host is detected before login; it cannot claim persistent or transient sign-in', async () => {
  let count = 0;
  const legacy = { status: 'signed_out', authenticated: false, balance: null, refreshAfterMs: 15000 };
  const c = client(async () => { count++; return wire(legacy); });
  const unmount = c.mount('dock'); await settle();
  assert.equal(c.store.read().hostNeedsReload, true);
  assert.match(c.store.read().error, /插件后台仍是旧版本/);
  assert.equal(await c.store.run('login', fixture), false); assert.equal(count, 1);
  assert.equal(c.store.read().data, null); assert.doesNotMatch(c.cardText(), /重启后自动恢复/);
  const button = nodes(c.card({ account: c.store.read() }), n => n.tag === 'button' && n.props.type === 'submit')[0];
  assert.equal(button.props.disabled, true);
  unmount();
  const surprise = client(async () => wire({ ...legacy, status: 'signed_in', authenticated: true, balance: 12 }));
  const detach = surprise.mount('dock'); await settle();
  assert.equal(surprise.store.read().data, null); assert.equal(surprise.store.read().hostNeedsReload, true); detach();
});

test('missing desktop handshake cannot report a successful login even with a modern-shaped response', async () => {
  const c = client(async () => wire({ ...signedOut, status: 'signed_in', authenticated: true, balance: 12 }));
  const unmount = c.mount('dock'); await settle();
  assert.equal(c.store.read().data, null); assert.match(c.store.read().error, /登录会话未连接/); assert.equal(c.store.read().hostNeedsReload, true); unmount();
});

test('host compatibility recovers after reload and browser cookie mode remains supported', async () => {
  let modern = false;
  const c = client(async () => wire(modern ? signedOut : { status: 'signed_out', authenticated: false, balance: null }));
  const unmount = c.mount('dock'); await settle(); assert.equal(c.store.read().hostNeedsReload, true);
  modern = true; assert.equal(await c.store.run(), true); assert.equal(c.store.read().hostNeedsReload, false); unmount();
  const browser = client(async (url, options) => {
    assert.equal(options.headers['x-yanyu-session-mode'], undefined); assert.equal(options.credentials, 'same-origin');
    return wire({ status: 'signed_in', authenticated: true, balance: 12 });
  }, { protocol: 'https:' });
  const detach = browser.mount('dock'); await settle(); assert.equal(browser.store.read().data.authenticated, true);
  assert.doesNotMatch(browser.cardText(), /重启后自动恢复/); detach();
});

test('production desktop client logs in once, refreshes manually, then polls while only the closed dock is mounted', async t => {
  const b = backend(t), c = client(b.fetch, { time: b.time });
  const unmount = c.mount('dock'); await settle();
  assert.equal(c.store.read().data.authenticated, false);
  assert.equal(await c.store.run('login', fixture), true);
  assert.equal(c.store.read().data.authenticated, true); assert.match(c.saved.getItem(key), /^[a-f0-9]{64}$/);
  assert.match(c.cardText(), /登录状态已保存在本机/); assert.match(c.dockText(), /\$20\.0000/);
  assert.equal(nodes(c.dock(), n => n.props?.className === 'yy-balance-popover').length, 0);
  b.setBalance(19); await b.time.advance(3000); assert.equal(await c.store.run('refresh'), true);
  assert.equal(c.store.read().data.authenticated, true); assert.match(c.dockText(), /\$19\.0000/);
  const afterManual = b.requests.length; b.setBalance(18);
  await b.time.advance(14999); assert.equal(b.requests.length, afterManual);
  await b.time.advance(1); assert.equal(b.requests.length, afterManual + 1); assert.match(c.dockText(), /\$18\.0000/);
  b.setBalance(17); await b.time.advance(15000); assert.match(c.dockText(), /\$17\.0000/);
  assert.equal(b.calls.filter(p => p === '/auth/login').length, 1);
  assert.ok(b.requests.slice(2).every(r => r.headers['x-yanyu-session'] === c.saved.getItem(key)));
  assert.ok(nodes(c.dock(), n => n.props?.title?.includes('每 15 秒自动检查余额')).length);
  unmount(); assert.equal(b.time.timers, 0);
});

test('workbench-to-conversation unmount/remount shares one session and restarts polling without another login', async t => {
  const b = backend(t), c = client(b.fetch, { time: b.time });
  const leaveWorkbench = c.mount('panel'); await settle(); await c.store.run('login', fixture);
  const id = c.saved.getItem(key); leaveWorkbench(); assert.equal(b.time.timers, 0);
  const leaveConversation = c.mount('dock'); await settle();
  assert.equal(c.store.read().data.authenticated, true); assert.equal(c.saved.getItem(key), id);
  b.setBalance(16); await b.time.advance(15000); assert.match(c.dockText(), /\$16\.0000/);
  assert.equal(b.calls.filter(p => p === '/auth/login').length, 1); leaveConversation();
});

test('fresh renderer and restarted host restore the saved session; persistence copy reflects the backend result', async t => {
  const b = backend(t), saved = disk(), c = client(b.fetch, { time: b.time, saved });
  const unmount = c.mount('dock'); await settle(); await c.store.run('login', fixture); unmount(); b.restart();
  const next = client(b.fetch, { time: b.time, saved }); const detach = next.mount('dock'); await settle();
  assert.equal(next.store.read().data.authenticated, true); assert.match(next.cardText(), /重启后自动恢复/);
  assert.equal(b.calls.filter(p => p === '/auth/login').length, 1); detach();
  const memory = backend(t, { persistent: false }), volatile = client(memory.fetch, { time: memory.time });
  const dispose = volatile.mount('dock'); await settle(); await volatile.store.run('login', fixture);
  assert.equal(volatile.store.read().data.authenticated, true); assert.equal(volatile.store.read().data.persistent, false);
  assert.match(volatile.cardText(), /当前窗口保留/); assert.doesNotMatch(volatile.cardText(), /重启后自动恢复/); dispose();
});

test('temporary refresh failure preserves account and recovers automatically; genuine expiry is shown', async t => {
  const b = backend(t), c = client(b.fetch, { time: b.time }); const unmount = c.mount('dock');
  await settle(); await c.store.run('login', fixture); const id = c.saved.getItem(key);
  b.fail('network'); await b.time.advance(15000);
  assert.equal(c.store.read().data.authenticated, true); assert.equal(c.store.read().data.stale, true); assert.equal(c.saved.getItem(key), id);
  assert.match(c.dockText(), /待更新/);
  b.fail(''); b.setBalance(15); await b.time.advance(30000);
  assert.equal(c.store.read().data.authenticated, true); assert.equal(c.store.read().data.stale, false); assert.match(c.dockText(), /\$15\.0000/);
  b.fail('expired'); await b.time.advance(15000);
  assert.equal(c.store.read().data.authenticated, false); assert.equal(c.store.read().data.status, 'expired');
  assert.match(c.cardText(), /登录已过期/); unmount();
});

test('hidden window defers polling and foreground focus refreshes immediately without login', async t => {
  const b = backend(t), c = client(b.fetch, { time: b.time }); const unmount = c.mount('dock');
  await settle(); await c.store.run('login', fixture); const before = b.requests.length;
  c.document.hidden = true; b.setBalance(14); await b.time.advance(30000); assert.equal(b.requests.length, before);
  c.document.hidden = false; c.window.emit('focus'); await settle(); assert.match(c.dockText(), /\$14\.0000/);
  assert.equal(b.calls.filter(p => p === '/auth/login').length, 1); unmount();
});

test('a late background response after logout cannot restore the session or logged-in view', async t => {
  const b = backend(t); let hold = false, release;
  const c = client(async (url, options) => {
    const response = await b.fetch(url, options);
    if (hold && !url.endsWith('/logout')) { hold = false; return new Promise(resolve => { release = () => resolve(response); }); }
    return response;
  }, { time: b.time });
  const unmount = c.mount('dock'); await settle(); await c.store.run('login', fixture);
  hold = true; const pending = c.store.run(); await settle(); assert.equal(typeof release, 'function');
  assert.equal(await c.store.run('logout'), true); assert.equal(c.saved.getItem(key), null);
  release(); assert.equal(await pending, false); assert.equal(c.store.read().data.authenticated, false); assert.equal(c.saved.getItem(key), null); unmount();
});
