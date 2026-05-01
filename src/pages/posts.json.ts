import { getCollection } from 'astro:content';
import { postExcerpt, postHref, postImage, visiblePosts } from '../lib/posts';

export async function GET() {
  const posts = visiblePosts(await getCollection('posts')).map((post) => ({
    title: post.data.title,
    excerpt: postExcerpt(post),
    href: postHref(post),
    date: post.data.date.toISOString(),
    tags: post.data.tags,
    image: postImage(post),
  }));

  return Response.json(posts);
}
