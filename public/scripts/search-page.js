const form = document.querySelector('form[action="/search"]');
const input = document.querySelector('#q');
const results = document.querySelector('#search-results');
const status = document.querySelector('#search-status');
const sidebarState = document.querySelector('#search-sidebar-state');
const summary = document.querySelector('[data-search-summary]');
const postCount = document.querySelector('[data-search-post-count]');
const tagCount = document.querySelector('[data-search-tag-count]');
const topicGrid = document.querySelector('[data-search-topic-grid]');
let index = [];

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character]));

const shareBucket = (count, maxCount) => String(Math.max(10, Math.min(100, Math.ceil((count / maxCount) * 10) * 10)));

const renderTags = (tags = []) => {
  const visibleTags = tags.slice(0, 2);
  const extraTagCount = Math.max(0, tags.length - visibleTags.length);
  const badges = visibleTags.map((tag) => `<span class="ui-badge">#${escapeHtml(tag)}</span>`).join('');
  const extraBadge = extraTagCount > 0 ? `<span class="ui-badge">+${extraTagCount}</span>` : '';
  return badges + extraBadge;
};

const renderEmpty = (eyebrow, message) => `
  <article class="ui-panel">
    <div class="ui-panel-header">
      <p class="ui-eyebrow">${escapeHtml(eyebrow)}</p>
    </div>
    <div class="ui-panel-body">
      <p class="text-sm leading-6 text-zinc-400">${escapeHtml(message)}</p>
    </div>
  </article>
`;

const normalizeTime = (value) => {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
};

const matchesKeyword = (post, keyword) => {
  const haystack = [post.title, post.excerpt, post.body, (post.tags || []).join(' ')].join(' ').toLowerCase();
  return haystack.includes(keyword.toLowerCase());
};

const topicCountsFor = (posts = []) => {
  const topics = Array.from(new Set(posts.flatMap((post) => post.tags || [])));
  return topics
    .map((tag) => ({
      tag,
      count: posts.filter((post) => matchesKeyword(post, tag)).length,
    }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
};

const renderTopicIndex = () => {
  const tagStats = topicCountsFor(index);
  const visibleTagStats = tagStats.slice(0, 6);
  const maxTagCount = Math.max(1, ...tagStats.map((item) => item.count));

  if (summary) summary.textContent = `${index.length} 篇文章 / 常用入口`;
  if (postCount) postCount.textContent = String(index.length);
  if (tagCount) tagCount.textContent = String(tagStats.length);
  if (!topicGrid) return;

  topicGrid.innerHTML = visibleTagStats.map(({ tag, count }) => `
    <a
      href="/search?q=${encodeURIComponent(tag)}"
      class="tag-index-card ui-panel ui-panel-link no-underline"
      data-share-bucket="${shareBucket(count, maxTagCount)}"
    >
      <span class="tag-index-name">#${escapeHtml(tag)}</span>
      <span class="tag-index-count">${count} 篇</span>
      <span class="tag-index-meter" aria-hidden="true"></span>
    </a>
  `).join('');
};

const renderResult = (post) => `
  <article class="post-card ui-panel ui-panel-link">
    <a href="${escapeHtml(post.href)}" class="post-card-link">
      <div class="post-card-media">
        ${post.image ? `<img src="${escapeHtml(post.image.src)}" alt="${escapeHtml(post.image.alt)}" loading="lazy" decoding="async" />` : '<span aria-hidden="true"></span>'}
        <time>${new Date(post.date).toLocaleDateString('zh-CN')}</time>
      </div>
      <div class="post-card-main">
        <div class="post-card-meta">
          ${renderTags(post.tags)}
        </div>
        <h2 class="post-card-title">${escapeHtml(post.title)}</h2>
        <p class="post-card-excerpt">${escapeHtml(post.excerpt)}</p>
        <div class="post-card-action"><span>阅读文章</span><span aria-hidden="true">-&gt;</span></div>
      </div>
    </a>
  </article>
`;

const renderSearch = () => {
  const keyword = input?.value?.trim().toLowerCase() ?? '';

  if (!keyword) {
    if (status) status.textContent = '输入关键词后显示结果。';
    if (sidebarState) sidebarState.textContent = '请输入关键词';
    if (results) results.innerHTML = '';
    return;
  }

  const matched = index.filter((post) => matchesKeyword(post, keyword));

  if (status) status.textContent = `找到 ${matched.length} 篇相关文章。`;
  if (sidebarState) sidebarState.textContent = `${matched.length} 条结果`;
  if (results) results.innerHTML = matched.map(renderResult).join('') || renderEmpty('没有结果', '没有找到匹配结果。可以换一个关键词，或从全部文章继续浏览。');
};

fetch('/api/posts?limit=100&include=search')
  .then((response) => response.ok ? response.json() : null)
  .then((runtime) => {
    const runtimePosts = Array.isArray(runtime?.posts) ? runtime.posts : [];
    index = runtimePosts
      .filter((post) => post?.runtime && post?.href)
      .sort((a, b) => normalizeTime(b.date) - normalizeTime(a.date));
    renderTopicIndex();
    const query = new URLSearchParams(window.location.search).get('q')?.trim() ?? '';
    if (query && input) input.value = query;
    renderSearch();
  })
  .catch(() => {
    if (status) status.textContent = '当前无法搜索。';
    if (sidebarState) sidebarState.textContent = '暂不可用';
    if (results) results.innerHTML = renderEmpty('搜索暂不可用', '搜索数据暂时无法读取。可以稍后再试，或从全部文章继续浏览。');
  });

form?.addEventListener('submit', (event) => {
  event.preventDefault();
  const keyword = input?.value?.trim() ?? '';
  const url = new URL(window.location.href);
  if (keyword) {
    url.searchParams.set('q', keyword);
  } else {
    url.searchParams.delete('q');
  }
  window.history.replaceState({}, '', url);
  renderSearch();
});

input?.addEventListener('input', renderSearch);
