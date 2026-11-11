import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createBalanceService } from "../balance.js";

const response = (data, status = 200, headers = {}) => new Response(JSON.stringify({ code: 0, data }), { status, headers });
const credentials = { email: "fixture@example.com", password: "fixture-password" };
const tokens = { access_token: "fixture-access-secret", refresh_token: "fixture-refresh-secret", expires_in: 86400 };
const user = { username: "Fixture", email: credentials.email, balance: 10.123456, private_field: "not-for-client" };
const tick = () => new Promise(resolve => setImmediate(resolve));

function harness(t, fetcher) {
  let time = 1_800_000_000_000;
  let jar = "";
  const calls = [];
  let handler = fetcher || ((path) => response(path === "/auth/login" || path === "/auth/refresh" ? tokens : path === "/auth/me" ? user : {}));
  const service = createBalanceService({ now: () => time, fetchImpl: async (url, options) => {
    assert.ok(url.startsWith("https://yanyuapi.com/api/v1/auth/"));
    assert.equal(options.redirect, "error");
    const path = url.slice("https://yanyuapi.com/api/v1".length);
    calls.push({ path, options });
    return handler(path, options);
  } });
  t.after(() => service.dispose());
  async function request(path = "/account", method = "GET", body, options = {}) {
    const req = Readable.from(body === undefined ? [] : [Buffer.from(options.raw ? body : JSON.stringify(body))]);
    req.method = method;
    req.headers = { host: "localhost:4321", origin: "http://localhost:4321", "x-yanyu-client": "1", "content-type": "application/json", cookie: options.cookie ?? jar, ...options.headers };
    req.socket = { encrypted: Boolean(options.secure) };
    const headers = {};
    let wire;
    const res = { statusCode: 0, setHeader(key, value) { headers[key] = value; }, end(value) { wire = JSON.parse(value); } };
    await service.handle(req, res, path, method);
    if (headers["set-cookie"] && !options.noStore) jar = headers["set-cookie"].split(";")[0];
    return { status: res.statusCode, headers, ...wire };
  }
  return { service, calls, request, login: () => request("/account/login", "POST", credentials), advance(ms) { time += ms; }, fetch(fn) { handler = fn; }, get cookie() { return jar; } };
}

test("signed-out lookup does not contact upstream or allocate a session", async t => {
  const h = harness(t);
  const r = await h.request();
  assert.equal(r.value.status, "signed_out");
  assert.equal(r.value.balance, null);
  assert.equal(r.value.authenticated, false);
  assert.equal(r.headers["cache-control"], "no-store");
  assert.equal(h.calls.length, 0);
  assert.equal(h.cookie, "");
});

test("login retrieves current balance, sets HttpOnly cookie and exposes only selected fields", async t => {
  const h = harness(t);
  const r = await h.login();
  assert.equal(r.status, 200);
  assert.equal(r.value.authenticated, true);
  assert.equal(r.value.balance, user.balance);
  assert.equal(r.value.currency, "USD");
  assert.equal(r.value.emailMasked, "fi***@example.com");
  assert.match(r.headers["set-cookie"], /HttpOnly; SameSite=Strict/);
  assert.match(r.headers["set-cookie"], /Path=\/plugins\/yanyu-purge\/api/);
  assert.ok(!/fixture-password|fixture-access-secret|fixture-refresh-secret|private_field|not-for-client/.test(JSON.stringify(r)));
  assert.deepEqual(h.calls.map(c => c.path), ["/auth/login", "/auth/me"]);
});

