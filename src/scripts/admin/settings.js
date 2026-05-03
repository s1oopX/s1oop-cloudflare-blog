import { formatError, setState } from './utils.js';

export const loadSettings = async (requestAdmin, nodes) => {
  const { commentState, commentToggle, commentToggleState } = nodes;
  try {
    const data = await requestAdmin('/api/admin/settings');
    const enabled = Boolean(data.comments?.enabled);
    if (commentToggle) commentToggle.checked = enabled;
    setState(commentState, enabled ? '已开放' : '已关闭', enabled ? 'success' : 'muted');
    setState(commentToggleState, enabled ? '公开接口允许评论区显示' : '评论区保持关闭');
  } catch (error) {
    setState(commentState, '读取失败', 'error');
    setState(commentToggleState, formatError(error.message), 'error');
  }
};

export const bindCommentToggle = (requestAdmin, nodes, callbacks = {}) => {
  const { commentState, commentToggle, commentToggleState } = nodes;
  const { loadComments } = callbacks;

  commentToggle?.addEventListener('change', async () => {
    const enabled = Boolean(commentToggle.checked);
    setState(commentToggleState, '正在保存...', 'muted');
    try {
      await requestAdmin('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ commentsEnabled: enabled }),
      });
      setState(commentState, enabled ? '已开放' : '已关闭', enabled ? 'success' : 'muted');
      setState(commentToggleState, enabled ? '评论区已开放' : '评论区已关闭', enabled ? 'success' : 'muted');
      loadComments?.();
    } catch (error) {
      commentToggle.checked = !enabled;
      setState(commentState, '保存失败', 'error');
      setState(commentToggleState, formatError(error.message), 'error');
    }
  });
};
