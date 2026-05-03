const collectionGrid = document.querySelector('[data-collection-grid]');
const collectionMeta = JSON.parse(collectionGrid?.dataset.collectionMeta || '[]');

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character]));

const belongsToCollection = (post, collection) => {
  const tags = new Set((post.tags || []).map((tag) => String(tag).toLowerCase()));
  return (collection.runtimeTags || []).some((tag) => tags.has(String(tag).toLowerCase()));
};

fetch('/api/posts?limit=100')
  .then((response) => response.ok ? response.json() : null)
  .then((data) => {
    const runtimePosts = Array.isArray(data?.posts) ? data.posts.filter((post) => post?.runtime) : [];
    for (const collection of collectionMeta) {
      const card = document.querySelector(`[data-collection-card="${collection.slug}"]`);
      if (!card) continue;

      const runtimeMatches = runtimePosts.filter((post) => belongsToCollection(post, collection));
      if (!runtimeMatches.length) continue;

      const countNode = card.querySelector('[data-collection-count]');
      const listNode = card.querySelector('[data-collection-list]');
      const existingTitles = Array.from(listNode?.querySelectorAll('span') || []).map((node) => node.textContent || '');
      const titles = runtimeMatches.map((post) => post.title).concat(existingTitles).slice(0, 2);
      const baseCount = Number.parseInt(countNode?.textContent || '0', 10) || 0;

      if (countNode) countNode.textContent = `${baseCount + runtimeMatches.length} 篇`;
      if (listNode) listNode.innerHTML = titles.map((title) => `<span>${escapeHtml(title)}</span>`).join('');
    }
  })
  .catch(() => {});
