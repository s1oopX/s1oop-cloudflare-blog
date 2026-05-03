import { copyText, downloadText, escapeHtml, formatDate, formatDateTime, formatError, setState } from './utils.js';

export const fetchRuntimePost = async (requestAdmin, slug) => {
  const data = await requestAdmin(`/api/admin/posts/${encodeURIComponent(slug)}`);
  if (!data.post?.markdown) throw new Error('没有找到 Markdown');
  return data.post;
};

const renderPostList = ({ postList, postCount }, posts) => {
  if (!postList) return;
  if (postCount) postCount.textContent = String(posts.length);
  if (!posts.length) {
    postList.innerHTML = '<p class="private-list-empty">D1 暂无运行时文章</p>';
    return;
  }

  postList.innerHTML = posts.map((post) => `
    <article class="private-post-row">
      <div>
        <span>发布 ${escapeHtml(formatDate(post.date))}</span>
        <h3>${escapeHtml(post.title || post.slug)}</h3>
        <p>${escapeHtml(post.slug)} · ${post.published ? '已发布' : '草稿'} · ${post.imageCount || 0} 图 · 编辑 ${escapeHtml(formatDateTime(post.updatedAt))}</p>
      </div>
      <div class="private-post-actions">
        <a href="${escapeHtml(post.href)}" target="_blank" rel="noreferrer">查看</a>
        <button type="button" data-edit-post="${escapeHtml(post.slug)}">编辑</button>
        <button type="button" data-copy-post="${escapeHtml(post.slug)}">复制</button>
        <button type="button" data-download-post="${escapeHtml(post.slug)}">下载</button>
        <button type="button" data-delete-post="${escapeHtml(post.slug)}">删除</button>
      </div>
    </article>
  `).join('');
};

export const loadPosts = async (requestAdmin, nodes) => {
  const { postList, postCount } = nodes;
  if (!postList) return;
  postList.innerHTML = '<p class="private-list-empty">正在读取 D1 文章库...</p>';
  try {
    const data = await requestAdmin('/api/admin/posts?limit=50');
    renderPostList(nodes, data.posts || []);
  } catch (error) {
    if (postCount) postCount.textContent = '-';
    postList.innerHTML = `<p class="private-list-empty">${escapeHtml(formatError(error.message))}</p>`;
  }
};

export const bindPostListActions = (requestAdmin, nodes, callbacks = {}) => {
  const { postList, uploadState, orphanAssetsButton } = nodes;
  const { editPost, loadPosts: reloadPosts, checkOverwrite } = callbacks;

  postList?.addEventListener('click', async (event) => {
    const editButton = event.target.closest('[data-edit-post]');
    const copyButton = event.target.closest('[data-copy-post]');
    const downloadButton = event.target.closest('[data-download-post]');
    const deleteButton = event.target.closest('[data-delete-post]');

    if (editButton) {
      const slug = editButton.dataset.editPost;
      if (!slug) return;
      editButton.disabled = true;
      try {
        const post = await fetchRuntimePost(requestAdmin, slug);
        editPost?.(post);
        setState(uploadState, `已载入编辑：${slug}`, 'success');
      } catch (error) {
        setState(uploadState, formatError(error.message), 'error');
      } finally {
        editButton.disabled = false;
      }
      return;
    }

    if (copyButton) {
      const slug = copyButton.dataset.copyPost;
      if (!slug) return;
      copyButton.disabled = true;
      try {
        const post = await fetchRuntimePost(requestAdmin, slug);
        await copyText(post.markdown);
        setState(uploadState, `已复制 Markdown：${slug}`, 'success');
      } catch (error) {
        setState(uploadState, formatError(error.message), 'error');
      } finally {
        copyButton.disabled = false;
      }
      return;
    }

    if (downloadButton) {
      const slug = downloadButton.dataset.downloadPost;
      if (!slug) return;
      downloadButton.disabled = true;
      try {
        const post = await fetchRuntimePost(requestAdmin, slug);
        downloadText(`${slug}.md`, post.markdown);
        setState(uploadState, `已准备下载：${slug}.md`, 'success');
      } catch (error) {
        setState(uploadState, formatError(error.message), 'error');
      } finally {
        downloadButton.disabled = false;
      }
      return;
    }

    if (!deleteButton) return;
    const slug = deleteButton.dataset.deletePost;
    if (!slug || !window.confirm(`删除 D1 文章「${slug}」？`)) return;

    deleteButton.disabled = true;
    try {
      await requestAdmin(`/api/admin/posts/${encodeURIComponent(slug)}`, { method: 'DELETE' });
      setState(uploadState, `已删除：${slug}`, 'success');
      reloadPosts?.();
      checkOverwrite?.();
    } catch (error) {
      setState(uploadState, formatError(error.message), 'error');
      deleteButton.disabled = false;
    }
  });

  orphanAssetsButton?.addEventListener('click', async () => {
    orphanAssetsButton.disabled = true;
    setState(uploadState, '正在检查孤儿图片...', 'muted');
    try {
      const count = await requestAdmin('/api/admin/assets/orphans');
      if (!count.orphanAssets) {
        setState(uploadState, '没有需要清理的孤儿图片', 'success');
        return;
      }

      const result = await requestAdmin('/api/admin/assets/orphans', { method: 'DELETE' });
      setState(uploadState, `已清理 ${result.deleted || 0} 张孤儿图片`, 'success');
      reloadPosts?.();
    } catch (error) {
      setState(uploadState, formatError(error.message), 'error');
    } finally {
      orphanAssetsButton.disabled = false;
    }
  });
};
