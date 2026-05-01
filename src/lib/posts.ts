import type { CollectionEntry } from 'astro:content';

export type BlogPost = CollectionEntry<'posts'>;
export const POSTS_PER_PAGE = 10;

export function postSlug(post: BlogPost) {
  return post.id.replace(/\.(md|mdx)$/, '');
}

export function postHref(post: BlogPost) {
  return `/blog/${postSlug(post)}`;
}

export function formatPostDate(date: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function postExcerpt(post: BlogPost) {
  return post.data.excerpt || '这是一篇个人博客文章。';
}

export function postImage(post: BlogPost) {
  const match = (post.body ?? '').match(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/);
  if (!match) return null;

  return {
    alt: match[1] || post.data.title,
    src: match[2],
  };
}

export function postReadingStats(post: BlogPost) {
  const text = (post.body ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*]\([^)]+\)/g, ' ')
    .replace(/\[[^\]]*]\([^)]+\)/g, ' ')
    .replace(/[#>*_`~-]/g, ' ');
  const cjkCount = (text.match(/[\u3400-\u9fff]/g) ?? []).length;
  const latinWordCount = (text.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g) ?? []).length;
  const wordCount = cjkCount + latinWordCount;

  return {
    wordCount,
    readingMinutes: Math.max(1, Math.ceil(wordCount / 450)),
  };
}

export function relatedPostsFor(post: BlogPost, posts: BlogPost[], limit = 3) {
  const currentTags = new Set(post.data.tags.map((tag) => tag.toLowerCase()));

  return posts
    .filter((item) => item.id !== post.id)
    .map((item) => {
      const sharedTagCount = item.data.tags
        .map((tag) => tag.toLowerCase())
        .filter((tag) => currentTags.has(tag)).length;

      return { post: item, sharedTagCount };
    })
    .sort((a, b) => {
      if (b.sharedTagCount !== a.sharedTagCount) return b.sharedTagCount - a.sharedTagCount;
      return b.post.data.date.getTime() - a.post.data.date.getTime();
    })
    .slice(0, limit)
    .map((item) => item.post);
}

export function visiblePosts(posts: BlogPost[]) {
  return posts
    .filter((post) => !post.data.draft)
    .sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

export function postsWithinRecentDays(posts: BlogPost[], days: number, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - days);
  return posts.filter((post) => post.data.date.getTime() >= start.getTime());
}

export function pageCount(items: unknown[], pageSize = POSTS_PER_PAGE) {
  return Math.max(1, Math.ceil(items.length / pageSize));
}

export function pageItems<T>(items: T[], page: number, pageSize = POSTS_PER_PAGE) {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

export function collectTags(posts: BlogPost[]) {
  return Array.from(new Set(posts.flatMap((post) => post.data.tags))).sort((a, b) => a.localeCompare(b));
}
