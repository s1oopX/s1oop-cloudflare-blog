const passwordKey = 's1oop-admin-password';
const maxImageBytes = 1024 * 1024;
const supportedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const uploadForm = document.querySelector('#post-upload');
const uploadState = document.querySelector('#post-upload-state');
const lockButton = document.querySelector('#private-lock-button');
const clearButton = document.querySelector('#post-clear-button');
const refreshButton = document.querySelector('#runtime-posts-refresh');
const orphanAssetsButton = document.querySelector('#orphan-assets-clean');
const fileInput = document.querySelector('#post-file');
const imageInput = document.querySelector('#post-images');
const slugInput = document.querySelector('#post-slug');
const fileLabel = document.querySelector('#post-file-label');
const imageLabel = document.querySelector('#post-image-label');
const imageWarning = document.querySelector('#post-image-warning');
const publishResult = document.querySelector('#post-publish-result');
const postOpenLink = document.querySelector('#post-open-link');
const authState = document.querySelector('#admin-auth-state');
const commentState = document.querySelector('#admin-comment-state');
const commentToggle = document.querySelector('#comments-toggle');
const commentToggleState = document.querySelector('#comments-toggle-state');
const postCount = document.querySelector('#admin-post-count');
const dashboard = document.querySelector('.private-dashboard');
const fileState = document.querySelector('#admin-file-state');
const workflowState = document.querySelector('#admin-workflow-state');
const metaTitle = document.querySelector('#post-meta-title');
const metaDate = document.querySelector('#post-meta-date');
const metaSize = document.querySelector('#post-meta-size');
const previewSlug = document.querySelector('#preview-slug');
const previewExcerpt = document.querySelector('#preview-excerpt');
const previewTags = document.querySelector('#preview-tags');
const previewImage = document.querySelector('#preview-image');
const previewOverwrite = document.querySelector('#preview-overwrite');
const postList = document.querySelector('#runtime-post-list');

let selectedMarkdown = '';
let overwriteCheckId = 0;

const formatError = (message) => {
  if (message === 'Invalid password') return '密码不正确';
  if (message === 'ADMIN_PASSWORD is not configured') return '访问密码未配置';
  if (message?.includes('D1 binding BLOG_DB is not configured')) return 'D1 文章库未绑定';
  if (message?.includes('D1 settings table is not configured')) return 'D1 设置表未迁移';
  if (message?.includes('Each image must be 1 MB or smaller')) return '单张图片不能超过 1 MB';
  if (message?.includes('Only JPEG, PNG, WebP and GIF images are supported')) return '仅支持 JPEG / PNG / WebP / GIF';
  return message || '操作失败';
};

const setState = (node, text, tone = 'muted') => {
  if (!node) return;
  node.textContent = text;
  node.dataset.tone = tone;
};

const readableSize = (size) => {
  if (!Number.isFinite(size)) return '-';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
};

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character]));

const toSlug = (value) => String(value || '')
  .replace(/\.[a-z0-9]+$/i, '')
  .normalize('NFKD')
  .replace(/[^\w\s-]/g, '')
  .trim()
  .toLowerCase()
  .replace(/[\s_]+/g, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '');

const parseScalar = (value) => String(value || '').trim().replace(/^['"]|['"]$/g, '');

const parseFrontmatter = (source) => {
  const match = source.match(/^---\s*\n([\s\S]+?)\n---\s*\n?/);
  if (!match) return { data: {}, body: source, error: '缺少 Frontmatter' };

  const data = {};
  const lines = match[1].split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const field = lines[index].match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!field) continue;

    const key = field[1];
    const value = field[2];
    if (key === 'tags') {
      const raw = value.trim();
      if (raw.startsWith('[') && raw.endsWith(']')) {
        data.tags = raw.slice(1, -1).split(',').map(parseScalar).filter(Boolean);
      } else if (raw) {
        data.tags = raw.split(',').map(parseScalar).filter(Boolean);
      } else {
        const tags = [];
        let tagIndex = index + 1;
        while (tagIndex < lines.length && /^\s*-\s+/.test(lines[tagIndex])) {
          tags.push(parseScalar(lines[tagIndex].replace(/^\s*-\s+/, '')));
          tagIndex += 1;
        }
        data.tags = tags.filter(Boolean);
        index = tagIndex - 1;
      }
    } else {
      data[key] = parseScalar(value);
    }
  }

  if (!data.title) return { data, body: source.slice(match[0].length), error: '缺少 title' };
  if (!data.date) return { data, body: source.slice(match[0].length), error: '缺少 date' };
  return { data, body: source.slice(match[0].length), error: null };
};

const firstMarkdownImage = (markdown) => {
  const match = markdown.match(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/);
  return match?.[2] || '';
};