test("account requests require client header, same origin and JSON mutation bodies", async t => {
  const h = harness(t);
  assert.equal((await h.request("/account", "GET", undefined, { headers: { "x-yanyu-client": undefined } })).status, 403);
  assert.equal((await h.request("/account", "GET", undefined, { headers: { origin: "https://unrelated.example" } })).status, 403);
  assert.equal((await h.request("/account", "GET", undefined, { headers: { "sec-fetch-site": "cross-site" } })).status, 403);
  assert.equal((await h.request("/account/login", "POST", credentials, { headers: { "content-type": "text/plain" } })).status, 415);
  assert.equal((await h.request("/account/login", "POST", "{", { raw: true })).status, 400);
  assert.equal((await h.request("/account/login", "POST", "x".repeat(8193), { raw: true })).status, 413);
  assert.equal((await h.request("/account/login", "POST", { email: "bad", password: "test" })).status, 400);
  assert.equal(h.cookie, "");
  assert.equal(h.calls.length, 0);
});

test("HTTPS origin produces a Secure session cookie", async t => {
  const h = harness(t);
  const r = await h.request("/account/login", "POST", credentials, { secure: true, headers: { origin: "https://localhost:4321" } });
  assert.equal(r.status, 200);
  assert.match(r.headers["set-cookie"], /; Secure$/);
});

test("failed login returns a sanitized error without session tokens", async t => {
  const h = harness(t, () => response({ message: "secret diagnostics" }, 401));
  const r = await h.login();
  assert.equal(r.status, 401);
  assert.equal(r.error.code, "LOGIN_FAILED");
  assert.ok(!JSON.stringify(r).includes("secret diagnostics"));
  assert.equal((await h.request()).value.authenticated, false);
});

test("distinct browser cookies isolate account identity and balance", async t => {
  let account = 0;
  const h = harness(t, (path, options) => {
    if (path === "/auth/login") return response({ ...tokens, access_token: `access-${++account}` });
    return response({ ...user, balance: options.headers.authorization === "Bearer access-1" ? 11 : 22 });
  });
  const one = await h.login();
  const oneCookie = h.cookie;
  const two = await h.request("/account/login", "POST", credentials, { cookie: "" });
  assert.equal(one.value.balance, 11);
  assert.equal(two.value.balance, 22);
  assert.notEqual(h.cookie, oneCookie);
  assert.equal((await h.request("/account", "GET", undefined, { cookie: oneCookie })).value.balance, 11);
  assert.equal((await h.request("/account", "GET", undefined, { cookie: "" })).value.balance, null);
});

test("cache and minimum manual refresh interval prevent upstream polling storms", async t => {
  const h = harness(t);
  await h.login();
  await h.request();
  await h.request("/account/refresh", "POST", {});
  assert.equal(h.calls.length, 2);
  h.advance(3000);
  await h.request("/account/refresh", "POST", {});
  assert.equal(h.calls.length, 3);
  h.advance(14999);
  await h.request();
  assert.equal(h.calls.length, 3);
  h.advance(1);
  await h.request();
  assert.equal(h.calls.length, 4);
});

test("concurrent views share one in-flight profile request", async t => {
  const h = harness(t);
  await h.login();
  h.advance(15000);
  let resolve;
  h.fetch(() => new Promise(done => { resolve = done; }));
  const requests = [h.request(), h.request(), h.request("/account/refresh", "POST", {})];
  await tick();
  assert.equal(h.calls.length, 3);
  resolve(response({ ...user, balance: 9 }));
  for (const r of await Promise.all(requests)) assert.equal(r.value.balance, 9);
});

test("401 refreshes once and keeps rotated refresh token for the next cycle", async t => {
  const h = harness(t);
  await h.login();
  let profiles = 0;
  let renews = 0;
  h.fetch((path, options) => {
    if (path === "/auth/refresh") {
      const body = JSON.parse(options.body);
      assert.equal(body.refresh_token, renews ? "rotated-refresh-1" : tokens.refresh_token);
      renews++;
      return response({ ...tokens, access_token: `renewed-${renews}`, refresh_token: `rotated-refresh-${renews}` });
    }
    profiles++;
    return profiles % 2 ? response({}, 401) : response({ ...user, balance: 8 });
  });
  h.advance(15000);
  assert.equal((await h.request()).value.balance, 8);
  h.advance(15000);
  assert.equal((await h.request()).value.balance, 8);
  assert.equal(renews, 2);
  assert.equal(profiles, 4);
});

