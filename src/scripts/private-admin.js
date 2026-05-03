import { clearSession, requestAdmin as requestAdminRequest, verifySession } from './admin/api.js';
import { imageProblems, prepareUploadForm, readImageDimensions, uploadedImageProblems } from './admin/images.js';
import { firstMarkdownImage, parseFrontmatter } from './admin/markdown.js';
import { bindPostListActions, loadPosts as loadRuntimePosts } from './admin/runtime-posts.js';
import { bindCommentToggle, loadSettings as loadAdminSettings } from './admin/settings.js';
import { formatError, readableSize, setState, toSlug } from './admin/utils.js';

const passwordKey = 's1oop-admin-password';
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



const getPassword = () => sessionStorage.getItem(passwordKey);

const lockAndExit = async () => {
  sessionStorage.removeItem(passwordKey);
  await clearSession();
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


const updateImageState = async () => {
  const files = Array.from(imageInput?.files || []);
  const problems = imageProblems(Array.from(imageInput?.files || []));
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


const requestAdmin = (path, options = {}) => requestAdminRequest(passwordKey, path, options);
const loadPosts = () => loadRuntimePosts(requestAdmin, { postList, postCount });
const loadSettings = () => loadAdminSettings(requestAdmin, { commentState, commentToggle, commentToggleState });

const existingPassword = getPassword();
if (!existingPassword) {
  window.location.replace('/s1oop');
} else {
  verifySession()
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
  if (!getPassword()) {
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

  const problems = imageProblems(Array.from(imageInput?.files || []));
  if (problems.length) {
    setState(uploadState, problems.join('；'), 'error');
    setState(workflowState, '图片需修正', 'error');
    return;
  }

  setState(uploadState, '正在压缩图片...', 'muted');
  setState(workflowState, '提交中');
  try {
    const { form, processed } = await prepareUploadForm(uploadForm, imageInput);
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

bindPostListActions(
  requestAdmin,
  { postList, uploadState, orphanAssetsButton },
  { loadPosts, checkOverwrite },
);

refreshButton?.addEventListener('click', loadPosts);

bindCommentToggle(requestAdmin, { commentState, commentToggle, commentToggleState });

lockButton?.addEventListener('click', () => {
  lockAndExit();
});
