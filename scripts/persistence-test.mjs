import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBalanceService } from "../balance.js";
import { createSessionStore } from "../session-store.js";

const DAY = 24 * 60 * 60 * 1000;
const credentials = { email: "persistent-fixture@example.com", password: "persistent-fixture-password" };
const tokens = { access_token: "persistent-fixture-access", refresh_token: "persistent-fixture-refresh", expires_in: 86400 };
const profile = { username: "Persistence fixture", email: credentials.email, balance: 18.765432 };
const response = (data, status = 200) => new Response(JSON.stringify({ code: 0, data }), { status });
const tick = () => new Promise(resolve => setImmediate(resolve));

function harness(t, { wrapStore = value => value } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "yanyu-persistence-test-"));
  let time = 1_800_000_000_000;
  let jar = "";
  let store;
  let service;
  const calls = [];
  let fetcher = path => response(path === "/auth/login" || path === "/auth/refresh" ? tokens : path === "/auth/me" ? profile : {});
  function start() {
    store = createSessionStore({ directory, now: () => time });
    service = createBalanceService({ sessionStore: wrapStore(store), now: () => time, fetchImpl: async (url, options) => {
      assert.ok(url.startsWith("https://yanyuapi.com/api/v1/auth/"));
      const path = url.slice("https://yanyuapi.com/api/v1".length);
      calls.push({ path, options });
      return fetcher(path, options);
    } });
  }
  start();
  t.after(() => { service.dispose(); rmSync(directory, { recursive: true, force: true }); });
  async function request(path = "/account", method = "GET", body, { cookie = jar, remember = true } = {}) {
    const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
    req.method = method;
    req.headers = { host: "localhost:4321", origin: "http://localhost:4321", "x-yanyu-client": "1", "content-type": "application/json", cookie };
    req.socket = { encrypted: false };
    const headers = {};
    let wire;
    const res = { statusCode: 0, setHeader(key, value) { headers[key] = value; }, end(value) { wire = JSON.parse(value); } };
    await service.handle(req, res, path, method);
    if (headers["set-cookie"] && remember) jar = headers["set-cookie"].split(";")[0];
    return { status: res.statusCode, headers, ...wire };
  }
  return {
    directory, calls, request,
    login: () => request("/account/login", "POST", credentials),
    restart() { service.dispose(); start(); },
    advance(ms) { time += ms; },
    fetch(fn) { fetcher = fn; },
    get store() { return store; },
    get cookie() { return jar; },
    get id() { return jar.split("=")[1]; }
  };
}

test("remembered login survives service disposal and restores a freshly queried balance", async t => {
  const h = harness(t);
  const signed = await h.login();
  assert.equal(signed.value.authenticated, true);
  assert.equal(signed.value.persistent, true);
  assert.match(signed.headers["set-cookie"], /Max-Age=2592000(?:;|$)/);
  const cookie = h.cookie;
  h.restart();
  h.fetch((path, options) => {
    assert.equal(path, "/auth/me");
    assert.equal(options.headers.authorization, `Bearer ${tokens.access_token}`);
    return response({ ...profile, balance: 17.25 });
  });
  const restored = await h.request();
  assert.equal(restored.value.authenticated, true);
  assert.equal(restored.value.persistent, true);
  assert.equal(restored.value.displayName, profile.username);
  assert.equal(restored.value.balance, 17.25);
  assert.equal(h.cookie, cookie);
  assert.deepEqual(h.calls.map(call => call.path), ["/auth/login", "/auth/me", "/auth/me"]);
});

test("a browser without the saved cookie cannot inherit another browser's account", async t => {
  const h = harness(t);
  await h.login();
  const cookie = h.cookie;
  h.restart();
  const before = h.calls.length;
  const anonymous = await h.request("/account", "GET", undefined, { cookie: "", remember: false });
  assert.equal(anonymous.value.status, "signed_out");
  assert.equal(anonymous.value.authenticated, false);
  assert.equal(anonymous.value.balance, null);
  assert.equal(h.calls.length, before);
  assert.equal((await h.request("/account", "GET", undefined, { cookie })).value.authenticated, true);
});

test("the persisted cookie lifetime slides with activity and outlasts the old one-day session", async t => {
  const h = harness(t);
  await h.login();
  h.advance(20 * DAY);
  const active = await h.request();
  assert.equal(active.value.authenticated, true);
  assert.match(active.headers["set-cookie"], /Max-Age=2592000(?:;|$)/);
  h.restart();
  h.advance(20 * DAY);
  assert.equal((await h.request()).value.authenticated, true);
});

