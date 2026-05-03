import { text } from './strings.js';

const SESSION_COOKIE = 's1oop_admin_session';
const SESSION_MAX_AGE = 60 * 60 * 6;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_BLOCK_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;
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

const loginThrottle = (request) => {
  const key = clientKey(request);
  const now = Date.now();
  const attempt = loginAttempts.get(key);

  if (!attempt) return { ok: true, key, now };
  if (attempt.blockedUntil && attempt.blockedUntil > now) {
    return { ok: false, key, now, retryAfter: Math.ceil((attempt.blockedUntil - now) / 1000) };
  }
  if (attempt.firstFailureAt + LOGIN_WINDOW_MS <= now) {
    loginAttempts.delete(key);
    return { ok: true, key, now };
  }

  return { ok: true, key, now };
};

const recordLoginFailure = ({ key, now }) => {
  const current = loginAttempts.get(key);
  const attempt = current && current.firstFailureAt + LOGIN_WINDOW_MS > now
    ? current
    : { count: 0, firstFailureAt: now, blockedUntil: 0 };

  attempt.count += 1;
  if (attempt.count >= LOGIN_MAX_FAILURES) {
    attempt.blockedUntil = now + LOGIN_BLOCK_MS;
  }
  loginAttempts.set(key, attempt);
};

const clearLoginFailure = (key) => {
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
  const body = await request.clone().json().catch(() => ({}));
  return text(body.password);
}

export async function verifyAdmin(request, env) {
  const configured = requireAdminPassword(env);
  if (!configured.ok) return configured;

  const session = readCookie(request, SESSION_COOKIE);
  if (session && await verifySession(session, configured.password)) {
    return { ok: true, session: true };
  }

  const throttle = loginThrottle(request);
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
    recordLoginFailure(throttle);
    return { ok: false, status: 401, message: 'Invalid password' };
  }

  clearLoginFailure(throttle.key);
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
