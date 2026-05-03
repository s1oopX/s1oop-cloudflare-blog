import { text } from './strings.js';

const SESSION_COOKIE = 's1oop_admin_session';
const SESSION_MAX_AGE = 60 * 60 * 6;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_BLOCK_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;
const LOGIN_THROTTLE_PREFIX = 'auth.login.';
const encoder = new TextEncoder();
const loginAttempts = globalThis.__s1oopLoginAttempts ?? new Map();
globalThis.__s1oopLoginAttempts = loginAttempts;

const requireAdminPassword = (env) => {
  const password = text(env.ADMIN_PASSWORD);
  if (!password) {
    return { ok: false, status: 503, message: 'ADMIN_PASSWORD is not configured' };
  }

  return { ok: true, password };
};

const base64UrlEncode = (value) => btoa(String.fromCharCode(...new Uint8Array(value)))
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/g, '');

const readCookie = (request, name) => {
  const cookie = request.headers.get('cookie') ?? '';
  const prefix = `${name}=`;
  return cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length) || '';
};

const clientKey = (request) => request.headers.get('cf-connecting-ip')
  || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  || 'local';

const loginThrottleKey = async (request) => {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(clientKey(request)));
  return `${LOGIN_THROTTLE_PREFIX}${base64UrlEncode(digest).slice(0, 32)}`;
};

const evaluateLoginAttempt = (key, now, attempt, storage = 'memory') => {
  if (!attempt) return { ok: true, key, now, storage, attempt: null };
  if (attempt.blockedUntil && attempt.blockedUntil > now) {
    return {
      ok: false,
      key,
      now,
      storage,
      attempt,
      retryAfter: Math.ceil((attempt.blockedUntil - now) / 1000),
    };
  }
  if (attempt.firstFailureAt + LOGIN_WINDOW_MS <= now) {
    return { ok: true, key, now, storage, attempt: null, expired: true };
  }

  return { ok: true, key, now, storage, attempt };
};

const readPersistentLoginAttempt = async (env, key) => {
  if (!env.BLOG_DB) return { available: false };
  try {
    const row = await env.BLOG_DB.prepare(
      'SELECT value FROM site_settings WHERE key = ?',
    ).bind(key).first();
    return { available: true, attempt: row?.value ? JSON.parse(row.value) : null };
  } catch {
    return { available: false };
  }
};

const writePersistentLoginAttempt = async (env, key, attempt) => {
  await env.BLOG_DB.prepare(
    `INSERT INTO site_settings (key, value, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = CURRENT_TIMESTAMP`,
  ).bind(key, JSON.stringify(attempt)).run();
};

const deletePersistentLoginAttempt = async (env, key) => {
  await env.BLOG_DB.prepare('DELETE FROM site_settings WHERE key = ?').bind(key).run();
};

const memoryLoginThrottle = async (key, now) => {
  const attempt = loginAttempts.get(key);

  const throttle = evaluateLoginAttempt(key, now, attempt, 'memory');
  if (throttle.expired) {
    loginAttempts.delete(key);
  }
  return throttle;
};

const loginThrottle = async (request, env) => {
  const key = await loginThrottleKey(request);
  const now = Date.now();
  const persistent = await readPersistentLoginAttempt(env, key);
  if (persistent.available) {
    const throttle = evaluateLoginAttempt(key, now, persistent.attempt, 'd1');
    if (throttle.expired) {
      await deletePersistentLoginAttempt(env, key).catch(() => null);
    }
    return throttle;
  }

  return memoryLoginThrottle(key, now);
};

const recordLoginFailure = async (env, { key, now, storage, attempt: current }) => {
  const attempt = current && current.firstFailureAt + LOGIN_WINDOW_MS > now
    ? current
    : { count: 0, firstFailureAt: now, blockedUntil: 0 };

  attempt.count += 1;
  if (attempt.count >= LOGIN_MAX_FAILURES) {
    attempt.blockedUntil = now + LOGIN_BLOCK_MS;
  }
  if (storage === 'd1' && env.BLOG_DB) {
    await writePersistentLoginAttempt(env, key, attempt).catch(() => {
      loginAttempts.set(key, attempt);
    });
    return;
  }
  loginAttempts.set(key, attempt);
};

const clearLoginFailure = async (env, { key, storage }) => {
  if (storage === 'd1' && env.BLOG_DB) {
    await deletePersistentLoginAttempt(env, key).catch(() => null);
  }
  loginAttempts.delete(key);
};

const sessionSignature = async (secret, expiresAt) => {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return base64UrlEncode(await crypto.subtle.sign('HMAC', key, encoder.encode(String(expiresAt))));
};

const verifySession = async (token, secret) => {
  const [expiresAt, signature] = text(token).split('.');
  const expires = Number(expiresAt);
  if (!Number.isFinite(expires) || expires <= Date.now()) return false;
  const expected = await sessionSignature(secret, expiresAt);
  return timingSafeEqual(signature, expected);
};

async function readRequestPassword(request) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 4096) return '';
  const body = await request.clone().json().catch(() => ({}));
  return text(body.password);
}

const isPasswordLoginRequest = (request) => (
  request.method === 'POST' && new URL(request.url).pathname === '/api/admin/check'
);

export async function verifyAdmin(request, env) {
  const configured = requireAdminPassword(env);
  if (!configured.ok) return configured;

  const session = readCookie(request, SESSION_COOKIE);
  if (session && await verifySession(session, configured.password)) {
    return { ok: true, session: true };
  }

  if (!isPasswordLoginRequest(request)) {
    return { ok: false, status: 401, message: 'Invalid password' };
  }

  const throttle = await loginThrottle(request, env);
  if (!throttle.ok) {
    return {
      ok: false,
      status: 429,
      message: 'Too many login attempts',
      headers: { 'retry-after': String(throttle.retryAfter) },
    };
  }

  const password = await readRequestPassword(request);
  if (!timingSafeEqual(password, configured.password)) {
    await recordLoginFailure(env, throttle);
    return { ok: false, status: 401, message: 'Invalid password' };
  }

  await clearLoginFailure(env, throttle);
  return { ok: true };
}

export async function createAdminSessionCookie(env) {
  const configured = requireAdminPassword(env);
  if (!configured.ok) return '';
  const expiresAt = Date.now() + SESSION_MAX_AGE * 1000;
  const signature = await sessionSignature(configured.password, expiresAt);
  return [
    `${SESSION_COOKIE}=${expiresAt}.${signature}`,
    `Max-Age=${SESSION_MAX_AGE}`,
    'Path=/api/admin',
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
  ].join('; ');
}

export function clearAdminSessionCookie() {
  return `${SESSION_COOKIE}=; Max-Age=0; Path=/api/admin; HttpOnly; Secure; SameSite=Strict`;
}

function timingSafeEqual(left, right) {
  const leftBytes = encoder.encode(String(left ?? ''));
  const rightBytes = encoder.encode(String(right ?? ''));
  const length = Math.max(leftBytes.length, rightBytes.length);
  let diff = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < length; index += 1) {
    diff |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return diff === 0;
}
