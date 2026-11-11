import { randomBytes } from "node:crypto";

const UPSTREAM = "https://yanyuapi.com/api/v1";
const COOKIE = "yanyu_balance_session";
const COOKIE_PATH = "/plugins/yanyu-purge/api";
const CACHE_MS = 15_000;
const SESSION_MS = 24 * 60 * 60 * 1000;
const MAX_SESSIONS = 32;

class AccountError extends Error {
  constructor(status, code, message, retryMs = 0) {
    super(message);
    Object.assign(this, { status, code, retryMs });
  }
}

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.setHeader("pragma", "no-cache");
  res.end(JSON.stringify(payload));
}

function text(value, limit = 80) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, limit) : "";
}

function maskedEmail(email) {
  const [local, domain] = text(email, 254).split("@");
  return domain ? `${local.slice(0, 2)}***@${domain}` : "";
}

function validateLogin(body) {
  if (typeof body.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()) || body.email.length > 254 || typeof body.password !== "string" || !body.password || body.password.length > 2048) {
    throw new AccountError(400, "INVALID_LOGIN", "请输入有效邮箱和密码。");
  }
}

function cookieId(req) {
  const cookie = String(req.headers?.cookie || "");
  const value = cookie.split(";").map(item => item.trim()).find(item => item.startsWith(COOKIE + "="))?.slice(COOKIE.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}

function setCookie(req, res, id) {
  const secure = req.socket?.encrypted ? "; Secure" : "";
  res.setHeader("set-cookie", `${COOKIE}=${id || ""}; Path=${COOKIE_PATH}; HttpOnly; SameSite=Strict; Max-Age=${id ? 86400 : 0}${secure}`);
}

function validateRequest(req, method) {
  if (req.headers?.["x-yanyu-client"] !== "1" || req.headers?.["sec-fetch-site"] === "cross-site") {
    throw new AccountError(403, "ORIGIN_REJECTED", "请从破甲工作台打开账户面板。");
  }
  if (req.headers.origin) {
    let origin;
    let expected;
    try {
      origin = new URL(req.headers.origin);
      expected = new URL(`${req.socket?.encrypted ? "https" : "http"}://${req.headers.host}`);
    } catch {
      throw new AccountError(403, "ORIGIN_REJECTED", "账户请求来源不匹配，请刷新工作台。");
    }
    if (origin.origin !== expected.origin) throw new AccountError(403, "ORIGIN_REJECTED", "账户请求来源不匹配，请刷新工作台。");
  }
  if (method === "POST" && String(req.headers?.["content-type"] || "").split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new AccountError(415, "JSON_REQUIRED", "账户请求需要 JSON 格式。");
  }
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > 8192) throw new AccountError(413, "BODY_TOO_LARGE", "输入内容过长，请检查邮箱和密码。");
    chunks.push(bytes);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw new AccountError(400, "INVALID_JSON", "账户请求格式有误，请重试。");
  }
}