const setPublishLink = (href = '') => {
  if (!publishResult || !postOpenLink) return;
  if (!href) {
    publishResult.hidden = true;
    postOpenLink.href = '/blog';
    return;
  }
  publishResult.hidden = false;
  postOpenLink.href = href;
};

const requestAdmin = async (path, options = {}) => {
  const password = sessionStorage.getItem(passwordKey);
  if (!password) throw new Error('Invalid password');

  const headers = new Headers(options.headers || {});
  headers.set('x-admin-password', password);
  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.message || '请求失败');
  return data;
};

const verifyPassword = async (password) => {
  const response = await fetch('/api/admin/check', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.message || '密码验证失败');
  return data;
};

const getPassword = () => sessionStorage.getItem(passwordKey);

const lockAndExit = () => {
  sessionStorage.removeItem(passwordKey);
  window.location.replace('/s1oop');
};

const currentSlug = () => {
  const explicit = toSlug(slugInput?.value || '');
  const file = fileInput?.files?.[0];
  return explicit || toSlug(file?.name || '');
};

const setFileMeta = ({ title = '等待文件', date = '-', size = '-' } = {}) => {
  if (metaTitle) metaTitle.textContent = title;
  if (metaDate) metaDate.textContent = date;
  if (metaSize) metaSize.textContent = size;
};

const renderPreview = () => {
  const file = fileInput?.files?.[0];
  const slug = currentSlug();
  if (!file || !selectedMarkdown) {
    setFileMeta();
    setState(previewSlug, '-');
    setState(previewExcerpt, '-');
    setState(previewTags, '-');
    setState(previewImage, '-');
    setState(previewOverwrite, '等待检查');
    return;
  }

  const parsed = parseFrontmatter(selectedMarkdown);
  setFileMeta({
    title: parsed.data.title || parsed.error || '无法读取',
    date: parsed.data.date || '-',
    size: readableSize(file.size),
  });
  setState(previewSlug, slug || '-');
  setState(previewExcerpt, parsed.data.excerpt || '将使用默认摘要');
  setState(previewTags, parsed.data.tags?.length ? parsed.data.tags.join(' / ') : '无标签');
  setState(previewImage, firstMarkdownImage(parsed.body) || '未检测到');
  setState(workflowState, parsed.error ? '需修正' : '待提交', parsed.error ? 'error' : 'muted');
};

const checkOverwrite = async () => {
  const slug = currentSlug();
  const checkId = overwriteCheckId + 1;
  overwriteCheckId = checkId;

  if (!slug || !getPassword()) {
    setState(previewOverwrite, '等待检查');
    return;
  }

  setState(previewOverwrite, '检查中');
  try {
    const data = await requestAdmin(`/api/admin/posts/${encodeURIComponent(slug)}`);
    if (checkId !== overwriteCheckId) return;
    setState(previewOverwrite, data.exists ? '将覆盖已有文章' : '将新增文章', data.exists ? 'error' : 'success');
  } catch (error) {
    if (checkId !== overwriteCheckId) return;
    setState(previewOverwrite, formatError(error.message), 'error');
  }
};

const imageProblems = () => {
  const files = Array.from(imageInput?.files || []);
  return files.flatMap((file) => {
    const problems = [];
    if (!supportedImageTypes.has(file.type)) problems.push(`${file.name} 格式不支持`);
    if (file.type === 'image/gif' && file.size > maxImageBytes) problems.push(`${file.name} 超过 1 MB`);
    return problems;
  });
};

const uploadedImageProblems = (files) => files.flatMap((file) => {
  const problems = [];
  if (!supportedImageTypes.has(file.type)) problems.push(`${file.name} 格式不支持`);
  if (file.size > maxImageBytes) problems.push(`${file.name} 超过 1 MB`);
  return problems;
});

const readImageDimensions = (file) => new Promise((resolve) => {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    URL.revokeObjectURL(url);
    resolve({ width: image.naturalWidth, height: image.naturalHeight });
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    resolve(null);
  };
  image.src = url;
});

const updateImageState = async () => {
  const files = Array.from(imageInput?.files || []);
  const problems = imageProblems();
  if (imageLabel) imageLabel.textContent = files.length ? `已选择 ${files.length} 张配图` : '选择配图，可多选';
  if (!files.length) {
    setState(imageWarning, '图片会在前端先检查格式和 1 MB 限制', 'muted');
  } else if (problems.length) {
    setState(imageWarning, problems.join('；'), 'error');
  } else {
    const total = files.reduce((sum, file) => sum + file.size, 0);
    const dimensions = await Promise.all(files.map(readImageDimensions));
    const large = dimensions
      .map((size, index) => ({ size, file: files[index] }))
      .filter((item) => item.size && Math.max(item.size.width, item.size.height) > 1920);
    if (large.length) {
      setState(
        imageWarning,
        `图片检查通过，共 ${readableSize(total)}；发布时会自动压缩 ${large.length} 张大图`,
        'muted',
      );
    } else {
      setState(imageWarning, `图片检查通过，共 ${readableSize(total)}；发布时会自动压缩非 GIF 图片`, 'success');
    }
  }
};

