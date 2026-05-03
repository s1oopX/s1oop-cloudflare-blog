const postList = document.querySelector('[data-collection-post-list]');
const pagination = document.querySelector('[data-collection-pagination]');
const totalNode = document.querySelector('[data-collection-total]');
const latestNode = document.querySelector('[data-collection-latest]');
const staticPosts = JSON.parse(postList?.dataset.staticPosts || '[]');
const collectionMeta = JSON.parse(postList?.dataset.collectionMeta || '{}');
const otherCollectionMeta = JSON.parse(postList?.dataset.otherCollectionMeta || '[]');
const pageSize = Number(postList?.dataset.pageSize || 10);

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

const normalizeTime = (value) => {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
};

const belongsToCollection = (post, collection) => {
  const tags = new Set((post.tags || []).map((tag) => String(tag).toLowerCase()));
  return (collection.runtimeTags || []).some((tag) => tags.has(String(tag).toLowerCase()));
};

const renderTags = (tags = []) => {
  const visibleTags = tags.slice(0, 2);
  const extraTagCount = Math.max(0, tags.length - visibleTags.length);
  const badges = visibleTags.map((tag) => `<span class="ui-badge">#${escapeHtml(tag)}</span>`).join('');
  const extraBadge = extraTagCount > 0 ? `<span class="ui-badge">+${extraTagCount}</span>` : '';
  return badges + extraBadge;
};

const renderPost = (post) => `
  <article class="post-card ui-panel ui-panel-link">
    <a href="${escapeHtml(post.href)}" class="post-card-link">
      <div class="post-card-media">
        ${post.image ? `<img src="${escapeHtml(post.image.src)}" alt="${escapeHtml(post.image.alt)}" loading="lazy" decoding="async" />` : '<span aria-hidden="true"></span>'}
        <time>${formatDate(post.date)}</time>
      </div>
      <div class="post-card-main">
        <div class="post-card-meta">${renderTags(post.tags)}</div>
        <h2 class="post-card-title">${escapeHtml(post.title)}</h2>
        <p class="post-card-excerpt">${escapeHtml(post.excerpt)}</p>
        <div class="post-card-action"><span>阅读文章</span><span aria-hidden="true">-&gt;</span></div>
      </div>
    </a>
  </article>
`;

fetch('/api/posts?limit=100')
  .then((response) => response.ok ? response.json() : null)
  .then((data) => {
    const runtimePosts = Array.isArray(data?.posts) ? data.posts.filter((post) => post?.runtime) : [];
    const runtimeMatches = runtimePosts.filter((post) => belongsToCollection(post, collectionMeta));
    const existingHrefs = new Set(staticPosts.map((post) => post.href));
    const posts = runtimeMatches
      .filter((post) => post?.href && !existingHrefs.has(post.href))
      .concat(staticPosts)
      .sort((a, b) => normalizeTime(b.date) - normalizeTime(a.date));

    if (totalNode) totalNode.textContent = String(posts.length);
    if (latestNode) latestNode.textContent = posts[0] ? formatDate(posts[0].date) : '-';

    for (const other of otherCollectionMeta) {
      const count = other.staticCount + runtimePosts.filter((post) => belongsToCollection(post, other)).length;
      const node = document.querySelector(`[data-other-collection-count="${other.slug}"]`);
      if (node) node.textContent = `${count} 篇`;
    }

    if (!runtimeMatches.length || !postList) return;
    postList.querySelectorAll('.post-card, [data-collection-empty]').forEach((node) => node.remove());
    const visiblePosts = posts.slice(0, pageSize);
    postList.insertAdjacentHTML('afterbegin', visiblePosts.map(renderPost).join(''));
    if (pagination) pagination.hidden = posts.length <= pageSize;
  })
  .catch(() => {});
