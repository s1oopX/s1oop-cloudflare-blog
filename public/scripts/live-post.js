const page = document.querySelector('[data-live-post-page]');
const content = document.querySelector('[data-live-post-content]');
const dateNode = document.querySelector('[data-live-post-date]');
const updatedRow = document.querySelector('[data-live-post-updated-row]');
const updatedNode = document.querySelector('[data-live-post-updated]');
const wordsNode = document.querySelector('[data-live-post-words]');
const minutesNode = document.querySelector('[data-live-post-minutes]');
const typeNode = document.querySelector('[data-live-post-type]');
const tagsNode = document.querySelector('[data-live-post-tags]');
const relatedNode = document.querySelector('[data-live-related-posts]');
const navNode = document.querySelector('[data-live-post-nav]');

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

const postKey = (post) => post?.href || post?.slug || '';

const mergePosts = (...groups) => {
  const byKey = new Map();
  for (const post of groups.flat()) {
    const key = postKey(post);
    if (key && !byKey.has(key)) byKey.set(key, post);
  }
  return Array.from(byKey.values());
};

const relatedScore = (post, currentTags) => (
  (post.tags || [])
    .map((tag) => String(tag).toLowerCase())
    .filter((tag) => currentTags.has(tag)).length
);

const renderRelatedPosts = (post, posts = []) => {
  if (!relatedNode) return;

  const currentTags = new Set((post.tags || []).map((tag) => String(tag).toLowerCase()));
  const relatedPosts = posts
    .filter((item) => postKey(item) && postKey(item) !== postKey(post))
    .map((item) => ({ post: item, score: relatedScore(item, currentTags) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return timestamp(b.post.date) - timestamp(a.post.date);
    })
    .slice(0, 3)
    .map((item) => item.post);

  relatedNode.innerHTML = relatedPosts.length > 0
    ? relatedPosts.map((item) => `
      <a href="${escapeHtml(item.href)}" class="article-related-item no-underline">
        <span class="article-related-date">${formatDate(item.date)}</span>
        <span class="article-related-title">${escapeHtml(item.title)}</span>
      </a>
    `).join('')
    : '<p class="text-sm text-zinc-400">暂无其他文章。</p>';
};

const renderReadingNav = (post, posts = []) => {
  if (!navNode) return;

  const sortedPosts = posts
    .filter((item) => postKey(item))
    .sort((a, b) => timestamp(b.date) - timestamp(a.date));
  const currentIndex = sortedPosts.findIndex((item) => postKey(item) === postKey(post));
  const previousPost = currentIndex > 0 ? sortedPosts[currentIndex - 1] : null;
  const nextPost = currentIndex >= 0 && currentIndex < sortedPosts.length - 1 ? sortedPosts[currentIndex + 1] : null;

  if (!previousPost && !nextPost) {
    navNode.hidden = true;
    navNode.innerHTML = '';
    return;
  }

  navNode.innerHTML = `
    ${previousPost ? `
      <a href="${escapeHtml(previousPost.href)}" class="reading-nav-link reading-nav-prev">
        <span class="reading-nav-label">上一篇</span>
        <span class="reading-nav-title">${escapeHtml(previousPost.title)}</span>
      </a>
    ` : ''}
    ${nextPost ? `
      <a href="${escapeHtml(nextPost.href)}" class="reading-nav-link reading-nav-next">
        <span class="reading-nav-label">下一篇</span>
        <span class="reading-nav-title">${escapeHtml(nextPost.title)}</span>
      </a>
    ` : ''}
  `;
  navNode.hidden = false;
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
  Promise.all([
    fetch(`/api/posts/${encodeURIComponent(slug)}`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('not found'))),
    fetch('/api/posts?limit=100')
      .then((response) => response.ok ? response.json() : { posts: [] })
      .catch(() => ({ posts: [] })),
  ])
    .then(([data, listData]) => {
      if (!data?.post) throw new Error('not found');
      renderPost(data.post);
      if (typeNode) typeNode.textContent = 'D1';
      const runtimePosts = Array.isArray(listData?.posts) ? listData.posts : [];
      const posts = mergePosts(runtimePosts);
      renderRelatedPosts(data.post, posts);
      renderReadingNav(data.post, posts);
    })
    .catch(() => {
      if (content) content.innerHTML = '<p>没有找到这篇实时文章。</p>';
      if (relatedNode) relatedNode.innerHTML = '<p class="text-sm text-zinc-400">暂无其他文章。</p>';
    });
}