test("invalid refresh expires session and clears old identity and balance", async t => {
  const h = harness(t);
  await h.login();
  h.advance(15000);
  h.fetch(() => response({}, 401));
  const r = await h.request();
  assert.equal(r.value.status, "expired");
  assert.equal(r.value.balance, null);
  assert.equal(r.value.emailMasked, "");
  const before = h.calls.length;
  await h.request();
  assert.equal(h.calls.length, before);
});

test("network failure keeps the last amount, marks stale and backs off", async t => {
  const h = harness(t);
  await h.login();
  h.advance(15000);
  h.fetch(() => { throw new Error("sensitive network detail"); });
  const r = await h.request();
  assert.equal(r.value.balance, user.balance);
  assert.equal(r.value.stale, true);
  assert.equal(r.value.authenticated, true);
  assert.ok(!JSON.stringify(r).includes("sensitive"));
  const before = h.calls.length;
  h.advance(15000);
  await h.request("/account/refresh", "POST", {});
  assert.equal(h.calls.length, before);
});

test("bad balance values never replace a real balance with zero", async t => {
  const h = harness(t);
  await h.login();
  h.advance(15000);
  h.fetch(() => response({ ...user, balance: null }));
  const r = await h.request();
  assert.equal(r.value.balance, user.balance);
  assert.equal(r.value.stale, true);
});

test("an initial missing balance remains null while the account stays signed in", async t => {
  const h = harness(t, path => response(path === "/auth/login" ? tokens : { email: user.email }));
  const r = await h.login();
  assert.equal(r.value.balance, null);
  assert.equal(r.value.authenticated, true);
  assert.equal(r.value.stale, true);
});

test("429 respects at least a minute of backoff including manual refresh", async t => {
  const h = harness(t);
  await h.login();
  h.advance(15000);
  h.fetch(() => response({}, 429, { "retry-after": "2" }));
  const r = await h.request();
  assert.equal(r.value.refreshAfterMs, 60000);
  assert.equal(r.value.balance, user.balance);
  const before = h.calls.length;
  h.advance(59000);
  await h.request("/account/refresh", "POST", {});
  assert.equal(h.calls.length, before);
});

test("logout immediately clears local state even if an old profile completes afterward", async t => {
  const h = harness(t);
  await h.login();
  h.advance(15000);
  let resolve;
  h.fetch(path => path === "/auth/me" ? new Promise(done => { resolve = done; }) : response({}, 502));
  const old = h.request();
  await tick();
  const out = await h.request("/account/logout", "POST", {});
  assert.equal(out.value.status, "signed_out");
  assert.match(out.headers["set-cookie"], /Max-Age=0/);
  resolve(response({ ...user, balance: 999 }));
  const delayed = await old;
  assert.equal(delayed.value.balance, null);
  assert.equal((await h.request()).value.authenticated, false);
});

test("logout prevents a pending login from resurrecting a session", async t => {
  const h = harness(t);
  await h.login();
  h.advance(2000);
  let resolve;
  h.fetch(path => path === "/auth/login" ? new Promise(done => { resolve = done; }) : response({}));
  const login = h.login();
  await tick();
  await h.request("/account/logout", "POST", {});
  resolve(response(tokens));
  assert.equal((await login).error.code, "SESSION_CHANGED");
  assert.equal((await h.request()).value.authenticated, false);
});

test("a delayed profile from the previous login cannot replace a newly signed-in account", async t => {
  const h = harness(t);
  await h.login();
  h.advance(15000);
  let resolveOld;
  h.fetch((path, options) => {
    if (path === "/auth/login") return response({ ...tokens, access_token: "new-account-access" });
    if (options.headers.authorization === "Bearer new-account-access") return response({ ...user, username: "New account", balance: 30 });
    return new Promise(resolve => { resolveOld = resolve; });
  });
  const old = h.request();
  await tick();
  assert.equal((await h.login()).value.balance, 30);
  resolveOld(response({ ...user, balance: 999 }));
  await old;
  const state = (await h.request()).value;
  assert.equal(state.balance, 30);
  assert.equal(state.displayName, "New account");
});

