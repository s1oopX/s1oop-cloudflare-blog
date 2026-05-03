import { clearSession, requestAdmin as requestAdminRequest, verifySession } from './admin/api.js';
import { imageProblems, prepareUploadForm, readImageDimensions, uploadedImageProblems } from './admin/images.js';
import { firstMarkdownImage, parseFrontmatter } from './admin/markdown.js';
import { bindCommentActions, loadComments as loadRuntimeComments } from './admin/comments.js';
import { bindPostListActions, loadPosts as loadRuntimePosts } from './admin/runtime-posts.js';
import { bindCommentToggle, loadSettings as loadAdminSettings } from './admin/settings.js';
import { formatDate, formatError, readableSize, setState, toSlug } from './admin/utils.js';

const passwordKey = 's1oop-admin-password';
const uploadForm = document.querySelector('#post-upload');
const uploadState = document.querySelector('#post-upload-state');
const lockButton = document.querySelector('#private-lock-button');
const clearButton = document.querySelector('#post-clear-button');
const refreshButton = document.querySelector('#runtime-posts-refresh');
const commentsRefreshButton = document.querySelector('#runtime-comments-refresh');
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
const commentList = document.querySelector('#runtime-comments-list');
const commentCount = document.querySelector('#runtime-comments-count');
const templateTitle = document.querySelector('#template-title');
const templateDate = document.querySelector('#template-date');
const templateCollection = document.querySelector('#template-collection');
const templateTags = document.querySelector('#template-tags');
const templateExcerpt = document.querySelector('#template-excerpt');
const templateImageAlt = document.querySelector('#template-image-alt');
const templateBody = document.querySelector('#template-body');
const templateBuildButton = document.querySelector('#template-build-button');
const templateState = document.querySelector('#template-state');

let selectedMarkdown = '';
let overwriteCheckId = 0;

