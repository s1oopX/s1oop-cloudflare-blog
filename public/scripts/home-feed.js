const homeFeed = document.querySelector('[data-home-feed]');

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character]));

const formatDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(value || '-');
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
};

const renderTags = (tags = []) => {
  const visibleTags = tags.slice(0, 2);
  const extraTagCount = Math.max(0, tags.length - visibleTags.length);
  const badges = visibleTags.map((tag) => `<span class="ui-badge">#${escapeHtml(tag)}</span>`).join('');
  const extraBadge = extraTagCount > 0 ? `<span class="ui-badge">+${extraTagCount}</span>` : '';
  return badges + extraBadge;
};

const renderHomePost = (post) => `
  <article class="post-card" data-runtime-post="${escapeHtml(post.slug)}">
    <a href="${escapeHtml(post.href)}" class="post-card-link">
      <div class="post-card-header">
        <time class="post-card-date">${formatDate(post.date)}</time>
        <div class="post-card-meta">${renderTags(post.tags)}</div>
      </div>
      <h2 class="post-card-title">${escapeHtml(post.title)}</h2>
      <p class="post-card-excerpt">${escapeHtml(post.excerpt)}</p>
      ${post.image?.src ? `
      <div class="post-card-media">
        <img src="${escapeHtml(post.image.src)}" alt="${escapeHtml(post.image.alt || '')}" loading="lazy" decoding="async" />
      </div>` : ''}
      <div class="post-card-action"><span>阅读全文</span><span aria-hidden="true">-&gt;</span></div>
    </a>
  </article>
`;

if (homeFeed) {
  fetch('/api/posts?limit=6')
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      const posts = Array.isArray(data?.posts) ? data.posts : [];
      if (posts.length > 0) {
        homeFeed.innerHTML = posts.map((p) => renderHomePost(p)).join('');
      } else {
        homeFeed.innerHTML = '<div class="py-12 text-center text-sm text-zinc-400">暂无最新文章。</div>';
      }
    })
    .catch(() => {
      homeFeed.innerHTML = '<div class="py-12 text-center text-sm text-zinc-400">文章加载失败，请稍后刷新。</div>';
    });
}
