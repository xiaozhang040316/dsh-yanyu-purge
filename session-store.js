import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";
import { constants, closeSync, fstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_BYTES = 128 * 1024;
const FILE_NAME = /^[a-f0-9]{64}\.json$/;
const FIELDS = ["access", "refresh", "tokenExpires", "lastSeen", "displayName", "emailMasked", "balance", "updatedAt"];
const KEY_CONTEXT = Buffer.from("dsh-yanyu-purge/account-session/v1");

function identity(id) {
  if (typeof id !== "string" || !/^[a-f0-9]{64}$/.test(id)) throw new TypeError("Invalid session identifier");
  const secret = Buffer.from(id, "hex");
  return {
    name: createHash("sha256").update(secret).digest("hex"),
    key: Buffer.from(hkdfSync("sha256", secret, KEY_CONTEXT, Buffer.from("encryption"), 32))
  };
}

function aad(name, expiresAt) {
  return Buffer.from(JSON.stringify([1, name, expiresAt]));
}

function decode(value, size) {
  if (typeof value !== "string" || !value || value.length > MAX_BYTES || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error("Invalid session envelope");
  const bytes = Buffer.from(value, "base64");
  if ((size !== undefined && bytes.length !== size) || bytes.toString("base64") !== value) throw new Error("Invalid session envelope");
  return bytes;
}

function envelope(raw) {
  const value = JSON.parse(raw);
  if (!value || value.v !== 1 || !Number.isSafeInteger(value.expiresAt) || value.expiresAt < 0) throw new Error("Invalid session envelope");
  return { ...value, iv: decode(value.iv, 12), tag: decode(value.tag, 16), data: decode(value.data) };
}

/** The random client session handle is the key material; it is never saved in this store. */
export function createSessionStore({ directory, now = Date.now } = {}) {
  if (typeof directory !== "string" || !isAbsolute(directory)) throw new TypeError("An absolute session directory is required");

  function removeFile(filename) {
    try { unlinkSync(filename); } catch (error) { if (error.code !== "ENOENT") throw error; }
  }

  function readFile(filename) {
    let fd;
    try {
      // Bound input before allocating, and do not follow symlinks where the OS supports it.
      fd = openSync(filename, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
      const stat = fstatSync(fd);
      if (!stat.isFile() || stat.size > MAX_BYTES) return { corrupt: true };
      return { raw: readFileSync(fd, "utf8") };
    } catch (error) {
      if (error.code === "ENOENT") return null;
      if (error.code === "ELOOP") return { corrupt: true };
      throw error;
    } finally {
      if (fd !== undefined) closeSync(fd);
    }
  }

  function read(id) {
    const { name, key } = identity(id);
    const filename = join(directory, name + ".json");
    const file = readFile(filename);
    if (!file) return null;
    let record;
    try {
      if (file.corrupt) throw new Error("Invalid session file");
      const value = envelope(file.raw);
      if (now() >= value.expiresAt) throw new Error("Expired session");
      const decipher = createDecipheriv("aes-256-gcm", key, value.iv);
      decipher.setAAD(aad(name, value.expiresAt));
      decipher.setAuthTag(value.tag);
      record = JSON.parse(Buffer.concat([decipher.update(value.data), decipher.final()]).toString("utf8"));
      if (!record || Array.isArray(record) || typeof record !== "object" || record.lastSeen + SESSION_MS !== value.expiresAt) throw new Error("Invalid session record");
    } catch {
      removeFile(filename);
      return null;
    }
    return record;
  }

  function write(id, record) {
    const { name, key } = identity(id);
    if (!record || !Number.isSafeInteger(record.lastSeen) || record.lastSeen < 0) throw new TypeError("Invalid session record");
    const expiresAt = record.lastSeen + SESSION_MS;
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= now()) throw new TypeError("Expired session record");
    // Explicit selection prevents accidental persistence of passwords or temporary 2FA credentials.
    const selected = Object.fromEntries(FIELDS.filter(field => Object.hasOwn(record, field)).map(field => [field, record[field]]));
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(aad(name, expiresAt));
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(selected), "utf8"), cipher.final()]);
    const bytes = Buffer.from(JSON.stringify({ v: 1, expiresAt, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: encrypted.toString("base64") }));
    if (bytes.length > MAX_BYTES) throw new RangeError("Session record is too large");
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const filename = join(directory, name + ".json");
    const temporary = filename + "." + randomBytes(12).toString("hex") + ".tmp";
    try {
      writeFileSync(temporary, bytes, { flag: "wx", mode: 0o600 });
      renameSync(temporary, filename);
    } finally {
      removeFile(temporary);
    }
  }

  function remove(id) {
    removeFile(join(directory, identity(id).name + ".json"));
  }

  function prune() {
    let entries;
    try { entries = readdirSync(directory, { withFileTypes: true }); }
    catch (error) { if (error.code === "ENOENT") return; throw error; }
    for (const entry of entries) {
      if (!FILE_NAME.test(entry.name) || entry.isDirectory()) continue;
      const filename = join(directory, entry.name);
      const file = readFile(filename);
      if (!file) continue;
      let expired = file.corrupt;
      try { expired ||= now() >= envelope(file.raw).expiresAt; }
      catch { expired = true; }
      if (expired) removeFile(filename);
    }
  }

  return { read, write, remove, prune };
}