const collectionTags = {
  hot: '热点',
  tech: '方法',
  learn: '学习',
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

const todayDate = () => {
  const date = new Date();
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return offsetDate.toISOString().slice(0, 10);
};

const yamlValue = (value) => `'${String(value ?? '').replace(/'/g, "''")}'`;

const splitTemplateTags = (value) => String(value || '')
  .split(/[,，、/\\\n]+/)
  .map((tag) => tag.trim())
  .filter(Boolean);

const markdownAssetName = (value) => String(value || 'image')
  .split(/[\\/]/)
  .pop()
  ?.normalize('NFKD')
  .replace(/[^\w.\s-]/g, '')
  .trim()
  .replace(/[\s_]+/g, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '') || 'image';

const templateHasContent = () => Boolean(
  templateTitle?.value?.trim()
    || templateExcerpt?.value?.trim()
    || templateTags?.value?.trim()
    || templateBody?.value?.trim()
    || templateImageAlt?.value?.trim(),
);

const templateTagsFor = () => {
  const tags = [];
  const collectionTag = collectionTags[templateCollection?.value || ''];
  if (collectionTag) tags.push(collectionTag);
  tags.push(...splitTemplateTags(templateTags?.value));
  return Array.from(new Set(tags)).slice(0, 4);
};

const setMarkdownFile = (markdown, slug) => {
  if (!fileInput) {
    setState(templateState, '当前浏览器无法生成 Markdown 文件', 'error');
    return false;
  }

  try {
    const transfer = new DataTransfer();
    transfer.items.add(new File([markdown], `${slug || 'runtime-post'}.md`, { type: 'text/markdown' }));
    fileInput.files = transfer.files;
  } catch {
    setState(templateState, '当前浏览器无法生成 Markdown 文件', 'error');
    return false;
  }

  selectedMarkdown = markdown;
  if (fileLabel) fileLabel.textContent = `模板生成 ${slug || 'runtime-post'}.md`;
  setState(fileState, '模板', 'success');
  renderPreview();
  checkOverwrite();
  return true;
};

const templateMarkdown = () => {
  const title = templateTitle?.value?.trim() || '';
  const date = templateDate?.value || todayDate();
  const excerpt = templateExcerpt?.value?.trim() || '';
  const body = templateBody?.value?.trim() || '';
  const slug = toSlug(slugInput?.value || title);
  const tags = templateTagsFor();

  if (!title) throw new Error('模板缺少标题');
  if (!date) throw new Error('模板缺少发布日期');
  if (!excerpt) throw new Error('模板缺少摘要');
  if (!tags.length) throw new Error('至少选择一个专栏或填写一个标签');
  if (!body) throw new Error('模板缺少正文');

  const imageFile = imageInput?.files?.[0];
  const hasImage = Boolean(firstMarkdownImage(body));
  const imageMarkdown = imageFile && !hasImage
    ? `![${templateImageAlt?.value?.trim() || title}](${markdownAssetName(imageFile.name)})\n\n`
    : '';

  return {
    slug,
    markdown: [
      '---',
      `title: ${yamlValue(title)}`,
      `date: ${date}`,
      `excerpt: ${yamlValue(excerpt)}`,
      'tags:',
      ...tags.map((tag) => `  - ${yamlValue(tag)}`),
      'draft: false',
      '---',
      '',
      `${imageMarkdown}${body}`,
      '',
    ].join('\n'),
  };
};

const buildTemplateMarkdown = ({ silent = false } = {}) => {
  try {
    const { markdown, slug } = templateMarkdown();
    if (slugInput && !slugInput.value.trim()) slugInput.value = slug;
    if (!setMarkdownFile(markdown, slug)) return false;
    setState(templateState, `已生成规范 Markdown：${slug}.md`, 'success');
    return true;
  } catch (error) {
    if (!silent) setState(templateState, formatError(error.message), 'error');
    return false;
  }
};

const fillTemplateFromMarkdown = (markdown, slug = '') => {
  const parsed = parseFrontmatter(markdown);
  if (parsed.error) return;
  const tags = parsed.data.tags || [];
  const collectionKey = Object.entries(collectionTags)
    .find(([, tag]) => tags.includes(tag))?.[0] || '';
  const extraTags = tags.filter((tag) => tag !== collectionTags[collectionKey]);

  if (templateTitle) templateTitle.value = parsed.data.title || '';
  if (templateDate) templateDate.value = parsed.data.date || todayDate();
  if (templateCollection) templateCollection.value = collectionKey;
  if (templateTags) templateTags.value = extraTags.join(', ');
  if (templateExcerpt) templateExcerpt.value = parsed.data.excerpt || '';
  if (templateImageAlt) templateImageAlt.value = parsed.data.title || '';
  if (templateBody) templateBody.value = parsed.body.trim();
  if (slugInput && slug) slugInput.value = slug;
  setState(templateState, '已载入到模板，可继续编辑后生成发布', 'success');
};

const resetTemplate = () => {
  if (templateTitle) templateTitle.value = '';
  if (templateDate) templateDate.value = todayDate();
  if (templateCollection) templateCollection.value = '';
  if (templateTags) templateTags.value = '';
  if (templateExcerpt) templateExcerpt.value = '';
  if (templateImageAlt) templateImageAlt.value = '';
  if (templateBody) templateBody.value = '';
  setState(templateState, '填写模板后可直接生成规范 Markdown；也可以继续使用下方高级上传。', 'muted');
};

resetTemplate();

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

const loadPostForEdit = (post) => {
  if (!fileInput || !post?.markdown) {
    setState(uploadState, '当前浏览器无法载入编辑，请下载后重新上传', 'error');
    return;
  }

  try {
    const transfer = new DataTransfer();
    transfer.items.add(new File([post.markdown], `${post.slug}.md`, { type: 'text/markdown' }));
    fileInput.files = transfer.files;
  } catch {
    setState(uploadState, '当前浏览器无法载入编辑，请下载后重新上传', 'error');
    return;
  }

  selectedMarkdown = post.markdown;
  fillTemplateFromMarkdown(post.markdown, post.slug || '');
  if (slugInput) slugInput.value = post.slug || '';
  if (fileLabel) fileLabel.textContent = `正在编辑 ${post.slug}.md`;
  if (imageLabel) imageLabel.textContent = '保留已有配图，可选择新图替换';
  setState(fileState, '编辑中', 'success');
  setState(workflowState, '覆盖更新');
  setState(
    imageWarning,
    '不重新选择配图会保留已有 D1 图片；选择新图会替换旧图。',
    'muted',
  );
  setPublishLink(post.href || '');
  renderPreview();
  checkOverwrite();
  uploadForm?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    setState(
      previewOverwrite,
      data.exists ? `更新已有文章，保留发布日 ${formatDate(data.post?.date)}` : '将新增文章',
      data.exists ? 'error' : 'success',
    );
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
const loadComments = () => loadRuntimeComments(requestAdmin, { commentList, commentCount });
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
      loadComments();
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
  resetTemplate();
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

templateBuildButton?.addEventListener('click', () => {
  buildTemplateMarkdown();
});

templateTitle?.addEventListener('blur', () => {
  if (!slugInput?.value?.trim() && templateTitle.value.trim()) {
    slugInput.value = toSlug(templateTitle.value);
    renderPreview();
    checkOverwrite();
  }
});

uploadForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!getPassword()) {
    lockAndExit();
    return;
  }

  if (templateHasContent() && !buildTemplateMarkdown()) {
    setState(workflowState, '模板需修正', 'error');
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
    resetTemplate();
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
  { editPost: loadPostForEdit, loadPosts, checkOverwrite },
);

refreshButton?.addEventListener('click', loadPosts);
commentsRefreshButton?.addEventListener('click', loadComments);

bindCommentActions(requestAdmin, { commentList, uploadState }, { loadComments });
bindCommentToggle(requestAdmin, { commentState, commentToggle, commentToggleState }, { loadComments });

lockButton?.addEventListener('click', () => {
  lockAndExit();
});
