import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBalanceService } from "../balance.js";
import { createSessionStore } from "../session-store.js";

const DAY = 86_400_000;
const tokens = { access_token: "refresh-fixture-access", refresh_token: "refresh-fixture-grant", expires_in: 86400 };
const rotated = { ...tokens, access_token: "refresh-fixture-rotated-access", refresh_token: "refresh-fixture-rotated-grant" };
const profile = { username: "Refresh fixture", email: "refresh@example.com", balance: 18.75 };
const wire = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers });
const ok = data => wire({ code: 0, data });

function harness(t) {
  const directory = mkdtempSync(join(tmpdir(), "yanyu-refresh-test-"));
  let time = 1_800_000_000_000;
  let id = "";
  let service;
  const store = createSessionStore({ directory, now: () => time });
  const calls = [];
  let fetcher = path => ok(path === "/auth/login" ? tokens : profile);
  function start() {
    service = createBalanceService({ sessionStore: store, now: () => time, fetchImpl: async (url, options) => {
      assert.ok(url.startsWith("https://yanyuapi.com/api/v1/auth/"));
      const path = url.slice("https://yanyuapi.com/api/v1".length);
      calls.push({ path, options });
      return fetcher(path, options);
    } });
  }
  start();
  t.after(() => { service.dispose(); rmSync(directory, { recursive: true, force: true }); });
  async function request(path = "/account", method = "GET", body) {
    const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
    req.headers = { host: "localhost:4321", origin: "http://localhost:4321", "content-type": "application/json", "x-yanyu-client": "1", "x-yanyu-session-mode": "header", "x-yanyu-session": id };
    req.socket = { encrypted: false };
    const headers = {};
    let payload;
    const res = { statusCode: 0, setHeader(name, value) { headers[name] = value; }, end(value) { payload = JSON.parse(value); } };
    await service.handle(req, res, path, method);
    if (typeof headers["x-yanyu-session"] === "string") id = headers["x-yanyu-session"];
    return { status: res.statusCode, headers, ...payload };
  }
  return { request, store, calls, get id() { return id; },
    login: () => request("/account/login", "POST", { email: profile.email, password: "refresh-fixture-password" }),
    refresh: () => request("/account/refresh", "POST", {}),
    advance(ms) { time += ms; },
    fetch(fn) { fetcher = fn; },
    restart() { service.dispose(); start(); }
  };
}

function assertRemembered(h, result, expected = tokens) {
  assert.equal(result.status, 200);
  assert.equal(result.value.authenticated, true);
  assert.equal(result.value.status, "signed_in");
  assert.equal(result.value.persistent, true);
  assert.equal(result.value.balance, profile.balance);
  assert.equal(result.value.stale, true);
  assert.ok(result.value.message);
  const saved = h.store.read(h.id);
  assert.equal(saved.access, expected.access_token);
  assert.equal(saved.refresh, expected.refresh_token);
}

for (const status of [400, 403]) {
  test(`profile HTTP ${status} preserves the account and balance without renewing`, async t => {
    const h = harness(t);
    await h.login();
    const id = h.id;
    h.advance(3000);
    h.fetch(path => {
      assert.equal(path, "/auth/me");
      return wire({ code: status, message: "synthetic upstream rejection" }, status);
    });
    assertRemembered(h, await h.refresh());
    assert.equal(h.id, id);
    assert.equal(h.calls.filter(call => call.path === "/auth/refresh").length, 0);
    h.advance(30000);
    h.fetch(() => ok({ ...profile, balance: 17 }));
    const recovered = await h.refresh();
    assert.equal(recovered.value.authenticated, true);
    assert.equal(recovered.value.stale, false);
    assert.equal(recovered.value.balance, 17);
  });
}

test("a second profile 401 after successful renewal retains the rotated account and retries later", async t => {
  const h = harness(t);
  await h.login();
  h.advance(3000);
  h.fetch(path => path === "/auth/refresh" ? ok(rotated) : wire({ code: 401, message: "synthetic access rejection" }, 401));
  assertRemembered(h, await h.refresh(), rotated);
  assert.equal(h.calls.filter(call => call.path === "/auth/refresh").length, 1);
  assert.equal(h.calls.filter(call => call.path === "/auth/me").length, 3);
  h.restart();
  h.fetch((path, options) => {
    assert.equal(path, "/auth/me");
    assert.equal(options.headers.authorization, `Bearer ${rotated.access_token}`);
    return ok({ ...profile, balance: 16 });
  });
  const recovered = await h.request();
  assert.equal(recovered.value.authenticated, true);
  assert.equal(recovered.value.stale, false);
  assert.equal(recovered.value.balance, 16);
});

test("an explicit refresh 401 expires the account and deletes its persisted credentials", async t => {
  const h = harness(t);
  await h.login();
  const id = h.id;
  h.advance(DAY);
  h.fetch(path => {
    assert.equal(path, "/auth/refresh");
    return wire({ code: 401, message: "Invalid refresh token" }, 401);
  });
  const expired = await h.refresh();
  assert.equal(expired.value.authenticated, false);
  assert.equal(expired.value.status, "expired");
  assert.equal(expired.value.balance, null);
  assert.equal(h.store.read(id), null);
  h.restart();
  const before = h.calls.length;
  assert.equal((await h.request()).value.authenticated, false);
  assert.equal(h.calls.length, before);
});

const refreshFailures = [
  ["HTTP 400", () => wire({ code: 400, message: "Synthetic bad request" }, 400)],
  ["HTTP 403", () => wire({ code: 403, message: "Synthetic forbidden" }, 403)],
  ["malformed JSON", () => new Response("{broken", { status: 200 })],
  ["missing grant data", () => wire({ code: 0 })],
  ["application error in HTTP 200", () => wire({ code: 503, message: "Synthetic service error" })],
  ["network failure", () => { throw new Error("Synthetic network failure"); }],
  ["HTTP 429", () => wire({ code: 429 }, 429, { "retry-after": "60" })],
  ["HTTP 502", () => new Response("Synthetic gateway error", { status: 502 })]
];

for (const [name, failure] of refreshFailures) {
  test(`refresh ${name} preserves remembered login and recovers on a later retry`, async t => {
    const h = harness(t);
    await h.login();
    const id = h.id;
    h.advance(DAY);
    h.fetch(path => {
      assert.equal(path, "/auth/refresh");
      return failure();
    });
    const failed = await h.refresh();
    assertRemembered(h, failed);
    assert.equal(h.id, id);
    h.advance(failed.value.refreshAfterMs);
    h.fetch((path, options) => {
      if (path === "/auth/refresh") {
        assert.equal(JSON.parse(options.body).refresh_token, tokens.refresh_token);
        return ok(rotated);
      }
      assert.equal(options.headers.authorization, `Bearer ${rotated.access_token}`);
      return ok({ ...profile, balance: 15 });
    });
    const recovered = await h.refresh();
    assert.equal(recovered.value.authenticated, true);
    assert.equal(recovered.value.stale, false);
    assert.equal(recovered.value.balance, 15);
    assert.equal(h.store.read(id).refresh, rotated.refresh_token);
  });
}