const canvasToBlob = (canvas, type, quality) => new Promise((resolve) => {
  canvas.toBlob((blob) => resolve(blob), type, quality);
});

const compressImageFile = async (file) => {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    return { file, compressed: false, originalSize: file.size };
  }

  if (!window.createImageBitmap) {
    return { file, compressed: false, originalSize: file.size };
  }

  try {
    const bitmap = await createImageBitmap(file);
    const longestSide = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, 1600 / Math.max(1, longestSide));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return { file, compressed: false, originalSize: file.size };
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await canvasToBlob(canvas, 'image/webp', 0.78);
    if (!blob || blob.size >= file.size) {
      return { file, compressed: false, originalSize: file.size };
    }

    const name = file.name.replace(/\.[^.]+$/, '') || 'image';
    return {
      file: new File([blob], `${name}.webp`, { type: 'image/webp', lastModified: file.lastModified }),
      compressed: true,
      originalSize: file.size,
    };
  } catch {
    return { file, compressed: false, originalSize: file.size };
  }
};

const prepareUploadForm = async () => {
  const form = new FormData(uploadForm);
  const images = Array.from(imageInput?.files || []);
  const processed = await Promise.all(images.map(compressImageFile));
  form.delete('images');
  processed.forEach(({ file }) => {
    if (file.size > 0) form.append('images', file);
  });
  return { form, processed };
};

const fetchRuntimePost = async (slug) => {
  const data = await requestAdmin(`/api/admin/posts/${encodeURIComponent(slug)}`);
  if (!data.post?.markdown) throw new Error('没有找到 Markdown');
  return data.post;
};

const copyText = async (value) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
};

