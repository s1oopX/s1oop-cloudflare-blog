import type { BlogPost } from './posts';
import { postSlug } from './posts';

export const collections = [
  {
    slug: 'hot',
    title: '热点分享',
    eyebrow: 'recent focus',
    description: '当前阶段更值得先看的内容，包含视觉方向、博客定位和近期最能代表这里气质的文章。',
    posts: ['noir-archive-design', 'hello-cloudflare'],
  },
  {
    slug: 'tech',
    title: '方法记录',
    eyebrow: 'practical notes',
    description: '围绕阅读体验、内容整理、视觉气质和长期回看的实践记录，强调能直接带走的判断。',
    posts: ['astro-cloudflare-workflow', 'noir-archive-design'],
  },
  {
    slug: 'learn',
    title: '学习分享',
    eyebrow: 'learning notes',
    description: '写作、阅读、工具和方法相关记录，保留可复用的学习过程与经验。',
    posts: ['astro-cloudflare-workflow', 'private-blog-editing-checklist'],
  },
];

export type BlogCollection = (typeof collections)[number];

export function collectionHref(collection: BlogCollection) {
  return `/collections/${collection.slug}`;
}

export function postsForCollection(collection: BlogCollection, posts: BlogPost[]) {
  const bySlug = new Map(posts.map((post) => [postSlug(post), post]));
  return collection.posts.map((slug) => bySlug.get(slug)).filter(Boolean) as BlogPost[];
}

export function collectionBySlug(slug: string | undefined) {
  return collections.find((collection) => collection.slug === slug);
}
