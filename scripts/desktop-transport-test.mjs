import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBalanceService } from "../balance.js";
import { createSessionStore } from "../session-store.js";

const fixture = { email: "desktop-fixture@example.com", password: "desktop-fixture-password" };
const tokens = { access_token: "desktop-fixture-access", refresh_token: "desktop-fixture-refresh", expires_in: 86400 };
const profile = { username: "Desktop fixture", email: fixture.email, balance: 13.75 };
const response = (data, status = 200) => new Response(JSON.stringify({ code: 0, data }), { status });
const tick = () => new Promise(resolve => setImmediate(resolve));

// Reproduce the installed DSH 0.2.1-rc.2 desktop proxy's header transformations.
// Evidence: app.asar/lib/main.js:8243-8255 and :8268-8298. The production
// balance service handles these requests; no real desktop credentials are read.
async function desktopProxy(request, service, forwarded) {
  const source = new URL(request.url);
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== "dsh-app://app") return new Response(null, { status: 403 });
  const headers = new Headers(request.headers);
  for (const name of ["host", "origin", "cookie", "sec-fetch-site"]) headers.delete(name);
  headers.set("cookie", "dsh_host=synthetic-host-cookie");
  headers.set("host", "localhost:4321");
  forwarded.push(Object.fromEntries(headers));
  const req = Readable.from(request.body ? [Buffer.from(await request.arrayBuffer())] : []);
  req.headers = Object.fromEntries(headers);
  req.method = request.method;
  req.socket = { encrypted: false };
  const outgoing = new Headers();
  let wire;
  const res = { statusCode: 0, setHeader(name, value) { outgoing.set(name, value); }, end(value) { wire = value; } };
  await service.handle(req, res, source.pathname.slice("/plugins/yanyu-purge/api".length), request.method);
  for (const name of ["set-cookie", "content-encoding", "content-length", "transfer-encoding", "connection", "keep-alive", "te", "trailer", "upgrade", "proxy-authenticate", "proxy-authorization"]) outgoing.delete(name);
  outgoing.set("cache-control", "no-store");
  return new Response(wire, { status: res.statusCode, headers: outgoing });
}

