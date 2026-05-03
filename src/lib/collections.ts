export const collections = [
  {
    slug: 'hot',
    title: '热点分享',
    eyebrow: 'recent focus',
    description: '当前阶段更值得先看的内容，包含视觉方向、博客定位和近期最能代表这里气质的文章。',
    image: {
      src: '/images/collections/hot-panel-20260503.jpg',
      alt: '深色笔记本电脑上显示现代化控制面板，代表近期重点内容入口',
    },
    runtimeTags: ['热点'],
  },
  {
    slug: 'tech',
    title: '方法记录',
    eyebrow: 'practical notes',
    description: '围绕阅读体验、内容整理、视觉气质和长期回看的实践记录，强调能直接带走的判断。',
    image: {
      src: '/images/collections/tech.jpg',
      alt: '带手写任务板和屏幕的现代工作桌面，代表方法与维护流程',
    },
    runtimeTags: ['方法'],
  },
  {
    slug: 'learn',
    title: '学习分享',
    eyebrow: 'learning notes',
    description: '写作、阅读、工具和方法相关记录，保留可复用的学习过程与经验。',
    image: {
      src: '/images/collections/learn-notes-20260503.jpg',
      alt: '平板上用手写笔记录清单，代表学习与复盘记录',
    },
    runtimeTags: ['学习'],
  },
];

export type BlogCollection = (typeof collections)[number];

export function collectionHref(collection: BlogCollection) {
  return `/collections/${collection.slug}`;
}

export function collectionBySlug(slug: string | undefined) {
  return collections.find((collection) => collection.slug === slug);
}