test("2FA keeps the temporary token on the host and accepts only a six-digit code", async t => {
  const h = harness(t, (path, options) => {
    if (path === "/auth/login") return response({ requires_2fa: true, temp_token: "temporary-secret" });
    if (path === "/auth/login/2fa") {
      assert.deepEqual(JSON.parse(options.body), { temp_token: "temporary-secret", totp_code: "654321" });
      return response(tokens);
    }
    return response(user);
  });
  const pending = await h.login();
  assert.equal(pending.value.requires2fa, true);
  assert.ok(!JSON.stringify(pending).includes("temporary-secret"));
  h.advance(2000);
  assert.equal((await h.request("/account/2fa", "POST", { code: "abc" })).status, 400);
  const signed = await h.request("/account/2fa", "POST", { code: "654321" });
  assert.equal(signed.value.authenticated, true);
  assert.equal(signed.value.balance, user.balance);
});

test("idle session expiry clears account state without an upstream request", async t => {
  const h = harness(t);
  await h.login();
  h.advance(24 * 60 * 60 * 1000);
  assert.equal((await h.request()).value.status, "expired");
  assert.equal(h.calls.length, 2);
});

test("dispose aborts in-flight work and refuses subsequent account operations", async t => {
  const h = harness(t);
  await h.login();
  h.advance(15000);
  let resolve;
  let signal;
  h.fetch((path, options) => { signal = options.signal; return new Promise(done => { resolve = done; }); });
  const pending = h.request();
  await tick();
  h.service.dispose();
  assert.equal(signal.aborted, true);
  resolve(response(user));
  assert.equal((await pending).value.balance, null);
  assert.equal((await h.request()).status, 503);
});

// Evaluate the real host implementation with only its external services replaced.
// This keeps the tests portable without shipping the DSH runtime as a dependency.
function promptHarness(t, config = {}) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const index = fs.readFileSync(path.join(root, "index.js"), "utf8")
    .replace(/^import .*;\r?$/gm, "")
    .replaceAll("import.meta.url", "moduleUrl")
    .replace(/export \{ Config, apply, inject, name \};/, "return { Config, apply, inject, name };");
  const value = () => ({ default: input => input });
  const plugin = vm.runInNewContext(`(function () { ${index}\n})()`, {
    z: { object: x => x, boolean: value, string: value, number: value },
    readFileSync: filename => `fixture-prompt-${path.basename(filename).slice(0, 2)}`,
    dirname: path.dirname, join: path.join, fileURLToPath,
    moduleUrl: pathToFileURL(path.join(root, "index.js")).href,
    createBalanceService, URL, Buffer, Date, console
  });
  const sections = new Map([["host", { name: "host", text: () => "original host prompt" }]]);
  const listeners = new Map();
  const routes = new Map();
  const effects = [];
  const changes = [];
  let suppressors = 0;
  let registrations = 0;
  const web = { register(route) { routes.set(route.path, route); const dispose = () => routes.delete(route.path); effects.push(dispose); return dispose; } };
  const ctx = {
    logger: { info() {} },
    systemPrompt: {
      section(section) {
        assert.ok(!sections.has(section.name), "duplicate prompt registration");
        registrations++;
        sections.set(section.name, section);
        let active = true;
        return () => { if (active) { active = false; sections.delete(section.name); } };
      },
      suppressRuntimeContext() { suppressors++; let active = true; return () => { if (active) { active = false; suppressors--; } }; }
    },
    effect(fn) { const result = fn(); if (typeof result === "function") effects.push(result); return result; },
    on(event, fn) { listeners.set(event, fn); return () => listeners.delete(event); },
    emit(event) { changes.push(event); },
    get(key) { return key === "webServer" ? web : undefined; },
    inject(keys, fn) { fn(ctx); }
  };
  plugin.apply(ctx, config);
  let disposed = false;
  const dispose = () => { if (!disposed) { disposed = true; for (const cleanup of effects.reverse()) cleanup(); } };
  t.after(dispose);
  async function request(endpoint = "state", body) {
    const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
    req.url = `/plugins/yanyu-purge/api/${endpoint}`;
    req.method = body === undefined ? "GET" : "POST";
    req.headers = { "x-yanyu-client": "1", host: "localhost:4321", "content-type": "application/json" };
    let payload;
    const res = { statusCode: 0, setHeader() {}, end(wire) { payload = JSON.parse(wire); } };
    await routes.get("/plugins/yanyu-purge/api").handler(req, res);
    return { status: res.statusCode, ...payload };
  }
  function stream() {
    let nextCalls = 0;
    listeners.get("llm/stream")({ messages: [{ role: "system", content: "fixture-prompt-01" }] }, () => { nextCalls++; });
    assert.equal(nextCalls, 1);
  }
  return { request, sections, listeners, routes, changes, stream, dispose,
    get registrations() { return registrations; }, get suppressors() { return suppressors; } };
}

