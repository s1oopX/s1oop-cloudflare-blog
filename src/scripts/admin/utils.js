export const formatError = (message) => {
  if (message === 'Invalid password') return '密码不正确';
  if (message === 'ADMIN_PASSWORD is not configured') return '访问密码未配置';
  if (message?.includes('D1 binding BLOG_DB is not configured')) return 'D1 文章库未绑定';
  if (message?.includes('D1 settings table is not configured')) return 'D1 设置表未迁移';
  if (message?.includes('D1 comments table is not configured')) return 'D1 评论表未迁移';
  if (message?.includes('Comment limit reached') || message?.includes('同一网络最多留言 2 条')) return '同一网络最多留言 2 条';
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