test("rotated tokens are durable before querying balance and are used after restart", async t => {
  const h = harness(t);
  await h.login();
  h.advance(DAY);
  let rotations = 0;
  h.fetch((path, options) => {
    if (path === "/auth/refresh") {
      assert.equal(JSON.parse(options.body).refresh_token, rotations ? "rotated-fixture-refresh-1" : tokens.refresh_token);
      rotations++;
      return response({ ...tokens, access_token: `rotated-fixture-access-${rotations}`, refresh_token: `rotated-fixture-refresh-${rotations}` });
    }
    assert.equal(path, "/auth/me");
    const saved = h.store.read(h.id);
    assert.equal(saved.refresh, `rotated-fixture-refresh-${rotations}`);
    assert.equal(saved.access, `rotated-fixture-access-${rotations}`);
    assert.equal(options.headers.authorization, `Bearer rotated-fixture-access-${rotations}`);
    return response(profile);
  });
  const first = await h.request();
  assert.equal(first.value.authenticated, true);
  assert.equal(first.value.stale, false);
  assert.equal(h.store.read(h.id).refresh, "rotated-fixture-refresh-1");
  h.restart();
  h.advance(DAY);
  const second = await h.request();
  assert.equal(second.value.authenticated, true);
  assert.equal(second.value.stale, false);
  assert.equal(h.store.read(h.id).refresh, "rotated-fixture-refresh-2");
  assert.equal(rotations, 2);
});

test("logout removes the remembered account even when a pending balance request finishes late", async t => {
  const h = harness(t);
  await h.login();
  const cookie = h.cookie;
  const id = h.id;
  h.advance(15000);
  let resolve;
  h.fetch(path => path === "/auth/me" ? new Promise(done => { resolve = done; }) : response({}));
  const pending = h.request("/account", "GET");
  await tick();
  const logout = await h.request("/account/logout", "POST", {});
  assert.equal(logout.value.authenticated, false);
  assert.match(logout.headers["set-cookie"], /Max-Age=0(?:;|$)/);
  assert.equal(h.store.read(id), null);
  resolve(response({ ...profile, balance: 999 }));
  const delayed = await pending;
  assert.equal(delayed.value.authenticated, false);
  assert.equal(delayed.headers["set-cookie"], undefined, "a late response must not restore the logged-out cookie");
  assert.equal(h.cookie, "yanyu_balance_session=");
  h.restart();
  const before = h.calls.length;
  const restored = await h.request("/account", "GET", undefined, { cookie });
  assert.equal(restored.value.authenticated, false);
  assert.equal(restored.value.balance, null);
  assert.equal(h.calls.length, before);
  assert.equal(h.store.read(id), null);
});

test("an invalid refresh deletes the remembered credentials and stays expired after restart", async t => {
  const h = harness(t);
  await h.login();
  const id = h.id;
  h.restart();
  h.advance(DAY);
  h.fetch(() => response({}, 401));
  const expired = await h.request();
  assert.equal(expired.value.status, "expired");
  assert.equal(expired.value.authenticated, false);
  assert.equal(expired.value.balance, null);
  assert.equal(h.store.read(id), null);
  h.restart();
  const before = h.calls.length;
  assert.equal((await h.request()).value.authenticated, false);
  assert.equal(h.calls.length, before);
});

test("logout during a new login prevents late tokens from recreating the saved account", async t => {
  const h = harness(t);
  await h.login();
  const cookie = h.cookie;
  const id = h.id;
  h.advance(2000);
  let resolve;
  h.fetch(path => path === "/auth/login" ? new Promise(done => { resolve = done; }) : response({}));
  const pending = h.login();
  await tick();
  await h.request("/account/logout", "POST", {});
  resolve(response(tokens));
  assert.equal((await pending).error.code, "SESSION_CHANGED");
  assert.equal(h.store.read(id), null);
  h.restart();
  assert.equal((await h.request("/account", "GET", undefined, { cookie })).value.authenticated, false);
});

test("a saved account expires after thirty days without activity", async t => {
  const h = harness(t);
  await h.login();
  const id = h.id;
  h.restart();
  h.advance(30 * DAY);
  const before = h.calls.length;
  const expired = await h.request();
  assert.equal(expired.value.authenticated, false);
  assert.equal(expired.value.balance, null);
  assert.equal(h.calls.length, before);
  assert.equal(h.store.read(id), null);
});

test("corrupt saved state does not recover a stale identity or call upstream", async t => {
  const h = harness(t);
  await h.login();
  const files = readdirSync(h.directory).filter(name => name.endsWith(".json"));
  assert.equal(files.length, 1);
  writeFileSync(join(h.directory, files[0]), "{corrupted fixture");
  h.restart();
  const before = h.calls.length;
  const restored = await h.request();
  assert.equal(restored.status, 200);
  assert.equal(restored.value.authenticated, false);
  assert.equal(restored.value.displayName, "");
  assert.equal(restored.value.balance, null);
  assert.equal(h.calls.length, before);
});

test("network loss during restore keeps the last balance visibly stale", async t => {
  const h = harness(t);
  await h.login();
  h.restart();
  h.fetch(() => { throw new Error("synthetic offline fixture"); });
  const restored = await h.request();
  assert.equal(restored.value.authenticated, true);
  assert.equal(restored.value.persistent, true);
  assert.equal(restored.value.balance, profile.balance);
  assert.equal(restored.value.stale, true);
  assert.ok(restored.value.message);
});