test("master switch removes the prompt and runtime suppressor, clears proof, then restores once", async t => {
  const h = promptHarness(t, { includeRuntimeContext: false });
  assert.equal(h.sections.size, 2);
  assert.equal(h.suppressors, 1);
  h.sections.get("yanyu:purge").text();
  h.stream();
  assert.equal((await h.request()).value.injection.confirmations, 1);
  const off = (await h.request("enabled", { enabled: false })).value;
  assert.equal(off.enabled, false);
  assert.equal(off.mode, "off");
  assert.equal(off.configuredMode, "purge");
  assert.equal(off.injection.registered, false);
  assert.equal(off.injection.evaluations, 0);
  assert.equal(off.injection.confirmations, 0);
  assert.equal(off.injection.lastAssembledAt, null);
  assert.equal(h.sections.size, 1);
  assert.equal(h.suppressors, 0);
  h.stream();
  assert.equal((await h.request()).value.injection.confirmations, 0);
  await h.request("enabled", { enabled: true });
  await h.request("enabled", { enabled: true });
  assert.equal(h.sections.size, 2);
  assert.equal(h.registrations, 2);
  assert.equal(h.suppressors, 1);
  h.dispose();
  assert.equal(h.sections.size, 1);
  assert.equal(h.suppressors, 0);
  assert.equal(h.routes.size, 0);
});

test("disabled startup keeps account and control APIs available and can be enabled later", async t => {
  for (const config of [{ enabled: false }, { mode: "off" }]) {
    const h = promptHarness(t, config);
    assert.equal(h.sections.size, 1);
    assert.equal((await h.request()).value.enabled, false);
    assert.equal((await h.request("account")).value.status, "signed_out");
    const on = await h.request("enabled", { enabled: true });
    assert.equal(on.value.enabled, true);
    assert.equal(on.value.mode, "purge");
    assert.equal(h.sections.get("yanyu:purge").complete, true);
    h.dispose();
  }
});

test("switching back on preserves configured append mode and the selected scheme", async t => {
  const h = promptHarness(t, { mode: "inject", enabled: false });
  await h.request("scheme", { scheme: "b" });
  const on = await h.request("enabled", { enabled: true });
  assert.equal(on.value.mode, "inject");
  assert.equal(on.value.scheme, "b");
  assert.equal(h.sections.get("yanyu:purge").complete, undefined);
  assert.equal(h.sections.get("yanyu:purge").text(), "fixture-prompt-02");
  assert.equal((await h.request("enabled", { enabled: "false" })).status, 400);
  assert.equal((await h.request()).value.enabled, true);
});
