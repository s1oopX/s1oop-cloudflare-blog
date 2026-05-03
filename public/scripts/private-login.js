const passwordKey = 's1oop-admin-password';
const loginForm = document.querySelector('#private-login');
const loginState = document.querySelector('#private-login-state');

const formatError = (message) => {
  if (message === 'Invalid password') return '密码不正确';
  if (message === 'Too many login attempts') return '尝试次数过多，请稍后再试';
  if (message === 'ADMIN_PASSWORD is not configured') return '访问密码未配置';
  if (message === 'Not Found') return '本地代理未启动';
  return message || '密码验证失败';
};

const setState = (node, text, tone = 'muted') => {
  if (!node) return;
  node.textContent = text;
  node.dataset.tone = tone;
};

const verifySession = async () => {
  const response = await fetch('/api/admin/check');
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.message || '密码验证失败');
  return data;
};

const verifyPassword = async (password) => {
  const response = await fetch('/api/admin/check', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.message || '密码验证失败');
  return data;
};

const enterAdmin = () => {
  sessionStorage.setItem(passwordKey, '1');
  window.location.assign('/s1oop/admin');
};

if (sessionStorage.getItem(passwordKey)) {
  verifySession()
    .then(() => {
      window.location.replace('/s1oop/admin');
    })
    .catch(() => {
      sessionStorage.removeItem(passwordKey);
    });
}

loginForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(loginForm);
  const password = String(form.get('password') || '').trim();
  if (!password) {
    setState(loginState, '请输入密码', 'error');
    return;
  }

  setState(loginState, '正在验证...', 'muted');
  try {
    await verifyPassword(password);
    setState(loginState, '正在进入...', 'success');
    enterAdmin();
  } catch (error) {
    setState(loginState, formatError(error.message), 'error');
  }
});