const downloadText = (filename, value) => {
  const blob = new Blob([value], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const renderPostList = (posts) => {
  if (!postList) return;
  if (postCount) postCount.textContent = String(posts.length);
  if (!posts.length) {
    postList.innerHTML = '<p class="private-list-empty">D1 暂无运行时文章</p>';
    return;
  }

  postList.innerHTML = posts.map((post) => `
    <article class="private-post-row">
      <div>
        <span>${escapeHtml(post.date || '-')}</span>
        <h3>${escapeHtml(post.title || post.slug)}</h3>
        <p>${escapeHtml(post.slug)} · ${post.published ? '已发布' : '草稿'} · ${post.imageCount || 0} 图</p>
      </div>
      <div class="private-post-actions">
        <a href="${escapeHtml(post.href)}" target="_blank" rel="noreferrer">查看</a>
        <button type="button" data-copy-post="${escapeHtml(post.slug)}">复制</button>
        <button type="button" data-download-post="${escapeHtml(post.slug)}">下载</button>
        <button type="button" data-delete-post="${escapeHtml(post.slug)}">删除</button>
      </div>
    </article>
  `).join('');
};

const loadPosts = async () => {
  if (!postList) return;
  postList.innerHTML = '<p class="private-list-empty">正在读取 D1 文章库...</p>';
  try {
    const data = await requestAdmin('/api/admin/posts?limit=50');
    renderPostList(data.posts || []);
  } catch (error) {
    if (postCount) postCount.textContent = '-';
    postList.innerHTML = `<p class="private-list-empty">${formatError(error.message)}</p>`;
  }
};

const loadSettings = async () => {
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

const existingPassword = getPassword();
if (!existingPassword) {
  window.location.replace('/s1oop');
} else {
  verifyPassword(existingPassword)
    .then(() => {
      if (dashboard) dashboard.dataset.auth = 'unlocked';
      setState(authState, '已解锁', 'success');
      loadSettings();
      loadPosts();
    })
    .catch(() => {
      lockAndExit();
    });
}

fileInput?.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  selectedMarkdown = '';
  if (!file) {
    if (fileLabel) fileLabel.textContent = '选择 Markdown 文件';
    setState(fileState, '未选择');
    setFileMeta();
    renderPreview();
    return;
  }

  if (fileLabel) fileLabel.textContent = file.name;
  setState(fileState, '已选择', 'success');
  setState(workflowState, '读取中');
  setFileMeta({ title: '读取中', date: '-', size: readableSize(file.size) });
  file.text()
    .then((markdown) => {
      selectedMarkdown = markdown;
      renderPreview();
      checkOverwrite();
    })
    .catch(() => {
      setFileMeta({ title: '无法读取', date: '-', size: readableSize(file.size) });
      setState(workflowState, '读取失败', 'error');
    });
});

slugInput?.addEventListener('input', () => {
  renderPreview();
  checkOverwrite();
});

imageInput?.addEventListener('change', updateImageState);

clearButton?.addEventListener('click', () => {
  uploadForm?.reset();
  selectedMarkdown = '';
  if (fileLabel) fileLabel.textContent = '选择 Markdown 文件';
  if (imageLabel) imageLabel.textContent = '选择配图，可多选';
  setState(fileState, '未选择');
  setState(workflowState, '待提交');
  setFileMeta();
  renderPreview();
  updateImageState();
  setPublishLink();
  setState(uploadState, '支持 .md / .mdx，单张图片不超过 1 MB', 'muted');
});

uploadForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const password = getPassword();
  if (!password) {
    lockAndExit();
    return;
  }

  const form = new FormData(uploadForm);
  const file = form.get('file');
  if (!file || !file.name) {
    setState(uploadState, '请选择 .md 或 .mdx 文件', 'error');
    setState(workflowState, '缺少文件', 'error');
    return;
  }

  const parsed = parseFrontmatter(selectedMarkdown);
  if (parsed.error) {
    setState(uploadState, parsed.error, 'error');
    setState(workflowState, '需修正', 'error');
    return;
  }

  const problems = imageProblems();
  if (problems.length) {
    setState(uploadState, problems.join('；'), 'error');
    setState(workflowState, '图片需修正', 'error');
    return;
  }

  setState(uploadState, '正在压缩图片...', 'muted');
  setState(workflowState, '提交中');
  try {
    const { form, processed } = await prepareUploadForm();
    const compressedFiles = processed.map((item) => item.file);
    const compressedProblems = uploadedImageProblems(compressedFiles);
    if (compressedProblems.length) {
      throw new Error(compressedProblems.join('；'));
    }

    const compressedCount = processed.filter((item) => item.compressed).length;
    const savedBytes = processed.reduce((sum, item) => sum + Math.max(0, item.originalSize - item.file.size), 0);
    setState(
      uploadState,
      compressedCount ? `已压缩 ${compressedCount} 张图片，节省 ${readableSize(savedBytes)}，正在提交...` : '正在提交...',
      'muted',
    );

    const response = await fetch('/api/admin/posts', {
      method: 'POST',
      headers: { 'x-admin-password': password },
      body: form,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.message || '发布失败');
    const href = data.href || '';
    setState(uploadState, `${data.overwritten ? '已覆盖' : '已新增'}：${href || data.path}`, 'success');
    setState(workflowState, data.overwritten ? '已覆盖' : '已入库', 'success');
    setPublishLink(href);
    uploadForm.reset();
    selectedMarkdown = '';
    if (fileLabel) fileLabel.textContent = '选择 Markdown 文件';
    if (imageLabel) imageLabel.textContent = '选择配图，可多选';
    setState(fileState, '未选择');
    setFileMeta();
    renderPreview();
    updateImageState();
    loadPosts();
  } catch (error) {
    setState(uploadState, formatError(error.message), 'error');
    setState(workflowState, '失败', 'error');
  }
});

postList?.addEventListener('click', async (event) => {
  const copyButton = event.target.closest('[data-copy-post]');
  const downloadButton = event.target.closest('[data-download-post]');
  const button = event.target.closest('[data-delete-post]');
  if (copyButton) {
    const slug = copyButton.dataset.copyPost;
    if (!slug) return;
    copyButton.disabled = true;
    try {
      const post = await fetchRuntimePost(slug);
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
      const post = await fetchRuntimePost(slug);
      downloadText(`${slug}.md`, post.markdown);
      setState(uploadState, `已准备下载：${slug}.md`, 'success');
    } catch (error) {
      setState(uploadState, formatError(error.message), 'error');
    } finally {
      downloadButton.disabled = false;
    }
    return;
  }

  if (!button) return;
  const slug = button.dataset.deletePost;
  if (!slug || !window.confirm(`删除 D1 文章「${slug}」？`)) return;

  button.disabled = true;
  try {
    await requestAdmin(`/api/admin/posts/${encodeURIComponent(slug)}`, { method: 'DELETE' });
    setState(uploadState, `已删除：${slug}`, 'success');
    loadPosts();
    checkOverwrite();
  } catch (error) {
    setState(uploadState, formatError(error.message), 'error');
    button.disabled = false;
  }
});

refreshButton?.addEventListener('click', loadPosts);

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
    loadPosts();
  } catch (error) {
    setState(uploadState, formatError(error.message), 'error');
  } finally {
    orphanAssetsButton.disabled = false;
  }
});

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
  } catch (error) {
    commentToggle.checked = !enabled;
    setState(commentState, '保存失败', 'error');
    setState(commentToggleState, formatError(error.message), 'error');
  }
});

lockButton?.addEventListener('click', () => {
  lockAndExit();
});

