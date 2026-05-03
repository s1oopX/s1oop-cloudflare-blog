export const requestAdmin = async (passwordKey, path, options = {}) => {
  if (!sessionStorage.getItem(passwordKey)) throw new Error('Invalid password');

  const headers = new Headers(options.headers || {});
  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.message || '请求失败');
  return data;
};

export const verifySession = async () => {
  const response = await fetch('/api/admin/check');
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.message || '密码验证失败');
  return data;
};

export const verifyPassword = async (password) => {
  const response = await fetch('/api/admin/check', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.message || '密码验证失败');
  return data;
};

export const clearSession = async () => {
  await fetch('/api/admin/logout', { method: 'POST' }).catch(() => null);
};
