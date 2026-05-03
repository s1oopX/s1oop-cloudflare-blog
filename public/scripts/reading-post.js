const page = document.querySelector('[data-reading-post-page]');
const relatedNode = document.querySelector('[data-reading-related-posts]');
const navNode = document.querySelector('[data-reading-nav]');
const currentPost = JSON.parse(page?.dataset.currentPost || 'null');
const staticPosts = JSON.parse(page?.dataset.staticPosts || '[]');

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

const timestamp = (value) => {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
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

const renderRelatedPosts = (posts = []) => {
  if (!relatedNode || !currentPost) return;

  const currentTags = new Set((currentPost.tags || []).map((tag) => String(tag).toLowerCase()));
  const relatedPosts = posts
    .filter((item) => postKey(item) && postKey(item) !== postKey(currentPost))
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

const renderReadingNav = (posts = []) => {
  if (!navNode || !currentPost) return;

  const sortedPosts = posts
    .filter((item) => postKey(item))
    .sort((a, b) => timestamp(b.date) - timestamp(a.date));
  const currentIndex = sortedPosts.findIndex((item) => postKey(item) === postKey(currentPost));
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

if (page && currentPost) {
  fetch('/api/posts?limit=100')
    .then((response) => response.ok ? response.json() : null)
    .then((data) => {
      const runtimePosts = Array.isArray(data?.posts) ? data.posts : [];
      const posts = mergePosts(staticPosts, runtimePosts);
      renderRelatedPosts(posts);
      renderReadingNav(posts);
    })
    .catch(() => {});
}
