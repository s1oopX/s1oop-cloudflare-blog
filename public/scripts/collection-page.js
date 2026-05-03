const postList = document.querySelector('[data-collection-post-list]');
const pagination = document.querySelector('[data-collection-pagination]');
const totalNode = document.querySelector('[data-collection-total]');
const latestNode = document.querySelector('[data-collection-latest]');
const initialPosts = JSON.parse(postList?.dataset.initialPosts || '[]');
const collectionMeta = JSON.parse(postList?.dataset.collectionMeta || '{}');
const otherCollectionMeta = JSON.parse(postList?.dataset.otherCollectionMeta || '[]');
const pageSize = Number(postList?.dataset.pageSize || 10);
const configuredPage = Number(postList?.dataset.currentPage || 0);

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

const currentPageFromUrl = () => {
  const queryPage = Number(new URLSearchParams(window.location.search).get('page') || 0);
  if (Number.isFinite(queryPage) && queryPage > 0) return queryPage;
  const pathPage = Number(window.location.pathname.match(/\/page\/(\d+)\/?$/)?.[1] || 0);
  if (Number.isFinite(pathPage) && pathPage > 0) return pathPage;
  return configuredPage || 1;
};

const renderPagination = (currentPage, totalPages) => {
  if (!pagination) return;
  if (totalPages <= 1) {
    pagination.innerHTML = '';
    return;
  }

  const baseHref = `/collections/${encodeURIComponent(collectionMeta.slug || '')}`;
  const hrefForPage = (page) => page === 1 ? baseHref : `${baseHref}?page=${page}`;
  const pages = Array.from({ length: totalPages }, (_, index) => index + 1);
  pagination.hidden = false;
  pagination.innerHTML = `
    <nav class="ui-pagination" aria-label="分页">
      <a class="ui-page-step ${currentPage <= 1 ? 'is-disabled' : ''}" ${currentPage > 1 ? `href="${hrefForPage(currentPage - 1)}"` : 'aria-disabled="true"'}>上一页</a>
      <div class="ui-page-numbers">
        ${pages.map((page) => `<a class="ui-page-number ${page === currentPage ? 'is-active' : ''}" href="${hrefForPage(page)}" ${page === currentPage ? 'aria-current="page"' : ''}>${page}</a>`).join('')}
      </div>
      <a class="ui-page-step ${currentPage >= totalPages ? 'is-disabled' : ''}" ${currentPage < totalPages ? `href="${hrefForPage(currentPage + 1)}"` : 'aria-disabled="true"'}>下一页</a>
    </nav>
  `;
};

fetch('/api/posts?limit=100')
  .then((response) => response.ok ? response.json() : null)
  .then((data) => {
    const runtimePosts = Array.isArray(data?.posts) ? data.posts.filter((post) => post?.runtime) : [];
    const runtimeMatches = runtimePosts.filter((post) => belongsToCollection(post, collectionMeta));
    const existingHrefs = new Set(initialPosts.map((post) => post.href));
    const posts = runtimeMatches
      .filter((post) => post?.href && !existingHrefs.has(post.href))
      .concat(initialPosts)
      .sort((a, b) => normalizeTime(b.date) - normalizeTime(a.date));

    if (totalNode) totalNode.textContent = String(posts.length);
    if (latestNode) latestNode.textContent = posts[0] ? formatDate(posts[0].date) : '-';

    for (const other of otherCollectionMeta) {
      const count = (other.baseCount || 0) + runtimePosts.filter((post) => belongsToCollection(post, other)).length;
      const node = document.querySelector(`[data-other-collection-count="${other.slug}"]`);
      if (node) node.textContent = `${count} 篇`;
    }

    if (!postList) return;
    postList.querySelectorAll('.post-card, [data-collection-empty]').forEach((node) => node.remove());
    if (!runtimeMatches.length) {
      postList.insertAdjacentHTML('afterbegin', '<div class="ui-panel p-5 text-sm text-zinc-400" data-collection-empty>D1 暂无文章。</div>');
      renderPagination(1, 1);
      return;
    }
    const currentPage = Math.max(1, currentPageFromUrl());
    const totalPages = Math.max(1, Math.ceil(posts.length / pageSize));
    const boundedPage = Math.min(currentPage, totalPages);
    const visiblePosts = posts.slice((boundedPage - 1) * pageSize, boundedPage * pageSize);
    postList.insertAdjacentHTML('afterbegin', visiblePosts.map(renderPost).join(''));
    renderPagination(boundedPage, totalPages);
  })
  .catch(() => {});