function harness(t) {
  const directory = mkdtempSync(join(tmpdir(), "yanyu-desktop-test-"));
  let now = 1_800_000_000_000;
  let handle = "";
  let service;
  let fetcher = path => response(path === "/auth/login" || path === "/auth/refresh" ? tokens : path === "/auth/me" ? profile : {});
  const calls = [];
  const forwarded = [];
  const store = createSessionStore({ directory, now: () => now });
  function start() {
    service = createBalanceService({ sessionStore: store, now: () => now, fetchImpl: async (url, options) => {
      const path = new URL(url).pathname.slice("/api/v1".length);
      calls.push(path);
      return fetcher(path, options);
    } });
  }
  start();
  t.after(() => { service.dispose(); rmSync(directory, { recursive: true, force: true }); });
  async function request(action = "", body, options = {}) {
    const headers = new Headers({ "x-yanyu-client": "1", "content-type": "application/json", origin: "dsh-app://app", cookie: "yanyu_balance_session=" + "11".repeat(32) });
    if (options.mode !== "cookie") {
      headers.set("x-yanyu-session-mode", "header");
      const supplied = options.handle ?? handle;
      if (supplied) headers.set("x-yanyu-session", supplied);
    }
    for (const [key, value] of Object.entries(options.headers || {})) headers.set(key, value);
    const req = new Request(`dsh-app://app/plugins/yanyu-purge/api/account${action ? "/" + action : ""}`, { method: body === undefined ? "GET" : "POST", headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const result = await desktopProxy(req, service, forwarded);
    const next = result.headers.get("x-yanyu-session");
    if (next !== null && options.remember !== false) handle = next;
    return { status: result.status, headers: result.headers, ...(result.status === 403 ? {} : await result.json()) };
  }
  return { request, store, calls, forwarded, login: () => request("login", fixture),
    restart() { service.dispose(); start(); },
    advance(ms) { now += ms; },
    fetch(fn) { fetcher = fn; },
    get handle() { return handle; } };
}

test("the desktop proxy strips both directions of ordinary plugin cookies", async t => {
  const h = harness(t);
  const login = await h.request("login", fixture, { mode: "cookie" });
  assert.equal(login.value.authenticated, true);
  assert.equal(login.headers.get("set-cookie"), null);
  assert.equal(login.headers.get("x-yanyu-session"), null);
  const subsequent = await h.request("", undefined, { mode: "cookie" });
  assert.equal(subsequent.value.authenticated, false);
  assert.equal(h.forwarded[0].cookie, "dsh_host=synthetic-host-cookie");
  assert.equal(h.forwarded[0].origin, undefined);
});

test("desktop session headers survive the proxy and restore after a host restart", async t => {
  const h = harness(t);
  const login = await h.login();
  assert.equal(login.value.authenticated, true);
  assert.equal(login.value.persistent, true);
  assert.match(h.handle, /^[a-f0-9]{64}$/);
  assert.equal(login.headers.get("set-cookie"), null);
  const id = h.handle;
  h.restart();
  const restored = await h.request();
  assert.equal(restored.value.authenticated, true);
  assert.equal(restored.value.balance, profile.balance);
  assert.equal(h.handle, id);
  assert.equal(h.forwarded.at(-1)["x-yanyu-session"], id);
  assert.equal(h.forwarded.at(-1)["x-yanyu-session-mode"], "header");
  assert.deepEqual(h.calls, ["/auth/login", "/auth/me", "/auth/me"]);
  const browserWire = JSON.stringify({ value: restored.value, headers: Object.fromEntries(restored.headers) });
  for (const secret of [fixture.password, tokens.access_token, tokens.refresh_token]) assert.ok(!browserWire.includes(secret));
});

test("desktop header sessions remain isolated from an empty or unrelated saved handle", async t => {
  const h = harness(t);
  await h.login();
  h.restart();
  const before = h.calls.length;
  for (const handle of ["", "22".repeat(32), "malformed-fixture"]) {
    const lookup = await h.request("", undefined, { handle, remember: false });
    assert.equal(lookup.value.authenticated, false);
    assert.equal(lookup.value.balance, null);
  }
  assert.equal(h.calls.length, before);
  assert.equal((await h.request()).value.authenticated, true);
});

test("desktop two-factor login retains its opaque handle and remembers only the finished grant", async t => {
  const h = harness(t);
  h.fetch(path => response(path === "/auth/login" ? { requires_2fa: true, temp_token: "desktop-fixture-2fa-secret" } : path === "/auth/login/2fa" ? tokens : profile));
  const pending = await h.login();
  assert.equal(pending.value.requires2fa, true);
  assert.match(h.handle, /^[a-f0-9]{64}$/);
  assert.equal(h.store.read(h.handle), null);
  h.advance(2000);
  const signed = await h.request("2fa", { code: "654321" });
  assert.equal(signed.value.authenticated, true);
  h.restart();
  assert.equal((await h.request()).value.authenticated, true);
});

test("desktop logout clears the browser handle and prevents restoration with the old value", async t => {
  const h = harness(t);
  await h.login();
  const oldHandle = h.handle;
  const logout = await h.request("logout", {});
  assert.equal(logout.value.authenticated, false);
  assert.equal(logout.headers.get("x-yanyu-session"), "");
  assert.equal(h.handle, "");
  assert.equal(h.store.read(oldHandle), null);
  h.restart();
  const before = h.calls.length;
  assert.equal((await h.request("", undefined, { handle: oldHandle })).value.authenticated, false);
  assert.equal(h.calls.length, before);
});

test("a late desktop balance response does not restore a handle after logout", async t => {
  const h = harness(t);
  await h.login();
  h.advance(15000);
  let resolve;
  h.fetch(path => path === "/auth/me" ? new Promise(done => { resolve = done; }) : response({}));
  const pending = h.request();
  await tick();
  await h.request("logout", {});
  assert.equal(h.handle, "");
  resolve(response(profile));
  const late = await pending;
  assert.ok(!late.headers.get("x-yanyu-session"));
  assert.equal(h.handle, "");
});

test("the desktop proxy rejects foreign origins before any host operation", async t => {
  const h = harness(t);
  const result = await h.request("login", fixture, { headers: { origin: "https://foreign-fixture.example" } });
  assert.equal(result.status, 403);
  assert.equal(h.forwarded.length, 0);
  assert.equal(h.calls.length, 0);
});
