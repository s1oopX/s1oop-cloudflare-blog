import { text } from './strings.js';

const requireAdminPassword = (env) => {
  const password = text(env.ADMIN_PASSWORD);
  if (!password) {
    return { ok: false, status: 503, message: 'ADMIN_PASSWORD is not configured' };
  }

  return { ok: true, password };
};

async function readRequestPassword(request) {
  const authorization = request.headers.get('authorization') ?? '';
  if (authorization.toLowerCase().startsWith('bearer ')) {
    return authorization.slice(7).trim();
  }

  const headerPassword = request.headers.get('x-admin-password');
  if (headerPassword) return headerPassword.trim();

  const body = await request.clone().json().catch(() => ({}));
  return text(body.password);
}

export async function verifyAdmin(request, env) {
  const configured = requireAdminPassword(env);
  if (!configured.ok) return configured;

  const password = await readRequestPassword(request);
  if (!timingSafeEqual(password, configured.password)) {
    return { ok: false, status: 401, message: 'Invalid password' };
  }

  return { ok: true };
}

function timingSafeEqual(left, right) {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(String(left ?? ''));
  const rightBytes = encoder.encode(String(right ?? ''));
  const length = Math.max(leftBytes.length, rightBytes.length);
  let diff = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < length; index += 1) {
    diff |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return diff === 0;
}