test("passwords and two-factor challenges are never remembered; successful grants are encrypted", async t => {
  const h = harness(t);
  const temporary = "persistent-fixture-two-factor-secret";
  h.fetch(path => response(path === "/auth/login" ? { requires_2fa: true, temp_token: temporary } : path === "/auth/login/2fa" ? tokens : profile));
  assert.equal((await h.login()).value.requires2fa, true);
  assert.equal(h.store.read(h.id), null);
  h.restart();
  assert.equal((await h.request()).value.requires2fa, false);
  await h.login();
  h.advance(2000);
  const signed = await h.request("/account/2fa", "POST", { code: "654321" });
  assert.equal(signed.value.authenticated, true);
  const record = h.store.read(h.id);
  assert.ok(record);
  assert.ok(!/password|temporary|temp_token|654321/.test(JSON.stringify(record)));
  const files = readdirSync(h.directory).filter(name => name.endsWith(".json"));
  assert.equal(files.length, 1);
  const stored = readFileSync(join(h.directory, files[0]), "utf8");
  for (const secret of [credentials.password, tokens.access_token, tokens.refresh_token, temporary, h.id]) assert.ok(!stored.includes(secret));
  assert.ok(!JSON.stringify(signed).includes(tokens.access_token));
});

test("a save failure keeps a usable login but reports that it was not persisted", async t => {
  const h = harness(t, { wrapStore: store => ({ ...store, write() { throw new Error("synthetic disk write failure"); } }) });
  const signed = await h.login();
  assert.equal(signed.status, 200);
  assert.equal(signed.value.authenticated, true);
  assert.equal(signed.value.balance, profile.balance);
  assert.equal(signed.value.persistent, false);
  assert.match(signed.value.message, /保存失败/);
  assert.ok(!JSON.stringify(signed).includes("synthetic disk"));
  h.restart();
  assert.equal((await h.request()).value.authenticated, false);
});

test("failed disk deletion preserves the account and cookie so logout can be retried", async t => {
  let failRemoval = false;
  const h = harness(t, { wrapStore: store => ({ ...store, remove(id) {
    if (failRemoval) throw new Error("synthetic remove permission failure");
    store.remove(id);
  } }) });
  await h.login();
  const cookie = h.cookie;
  const id = h.id;
  failRemoval = true;
  const failed = await h.request("/account/logout", "POST", {});
  assert.equal(failed.status, 503);
  assert.equal(failed.error.code, "SESSION_STORAGE_ERROR");
  assert.equal(failed.headers["set-cookie"], undefined);
  assert.equal(h.cookie, cookie);
  assert.equal(h.store.read(id).refresh, tokens.refresh_token);
  assert.equal((await h.request()).value.authenticated, true);
  assert.equal(h.calls.some(call => call.path === "/auth/logout"), false);
  assert.ok(!JSON.stringify(failed).includes("synthetic remove"));

  failRemoval = false;
  const retried = await h.request("/account/logout", "POST", {});
  assert.equal(retried.status, 200);
  assert.equal(retried.value.authenticated, false);
  assert.match(retried.headers["set-cookie"], /Max-Age=0(?:;|$)/);
  assert.equal(h.store.read(id), null);
  h.restart();
  assert.equal((await h.request("/account", "GET", undefined, { cookie })).value.authenticated, false);
});

test("replacement login does not discard the prior account when disk deletion fails", async t => {
  let failRemoval = false;
  const h = harness(t, { wrapStore: store => ({ ...store, remove(id) {
    if (failRemoval) throw new Error("synthetic replacement cleanup failure");
    store.remove(id);
  } }) });
  await h.login();
  const cookie = h.cookie;
  const id = h.id;
  h.advance(2000);
  failRemoval = true;
  const before = h.calls.length;
  const replacement = { email: "replacement@example.com", password: "replacement-fixture-password" };
  const failed = await h.request("/account/login", "POST", replacement);
  assert.equal(failed.status, 503);
  assert.equal(failed.error.code, "SESSION_STORAGE_ERROR");
  assert.equal(failed.headers["set-cookie"], undefined);
  assert.equal(h.calls.length, before, "replacement credentials must not reach upstream until prior state can be removed");
  assert.equal(h.cookie, cookie);
  const current = await h.request();
  assert.equal(current.value.authenticated, true);
  assert.equal(current.value.displayName, profile.username);
  assert.equal(current.value.balance, profile.balance);
  assert.equal(h.store.read(id).access, tokens.access_token);

  h.restart();
  assert.equal((await h.request()).value.displayName, profile.username);
  failRemoval = false;
  h.fetch(path => response(path === "/auth/login" ? { ...tokens, access_token: "replacement-fixture-access" } : { ...profile, username: "Replacement", email: replacement.email, balance: 5 }));
  const retried = await h.request("/account/login", "POST", replacement);
  assert.equal(retried.status, 200);
  assert.equal(retried.value.displayName, "Replacement");
  assert.equal(retried.value.balance, 5);
  assert.equal(h.store.read(id).access, "replacement-fixture-access");
});
