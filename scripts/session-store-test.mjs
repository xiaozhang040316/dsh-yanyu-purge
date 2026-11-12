import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createSessionStore } from "../session-store.js";

const id = "12".repeat(32);
const otherId = "34".repeat(32);
const ttl = 30 * 24 * 60 * 60 * 1000;
const time = 1_800_000_000_000;
const record = { access: "fixture-access-secret", refresh: "fixture-refresh-secret", tokenExpires: time + 86_400_000, lastSeen: time, displayName: "Fixture", emailMasked: "fi***@example.com", balance: 12.345, updatedAt: new Date(time).toISOString() };
const filename = (directory, cookie = id) => path.join(directory, createHash("sha256").update(Buffer.from(cookie, "hex")).digest("hex") + ".json");

function fixture(t) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "yanyu-session-test-"));
  const directory = path.join(parent, "sessions");
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  let clock = time;
  const make = () => createSessionStore({ directory, now: () => clock });
  return { parent, directory, store: make(), make, advance(ms) { clock += ms; } };
}

test("encrypted records survive a fresh store while cookies remain isolated", t => {
  const h = fixture(t);
  assert.equal(h.store.read(id), null);
  h.store.prune();
  assert.equal(fs.existsSync(h.directory), false);
  h.store.write(id, record);
  assert.deepEqual(h.make().read(id), record);
  assert.equal(h.make().read(otherId), null);
  const raw = fs.readFileSync(filename(h.directory), "utf8");
  for (const secret of [id, record.access, record.refresh, record.displayName, record.emailMasked]) assert.equal(raw.includes(secret), false);
  const list = fs.readdirSync(h.directory);
  assert.equal(list.length, 1);
  assert.equal(list[0].includes(id), false);
});

test("writes select account fields and do not save password, 2FA, or extra upstream data", t => {
  const h = fixture(t);
  h.store.write(id, { ...record, password: "secret-password", temporary: "temporary-token", upstreamUser: { private: "secret" } });
  assert.deepEqual(h.make().read(id), record);
});

test("atomic replacement changes nonce, retains the latest record, and leaves no temp file", t => {
  const h = fixture(t);
  h.store.write(id, record);
  const first = JSON.parse(fs.readFileSync(filename(h.directory), "utf8"));
  h.store.write(id, { ...record, refresh: "rotated-secret", balance: 9 });
  const second = JSON.parse(fs.readFileSync(filename(h.directory), "utf8"));
  assert.notEqual(first.iv, second.iv);
  assert.equal(h.make().read(id).refresh, "rotated-secret");
  assert.equal(h.make().read(id).balance, 9);
  assert.equal(fs.readdirSync(h.directory).length, 1);
  if (process.platform !== "win32") {
    assert.equal(fs.statSync(h.directory).mode & 0o777, 0o700);
    assert.equal(fs.statSync(filename(h.directory)).mode & 0o777, 0o600);
  }
});

test("altered expiry, ciphertext, tag, or record filename cannot authenticate", t => {
  const h = fixture(t);
  for (const field of ["expiresAt", "data", "tag"]) {
    h.store.write(id, record);
    const value = JSON.parse(fs.readFileSync(filename(h.directory), "utf8"));
    value[field] = field === "expiresAt" ? value[field] + 1 : (value[field].startsWith("A") ? "B" : "A") + value[field].slice(1);
    fs.writeFileSync(filename(h.directory), JSON.stringify(value));
    assert.equal(h.store.read(id), null, field);
    assert.equal(fs.existsSync(filename(h.directory)), false);
  }
  h.store.write(id, record);
  fs.copyFileSync(filename(h.directory), filename(h.directory, otherId));
  assert.equal(h.store.read(otherId), null);
  assert.deepEqual(h.store.read(id), record);
});

test("malformed and oversized files are discarded, while unrelated files survive pruning", t => {
  const h = fixture(t);
  h.store.write(id, record);
  fs.writeFileSync(filename(h.directory), "{broken-json");
  assert.equal(h.store.read(id), null);
  fs.writeFileSync(filename(h.directory), "x".repeat(128 * 1024 + 1));
  assert.equal(h.store.read(id), null);
  fs.writeFileSync(filename(h.directory), JSON.stringify({ v: 1, expiresAt: time + ttl }));
  fs.writeFileSync(path.join(h.directory, "unrelated.json"), "preserve");
  h.store.prune();
  assert.deepEqual(fs.readdirSync(h.directory), ["unrelated.json"]);
});

test("30-day idle expiry and explicit removal survive subsequent store creation", t => {
  const h = fixture(t);
  h.store.write(id, record);
  h.advance(ttl - 1);
  assert.deepEqual(h.make().read(id), record);
  h.advance(1);
  assert.equal(h.make().read(id), null);
  assert.equal(fs.existsSync(filename(h.directory)), false);
  h.store.write(otherId, { ...record, lastSeen: time + ttl });
  h.store.remove(otherId);
  h.store.remove(otherId);
  assert.equal(h.make().read(otherId), null);
});

test("pruning deletes expired records and preserves current records", t => {
  const h = fixture(t);
  h.store.write(id, record);
  h.advance(ttl / 2);
  h.store.write(otherId, { ...record, lastSeen: time + ttl / 2 });
  h.advance(ttl / 2);
  h.make().prune();
  assert.equal(h.store.read(id), null);
  assert.equal(h.store.read(otherId).lastSeen, time + ttl / 2);
});

test("invalid identifiers and storage I/O errors do not silently become successful writes", t => {
  const h = fixture(t);
  for (const bad of ["../escape", "a".repeat(63), "G".repeat(64), null]) {
    assert.throws(() => h.store.read(bad), TypeError);
    assert.throws(() => h.store.write(bad, record), TypeError);
    assert.throws(() => h.store.remove(bad), TypeError);
  }
  assert.throws(() => createSessionStore({ directory: "relative" }), TypeError);
  fs.writeFileSync(h.directory, "blocks-directory");
  assert.throws(() => h.store.write(id, record));
  fs.unlinkSync(h.directory);
  fs.mkdirSync(h.directory);
  fs.mkdirSync(filename(h.directory));
  assert.throws(() => h.store.write(id, record));
  assert.equal(fs.readdirSync(h.directory).some(name => name.endsWith(".tmp")), false);
  assert.throws(() => h.store.read(id));
  assert.throws(() => h.store.remove(id));
});
