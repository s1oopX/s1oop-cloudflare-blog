export const formatError = (message) => {
  if (message === 'Invalid password') return '密码不正确';
  if (message === 'ADMIN_PASSWORD is not configured') return '访问密码未配置';
  if (message?.includes('D1 binding BLOG_DB is not configured')) return 'D1 文章库未绑定';
  if (message?.includes('D1 settings table is not configured')) return 'D1 设置表未迁移';
  if (message?.includes('D1 comments table is not configured')) return 'D1 评论表未迁移';
  if (message?.includes('Comment limit reached') || message?.includes('同一网络最多留言 2 条')) return '同一网络最多留言 2 条';
  if (message?.includes('留言需要 5 到 30 个字')) return '留言需要 5 到 30 个字';
  if (message?.includes('Comment payload is too large')) return '留言内容过大';
  if (message?.includes('Invalid comment content type')) return '留言请求格式不正确';
  if (message?.includes('留言太频繁，请稍后再试')) return '留言太频繁，请稍后再试';
  if (message?.includes('Each image must be 1 MB or smaller')) return '单张图片不能超过 1 MB';
  if (message?.includes('Only JPEG, PNG, WebP and GIF images are supported')) return '仅支持 JPEG / PNG / WebP / GIF';
  return message || '操作失败';
};

export const setState = (node, text, tone = 'muted') => {
  if (!node) return;
  node.textContent = text;
  node.dataset.tone = tone;
};

export const readableSize = (size) => {
  if (!Number.isFinite(size)) return '-';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
};

const toDate = (value) => {
  if (!value) return null;
  const text = String(value);
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? `${text}T00:00:00`
    : `${text.replace(' ', 'T')}${/[zZ]|[+-]\d{2}:?\d{2}$/.test(text) ? '' : 'Z'}`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatDate = (value) => {
  const date = toDate(value);
  if (!date) return value || '-';
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
};

export const formatDateTime = (value) => {
  const date = toDate(value);
  if (!date) return value || '-';
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character]));

export const toSlug = (value) => String(value || '')
  .replace(/\.[a-z0-9]+$/i, '')
  .normalize('NFKD')
  .replace(/[^\w\s-]/g, '')
  .trim()
  .toLowerCase()
  .replace(/[\s_]+/g, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '');

export const copyText = async (value) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
};

export const downloadText = (filename, value) => {
  const blob = new Blob([value], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};
