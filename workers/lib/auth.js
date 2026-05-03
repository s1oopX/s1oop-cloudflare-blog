import { text } from './strings.js';

const SESSION_COOKIE = 's1oop_admin_session';
const SESSION_MAX_AGE = 60 * 60 * 6;
const encoder = new TextEncoder();

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

  const password = await readRequestPassword(request);
  if (!timingSafeEqual(password, configured.password)) {
    return { ok: false, status: 401, message: 'Invalid password' };
  }

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