/** Per-browser, memory-only account sessions. No credentials enter plugin config or logs. */
export function createBalanceService({ fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  const sessions = new Map();
  const controllers = new Set();
  let disposed = false;

  const current = (session, generation) => !disposed && sessions.get(session.id) === session && session.generation === generation;
  const requireCurrent = (session, generation) => {
    if (!current(session, generation)) throw new AccountError(409, "SESSION_CHANGED", "登录状态已变化，请刷新账户面板。");
  };

  function invalidate(session, status = "signed_out") {
    session.generation++;
    for (const controller of session.controllers) controller.abort();
    session.controllers.clear();
    Object.assign(session, { status, access: null, refresh: null, temporary: null, tokenExpires: 0,
      balance: null, updatedAt: null, displayName: "", emailMasked: "", stale: false,
      message: status === "expired" ? "登录已过期，请重新登录。" : "", lastFetch: -Infinity,
      nextAllowed: 0, pending: null, authBusy: false });
  }

  function prune() {
    for (const session of sessions.values()) {
      if (now() - session.lastSeen >= SESSION_MS || (session.status === "two_factor" && now() >= session.pendingExpires)) {
        invalidate(session, "expired");
        sessions.delete(session.id);
      }
    }
  }

  function newSession(req, res) {
    if (sessions.size >= MAX_SESSIONS) throw new AccountError(429, "SESSION_LIMIT", "登录会话数量已达上限，请退出其他账户面板后重试。", 60_000);
    const session = { id: randomBytes(32).toString("hex"), generation: 0, controllers: new Set(), lastSeen: now(), lastLogin: -Infinity };
    invalidate(session);
    sessions.set(session.id, session);
    setCookie(req, res, session.id);
    return session;
  }

  function snapshot(session, expired = false) {
    return {
      status: session?.status || (expired ? "expired" : "signed_out"),
      authenticated: session?.status === "signed_in",
      requires2fa: session?.status === "two_factor",
      displayName: session?.displayName || "",
      emailMasked: session?.emailMasked || "",
      balance: session?.balance ?? null,
      currency: "USD",
      updatedAt: session?.updatedAt || null,
      stale: Boolean(session?.stale),
      message: session?.message || (expired ? "登录已过期，请重新登录。" : ""),
      refreshAfterMs: Math.max(CACHE_MS, (session?.nextAllowed || 0) - now())
    };
  }

  async function upstream(path, { body, token, session, kind = "profile" } = {}) {
    if (disposed) throw new AccountError(503, "UNLOADED", "插件正在重新加载，请稍后重试。");
    const controller = new AbortController();
    controllers.add(controller);
    session?.controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), 12_000);
    timeout.unref?.();
    try {
      const response = await fetchImpl(UPSTREAM + path, {
        method: body === undefined ? "GET" : "POST", redirect: "error", signal: controller.signal,
        headers: { accept: "application/json", "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      if (response.status === 429) {
        const retry = Number(response.headers?.get?.("retry-after"));
        throw new AccountError(429, "RATE_LIMITED", "燕语请求较频繁，稍后会自动重试。", Math.min(300_000, Math.max(60_000, Number.isFinite(retry) ? retry * 1000 : 60_000)));
      }
      if ([400, 401, 403].includes(response.status)) {
        const login = kind === "login";
        const otp = kind === "2fa";
        throw new AccountError(response.status, login ? "LOGIN_FAILED" : otp ? "INVALID_2FA" : "AUTH_EXPIRED", login ? "邮箱或密码不正确，或需要到燕语官网完成验证。" : otp ? "验证码无效或已过期，请重新输入。" : "登录已过期，请重新登录。");
      }
      if (!response.ok) throw new AccountError(503, "UPSTREAM_UNAVAILABLE", "燕语服务暂时没有响应，稍后会自动重试。");
      let wire;
      try { wire = await response.json(); } catch { throw new AccountError(502, "INVALID_RESPONSE", "燕语返回的数据不完整，请稍后重试。"); }
      if (!wire || wire.code !== 0 || !wire.data || typeof wire.data !== "object" || Array.isArray(wire.data)) {
        throw new AccountError(kind === "refresh" ? 401 : 400, kind === "login" ? "LOGIN_FAILED" : kind === "2fa" ? "INVALID_2FA" : kind === "refresh" ? "AUTH_EXPIRED" : "INVALID_RESPONSE", kind === "login" ? "登录未成功，请检查账号，或到燕语官网完成验证。" : kind === "2fa" ? "验证码无效或已过期，请重新输入。" : kind === "refresh" ? "登录已过期，请重新登录。" : "燕语返回的数据不完整，请稍后重试。");
      }
      return wire.data;
    } catch (error) {
      if (error instanceof AccountError) throw error;
      throw new AccountError(503, "NETWORK_ERROR", "余额连接暂时中断，请稍后重试。");
    } finally {
      clearTimeout(timeout);
      controllers.delete(controller);
      session?.controllers.delete(controller);
    }
  }

  function adoptTokens(session, data) {
    if (typeof data.access_token !== "string" || !data.access_token || data.access_token.length > 16_384) throw new AccountError(502, "INVALID_SESSION", "登录返回的数据不完整，请重试。");
    session.access = data.access_token;
    if (typeof data.refresh_token === "string" && data.refresh_token && data.refresh_token.length <= 16_384) session.refresh = data.refresh_token;
    session.tokenExpires = Number.isFinite(data.expires_in) && data.expires_in > 0 ? now() + data.expires_in * 1000 : 0;
  }

  function setProfile(session, profile) {
    if (typeof profile.balance !== "number" || !Number.isFinite(profile.balance)) throw new AccountError(502, "INVALID_BALANCE", "余额数据暂不可用，请稍后刷新。");
    session.balance = profile.balance;
    session.displayName = text(profile.username || profile.name, 64);
    session.emailMasked = maskedEmail(profile.email) || session.emailMasked;
    session.updatedAt = new Date(now()).toISOString();
    session.stale = false;
    session.message = "";
    session.nextAllowed = 0;
  }

  async function renew(session, generation) {
    if (!session.refresh) throw new AccountError(401, "AUTH_EXPIRED", "登录已过期，请重新登录。");
    const data = await upstream("/auth/refresh", { body: { refresh_token: session.refresh }, session, kind: "refresh" });
    requireCurrent(session, generation);
    adoptTokens(session, data);
  }

  async function refreshProfile(session, force = false) {
    if (session.status !== "signed_in") return;
    if (session.pending) return session.pending;
    if (now() < session.nextAllowed || now() - session.lastFetch < (force ? 3000 : CACHE_MS)) return;
    const generation = session.generation;
    session.lastFetch = now();
    const job = (async () => {
      try {
        let renewed = false;
        if (session.tokenExpires && now() >= session.tokenExpires - 30_000 && session.refresh) {
          await renew(session, generation);
          renewed = true;
        }
        let profile;
        try { profile = await upstream("/auth/me", { token: session.access, session }); }
        catch (error) {
          if (error.status !== 401 || renewed) throw error;
          await renew(session, generation);
          renewed = true;
          profile = await upstream("/auth/me", { token: session.access, session });
        }
        requireCurrent(session, generation);
        setProfile(session, profile);
      } catch (error) {
        if (!current(session, generation)) return;
        if (error.code === "AUTH_EXPIRED") {
          invalidate(session, "expired");
        } else {
          session.stale = true;
          session.message = error.message;
          session.nextAllowed = now() + (error.retryMs || 30_000);
        }
      } finally {
        if (session.pending === job) session.pending = null;
      }
    })();
    session.pending = job;
    return job;
  }

  async function signIn(session, body, secondFactor = false) {
    if (session.authBusy) throw new AccountError(409, "LOGIN_PENDING", "登录正在进行，请稍候。");
    if (now() < session.nextAllowed) throw new AccountError(429, "RATE_LIMITED", "燕语请求较频繁，请稍后重试。", session.nextAllowed - now());
    if (now() - session.lastLogin < 1500) throw new AccountError(429, "LOGIN_THROTTLED", "操作太快，请稍后再试。", 3000);
    let path;
    let credentials;
    if (secondFactor) {
      if (session.status !== "two_factor" || !session.temporary || now() >= session.pendingExpires) throw new AccountError(401, "AUTH_EXPIRED", "验证已过期，请重新登录。");
      if (typeof body.code !== "string" || !/^\d{6}$/.test(body.code.trim())) throw new AccountError(400, "INVALID_2FA", "请输入六位验证码。");
      path = "/auth/login/2fa";
      credentials = { temp_token: session.temporary, totp_code: body.code.trim() };
    } else {
      validateLogin(body);
      invalidate(session);
      session.emailMasked = maskedEmail(body.email);
      path = "/auth/login";
      credentials = { email: body.email.trim(), password: body.password };
    }
    const generation = session.generation;
    session.authBusy = true;
    session.lastLogin = now();
    try {
      const data = await upstream(path, { body: credentials, session, kind: secondFactor ? "2fa" : "login" });
      requireCurrent(session, generation);
      if (data.requires_2fa === true && typeof data.temp_token === "string" && data.temp_token.length <= 16_384 && data.temp_token) {
        session.status = "two_factor";
        session.temporary = data.temp_token;
        session.pendingExpires = now() + 5 * 60_000;
        session.message = "请输入账户的六位动态验证码。";
        return;
      }
      adoptTokens(session, data);
      session.temporary = null;
      session.status = "signed_in";
      await refreshProfile(session, true);
      if (!(sessions.get(session.id) === session && session.status === "expired")) requireCurrent(session, generation);
    } catch (error) {
      if (current(session, generation) && error.retryMs) session.nextAllowed = now() + error.retryMs;
      throw error;
    } finally {
      credentials = null;
      if (current(session, generation)) session.authBusy = false;
    }
  }

  async function handle(req, res, path, method) {
    try {
      validateRequest(req, method);
      if (disposed) throw new AccountError(503, "UNLOADED", "插件正在重新加载，请稍后重试。");
      prune();
      const id = cookieId(req);
      let session = id ? sessions.get(id) : undefined;
      if (session) session.lastSeen = now();
      if (method === "GET" && path === "/account") {
        if (session) await refreshProfile(session);
        json(res, 200, { ok: true, value: snapshot(session, Boolean(id && !session)) });
        return;
      }
      if (method !== "POST" || !["/account/login", "/account/2fa", "/account/logout", "/account/refresh"].includes(path)) throw new AccountError(404, "NOT_FOUND", "账户接口不存在。");
      const body = await readBody(req);
      if (path === "/account/logout") {
        const refresh = session?.refresh;
        if (session) { invalidate(session); sessions.delete(session.id); }
        setCookie(req, res, null);
        json(res, 200, { ok: true, value: snapshot() });
        if (refresh) void upstream("/auth/logout", { body: { refresh_token: refresh }, kind: "logout" }).catch(() => {});
        return;
      }
      if (path === "/account/login") {
        validateLogin(body);
        session ||= newSession(req, res);
        await signIn(session, body);
      } else if (path === "/account/2fa") {
        if (!session) throw new AccountError(401, "AUTH_EXPIRED", "验证已过期，请重新登录。");
        await signIn(session, body, true);
      } else if (session) await refreshProfile(session, true);
      json(res, 200, { ok: true, value: snapshot(session, Boolean(id && !session)) });
    } catch (error) {
      const known = error instanceof AccountError ? error : new AccountError(500, "ACCOUNT_ERROR", "账户操作未完成，请刷新后重试。");
      if (known.retryMs) res.setHeader("retry-after", String(Math.ceil(known.retryMs / 1000)));
      json(res, known.status, { ok: false, error: { code: known.code, message: known.message } });
    }
  }

  function dispose() {
    disposed = true;
    for (const session of sessions.values()) invalidate(session);
    sessions.clear();
    for (const controller of controllers) controller.abort();
    controllers.clear();
  }

  return { handle, dispose };
}
