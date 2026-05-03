import { escapeHtml, formatError, setState } from './utils.js';

const formatDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || '-';
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const renderComments = ({ commentList, commentCount }, comments) => {
  if (commentCount) commentCount.textContent = String(comments.length);
  if (!commentList) return;
  if (!comments.length) {
    commentList.innerHTML = '<p class="private-list-empty">暂无留言</p>';
    return;
  }

  commentList.innerHTML = comments.map((comment) => `
    <article class="private-post-row private-comment-row">
      <div>
        <span>${escapeHtml(formatDate(comment.createdAt))} · ${escapeHtml(comment.postSlug)}</span>
        <h3>${escapeHtml(comment.authorName || '访客')}</h3>
        <p class="private-comment-body">${escapeHtml(comment.body)}</p>
      </div>
      <div class="private-post-actions">
        <a href="${escapeHtml(comment.postHref || `/blog/live?slug=${encodeURIComponent(comment.postSlug)}`)}" target="_blank" rel="noreferrer">文章</a>
        <button type="button" data-delete-comment="${escapeHtml(comment.id)}">删除</button>
      </div>
    </article>
  `).join('');
};

export const loadComments = async (requestAdmin, nodes) => {
  const { commentList, commentCount } = nodes;
  if (!commentList) return;
  commentList.innerHTML = '<p class="private-list-empty">正在读取留言...</p>';
  try {
    const data = await requestAdmin('/api/admin/comments?limit=50');
    renderComments(nodes, data.comments || []);
  } catch (error) {
    setState(commentCount, '失败', 'error');
    commentList.innerHTML = `<p class="private-list-empty">${escapeHtml(formatError(error.message))}</p>`;
  }
};

export const bindCommentActions = (requestAdmin, nodes, callbacks = {}) => {
  const { commentList, uploadState } = nodes;
  const { loadComments: reloadComments } = callbacks;

  commentList?.addEventListener('click', async (event) => {
    const deleteButton = event.target.closest('[data-delete-comment]');
    if (!deleteButton) return;

    const id = deleteButton.dataset.deleteComment;
    if (!id || !window.confirm('删除这条留言？')) return;

    deleteButton.disabled = true;
    try {
      await requestAdmin(`/api/admin/comments/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setState(uploadState, '已删除留言', 'success');
      reloadComments?.();
    } catch (error) {
      setState(uploadState, formatError(error.message), 'error');
      deleteButton.disabled = false;
    }
  });
};
