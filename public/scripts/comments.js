const panel = document.querySelector('[data-comments-panel]');
const state = document.querySelector('[data-comments-state]');
const count = document.querySelector('[data-comments-count]');
const list = document.querySelector('[data-comments-list]');
const form = document.querySelector('[data-comments-form]');

const setText = (node, text) => {
  if (node) node.textContent = text;
};

const setStatus = (text, tone = 'muted') => {
  setText(state, text);
  if (state) state.dataset.tone = tone;
};

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character]));

const formatDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
};

const currentSlug = () => {
  const explicit = panel?.dataset.commentsSlug;
  if (explicit) return explicit;
  return new URLSearchParams(window.location.search).get('slug') || '';
};

const renderComments = (comments) => {
  setText(count, String(comments.length));
  if (!list) return;
  if (!comments.length) {
    list.innerHTML = '<p class="comments-empty">还没有留言。</p>';
    return;
  }

  list.innerHTML = comments.map((comment) => {
    const name = escapeHtml(comment.authorName || '访客');
    const author = comment.authorUrl
      ? `<a href="${escapeHtml(comment.authorUrl)}" target="_blank" rel="noreferrer">${name}</a>`
      : `<strong>${name}</strong>`;
    return `
      <article class="comment-item">
        <header>
          ${author}
          <time>${escapeHtml(formatDate(comment.createdAt))}</time>
        </header>
        <p>${escapeHtml(comment.body).replace(/\n/g, '<br />')}</p>
      </article>
    `;
  }).join('');
};

const loadComments = () => {
  const slug = currentSlug();
  if (!panel || !slug) {
    panel?.remove();
    return;
  }

  fetch(`/api/comments?post=${encodeURIComponent(slug)}`)
    .then((response) => response.ok ? response.json() : Promise.reject(new Error('status failed')))
    .then((data) => {
      if (!data?.enabled) {
        panel.remove();
        return;
      }

      panel.hidden = false;
      renderComments(Array.isArray(data.comments) ? data.comments : []);
      setStatus('评论区开放中');
    })
    .catch(() => {
      panel.remove();
    });
};

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = form.querySelector('button[type="submit"]');
  const formData = new FormData(form);
  const body = String(formData.get('body') || '').trim();
  if (body.length < 5 || body.length > 30) {
    setStatus('留言需要 5 到 30 个字', 'error');
    return;
  }

  const payload = {
    postSlug: currentSlug(),
    postHref: `${window.location.pathname}${window.location.search}`,
    authorName: formData.get('authorName'),
    authorUrl: formData.get('authorUrl'),
    body,
    website: formData.get('website'),
  };

  submit.disabled = true;
  setStatus('正在提交...');
  try {
    const response = await fetch('/api/comments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.message || '提交失败');
    form.reset();
    setStatus('已提交', 'success');
    loadComments();
  } catch (error) {
    setStatus(error.message || '提交失败', 'error');
  } finally {
    submit.disabled = false;
  }
});

if (panel) loadComments();
