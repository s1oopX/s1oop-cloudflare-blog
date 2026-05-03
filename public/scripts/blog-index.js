const postList = document.querySelector('[data-post-list]');
const pagination = document.querySelector('[data-post-pagination]');
const postCount = document.querySelector('[data-post-count]');
const tagCount = document.querySelector('[data-tag-count]');
const latestPost = document.querySelector('[data-latest-post]');
const archivePathCountNodes = document.querySelectorAll('[data-archive-path-count]');
const initialPosts = JSON.parse(postList?.dataset.initialPosts || '[]');
const archivePaths = JSON.parse(postList?.dataset.archivePaths || '[]');
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

const renderTags = (tags = []) => {
  const visibleTags = tags.slice(0, 2);
  const extraTagCount = Math.max(0, tags.length - visibleTags.length);
  const badges = visibleTags.map((tag) => `<span class="ui-badge">#${escapeHtml(tag)}</span>`).join('');
  const extraBadge = extraTagCount > 0 ? `<span class="ui-badge">+${extraTagCount}</span>` : '';
  return badges + extraBadge;
};

const normalizeTime = (value) => {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
};

const renderPost = (post) => `
  <article class="post-card ui-panel ui-panel-link" data-runtime-post="${escapeHtml(post.slug)}">
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

const tagCountsFor = (posts = []) => {
  const counts = new Map();
  for (const post of posts) {
    for (const tag of post.tags || []) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }
  return counts;
};

const belongsToArchivePath = (post, path) => {
  const tags = new Set((post.tags || []).map((tag) => String(tag).toLowerCase()));
  return (path.runtimeTags || []).some((tag) => tags.has(String(tag).toLowerCase()));
};

const archivePathsFor = (runtimePosts = []) => archivePaths.map((path) => ({
  ...path,
  count: path.count + runtimePosts.filter((post) => belongsToArchivePath(post, path)).length,
}));

const updateArchivePathCounts = (paths = archivePaths) => {
  const counts = new Map(paths.map((path) => [String(path.slug || path.href), path.count]));
  archivePathCountNodes.forEach((node) => {
    const key = node.dataset.archivePathCount;
    if (counts.has(key)) node.textContent = `${counts.get(key)} 篇`;
  });
};

const renderPagination = (currentPage, totalPages) => {
  if (!pagination) return;
  if (totalPages <= 1) {
    pagination.innerHTML = '';
    return;
  }

  const hrefForPage = (page) => page === 1 ? '/blog' : `/blog?page=${page}`;
  const pages = Array.from({ length: totalPages }, (_, index) => index + 1);
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

const renderCombinedPosts = (runtimePosts = []) => {
  if (!postList) return;

  const uniqueRuntimePosts = runtimePosts.filter((post) => post?.runtime && post?.href);
  const posts = initialPosts
    .concat(uniqueRuntimePosts)
    .sort((a, b) => normalizeTime(b.date) - normalizeTime(a.date));
  const archivePathCounts = archivePathsFor(uniqueRuntimePosts);
  const currentPage = Math.max(1, Number(new URLSearchParams(window.location.search).get('page') || 1));
  const totalPages = Math.max(1, Math.ceil(posts.length / pageSize));
  const boundedPage = Math.min(currentPage, totalPages);
  const visiblePosts = posts.slice((boundedPage - 1) * pageSize, boundedPage * pageSize);

  postList.querySelectorAll('.post-card, [data-archive-empty]').forEach((node) => node.remove());
  const renderedPosts = visiblePosts.map((post) => renderPost(post)).join('');
  postList.insertAdjacentHTML(
    'afterbegin',
    renderedPosts || '<div class="ui-panel p-5 text-sm text-zinc-400" data-archive-empty>D1 暂无文章。</div>',
  );
  renderPagination(boundedPage, totalPages);
  updateArchivePathCounts(archivePathCounts);

  if (postCount) postCount.textContent = String(posts.length);
  if (tagCount) tagCount.textContent = String(tagCountsFor(posts).size);
  if (latestPost) latestPost.textContent = posts[0] ? formatDate(posts[0].date) : '-';
};

fetch('/api/posts?limit=100')
  .then((response) => response.ok ? response.json() : null)
  .then((data) => {
    const posts = Array.isArray(data?.posts) ? data.posts : [];
    renderCombinedPosts(posts);
  })
  .catch(() => {});
