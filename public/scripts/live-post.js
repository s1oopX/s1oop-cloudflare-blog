const page = document.querySelector('[data-live-post-page]');
const content = document.querySelector('[data-live-post-content]');
const dateNode = document.querySelector('[data-live-post-date]');
const updatedRow = document.querySelector('[data-live-post-updated-row]');
const updatedNode = document.querySelector('[data-live-post-updated]');
const wordsNode = document.querySelector('[data-live-post-words]');
const minutesNode = document.querySelector('[data-live-post-minutes]');
const tagsNode = document.querySelector('[data-live-post-tags]');

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character]));

const formatDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || '-';
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
};

const formatDateTime = (value) => {
  const normalized = String(value || '').replace(' ', 'T');
  const date = new Date(`${normalized}${/[zZ]|[+-]\d{2}:?\d{2}$/.test(normalized) ? '' : 'Z'}`);
  if (Number.isNaN(date.getTime())) return value || '-';
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const timestamp = (value) => {
  const normalized = String(value || '').replace(' ', 'T');
  const date = new Date(`${normalized}${/[zZ]|[+-]\d{2}:?\d{2}$/.test(normalized) ? '' : 'Z'}`);
  return date.getTime();
};

const shouldShowUpdated = (post) => {
  if (!post?.createdAt || !post?.updatedAt) return false;
  const created = timestamp(post.createdAt);
  const updated = timestamp(post.updatedAt);
  return Number.isFinite(created) && Number.isFinite(updated) && updated - created > 60_000;
};

const renderPost = (post) => {
  document.title = `${post.title} | s1oop's Blog`;
  page?.querySelector('.ui-page-head h1')?.replaceChildren(document.createTextNode(post.title));
  page?.querySelector('.ui-description')?.replaceChildren(document.createTextNode(post.excerpt || ''));
  const eyebrow = page?.querySelector('.ui-eyebrow');
  if (eyebrow) eyebrow.textContent = formatDate(post.date);

  if (content) content.innerHTML = post.html || '<p>这篇文章暂时没有正文。</p>';
  if (dateNode) dateNode.textContent = formatDate(post.date);
  if (updatedRow && updatedNode) {
    const showUpdated = shouldShowUpdated(post);
    updatedRow.hidden = !showUpdated;
    if (showUpdated) updatedNode.textContent = formatDateTime(post.updatedAt);
  }
  if (wordsNode) wordsNode.textContent = `约 ${post.wordCount || 0} 字`;
  if (minutesNode) minutesNode.textContent = `${post.readingMinutes || 1} 分钟`;
  if (tagsNode) {
    tagsNode.innerHTML = (post.tags || [])
      .map((tag) => `<a href="/search?q=${encodeURIComponent(tag)}" class="ui-badge no-underline hover:text-white">#${escapeHtml(tag)}</a>`)
      .join('');
  }
};

const slug = new URLSearchParams(window.location.search).get('slug');
if (!slug) {
  if (content) content.innerHTML = '<p>缺少文章标识。</p>';
} else {
  fetch(`/api/posts/${encodeURIComponent(slug)}`)
    .then((response) => response.ok ? response.json() : Promise.reject(new Error('not found')))
    .then((data) => {
      if (!data?.post) throw new Error('not found');
      renderPost(data.post);
    })
    .catch(() => {
      if (content) content.innerHTML = '<p>没有找到这篇实时文章。</p>';
    });
}
