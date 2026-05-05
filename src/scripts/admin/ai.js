import { firstMarkdownImage, parseFrontmatter } from './markdown.js';
import { escapeHtml, formatError, readableSize, setState, toSlug } from './utils.js';

const maxImageCount = 2;

const markdownParts = (source) => {
  const match = String(source || '').match(/^(---\s*\n[\s\S]+?\n---\s*\n?)([\s\S]*)$/);
  return match ? { frontmatter: match[1], body: match[2] } : { frontmatter: '', body: String(source || '') };
};

const insertIntro = (body, summary) => {
  const cleanSummary = String(summary || '').trim();
  const cleanBody = String(body || '').trim();
  if (!cleanSummary) return cleanBody;
  if (cleanBody.includes(cleanSummary)) return cleanBody;

  const image = cleanBody.match(/^(!\[[^\]]*]\([^) \t]+(?:\s+"[^"]*")?\))\s*/);
  if (!image) return cleanBody ? `${cleanSummary}\n\n${cleanBody}` : cleanSummary;

  const rest = cleanBody.slice(image[0].length).trim();
  return rest ? `${image[1]}\n\n${cleanSummary}\n\n${rest}` : `${image[1]}\n\n${cleanSummary}`;
};

const imageMarkdown = (fileName, alt) => `![${String(alt || '文章配图').replace(/[\r\n\]]/g, ' ').trim()}](${fileName})`;

const setCoverImage = (body, fileName, alt) => {
  const cleanBody = String(body || '').trim();
  const cover = imageMarkdown(fileName, alt);
  const imagePattern = /!\[[^\]]*]\([^) \t]+(?:\s+"[^"]*")?\)/;
  if (!cleanBody) return cover;
  if (firstMarkdownImage(cleanBody)) {
    return cleanBody.replace(imagePattern, cover);
  }
  return `${cover}\n\n${cleanBody}`;
};

const dataUrlToFile = (image) => {
  const mimeType = image.mimeType || 'image/png';
  const base64 = String(image.b64Json || '').replace(/^data:image\/[a-z0-9.+-]+;base64,/i, '');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new File([bytes], image.filename || `ai-image-${Date.now()}.png`, { type: mimeType });
};

const readDraft = ({ selectedMarkdown, templateTitle, templateExcerpt, templateBody }) => {
  const templateMarkdown = String(templateBody?.value || '').trim();
  if (templateMarkdown) {
    return {
      title: templateTitle?.value?.trim() || '',
      excerpt: templateExcerpt?.value?.trim() || '',
      markdown: templateMarkdown,
      source: 'template',
    };
  }

  const markdown = selectedMarkdown();
  const parsed = parseFrontmatter(markdown);
  return {
    title: parsed.data?.title || '',
    excerpt: parsed.data?.excerpt || '',
    markdown,
    source: 'file',
  };
};

const requestAssist = async (requestAdmin, draft) => {
  const data = await requestAdmin('/api/admin/ai/assist', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: draft.title,
      excerpt: draft.excerpt,
      markdown: draft.markdown,
    }),
  });
  return data.assist;
};

const requestImages = async (requestAdmin, prompt) => {
  const data = await requestAdmin('/api/admin/ai/images', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      prompt,
      n: maxImageCount,
      size: '1024x1024',
    }),
  });
  return data.images || [];
};

const renderImages = (nodes, callbacks, images, imageAlt) => {
  const { resultList } = nodes;
  if (!resultList) return;

  resultList.innerHTML = images.map((image, index) => {
    const base64 = String(image.b64Json || '').replace(/^data:image\/[a-z0-9.+-]+;base64,/i, '');
    const src = `data:${image.mimeType || 'image/png'};base64,${base64}`;
    const size = Math.round((base64.length * 3) / 4);
    const alt = escapeHtml(imageAlt || `AI 配图 ${index + 1}`);
    return `
      <article class="private-ai-image">
        <img src="${src}" alt="${alt}" loading="lazy" decoding="async" />
        <div>
          <span>${readableSize(size)}</span>
          <button class="private-admin-secondary private-inline-action" type="button" data-ai-image="${index}">选为配图</button>
        </div>
      </article>
    `;
  }).join('');

  resultList.querySelectorAll('[data-ai-image]').forEach((button) => {
    button.addEventListener('click', async () => {
      const index = Number(button.dataset.aiImage);
      const image = images[index];
      if (!image) return;

      try {
        const file = dataUrlToFile(image);
        const transfer = new DataTransfer();
        transfer.items.add(file);
        Array.from(nodes.imageInput?.files || []).forEach((existing) => transfer.items.add(existing));
        nodes.imageInput.files = transfer.files;
        if (nodes.templateImageAlt && imageAlt) nodes.templateImageAlt.value = imageAlt;
        await callbacks.updateImageState();
        if (nodes.templateBody?.value?.trim()) {
          nodes.templateBody.value = setCoverImage(nodes.templateBody.value, file.name, nodes.templateImageAlt?.value || imageAlt);
          callbacks.buildTemplateMarkdown({ silent: true });
        } else {
          const current = callbacks.selectedMarkdown();
          const parsed = parseFrontmatter(current);
          if (!parsed.error) {
            const parts = markdownParts(current);
            const markdown = `${parts.frontmatter}${setCoverImage(parts.body, file.name, nodes.templateImageAlt?.value || imageAlt)}\n`;
            callbacks.setMarkdownFile(markdown, callbacks.currentSlug() || toSlug(parsed.data.title));
          }
        }
        setState(nodes.aiState, `已选择 AI 配图：${file.name}`, 'success');
      } catch (error) {
        setState(nodes.aiState, formatError(error.message), 'error');
      }
    });
  });
};

export const bindAiTools = (requestAdmin, nodes, callbacks) => {
  const {
    summaryButton,
    imageButton,
    promptInput,
    aiState,
    templateBody,
    templateImageAlt,
  } = nodes;

  const applySummary = (draft, summary) => {
    if (draft.source === 'template') {
      templateBody.value = insertIntro(templateBody.value, summary);
      callbacks.buildTemplateMarkdown({ silent: true });
      return;
    }

    const current = callbacks.selectedMarkdown();
    const parts = markdownParts(current);
    const markdown = `${parts.frontmatter}${insertIntro(parts.body, summary)}\n`;
    callbacks.setMarkdownFile(markdown, callbacks.currentSlug() || toSlug(draft.title));
  };

  const ensureAssist = async ({ needPrompt = false } = {}) => {
    const draft = readDraft({ ...nodes, selectedMarkdown: callbacks.selectedMarkdown });
    if (!draft.markdown || draft.markdown.trim().length < 80) throw new Error('请先填写正文或选择 Markdown 文件');
    setState(aiState, needPrompt ? '正在分析文章并生成图片提示词...' : '正在生成正文导读...', 'muted');
    const assist = await requestAssist(requestAdmin, draft);
    if (promptInput && assist.imagePrompt) promptInput.value = assist.imagePrompt;
    if (templateImageAlt && assist.imageAlt && !templateImageAlt.value.trim()) templateImageAlt.value = assist.imageAlt;
    return { draft, assist };
  };

  summaryButton?.addEventListener('click', async () => {
    summaryButton.disabled = true;
    try {
      const { draft, assist } = await ensureAssist();
      applySummary(draft, assist.summary);
      setState(aiState, '已把导读插入正文开头', 'success');
    } catch (error) {
      setState(aiState, formatError(error.message), 'error');
    } finally {
      summaryButton.disabled = false;
    }
  });

  imageButton?.addEventListener('click', async () => {
    imageButton.disabled = true;
    try {
      let imageAlt = templateImageAlt?.value?.trim() || '';
      if (!promptInput?.value?.trim()) {
        const { assist } = await ensureAssist({ needPrompt: true });
        imageAlt = assist.imageAlt || imageAlt;
      }
      const prompt = promptInput?.value?.trim() || '';
      if (!prompt) throw new Error('缺少图片提示词');

      setState(aiState, '正在生成配图候选...', 'muted');
      const images = await requestImages(requestAdmin, prompt);
      renderImages(nodes, callbacks, images, imageAlt);
      setState(aiState, `已生成 ${images.length} 张候选图`, 'success');
    } catch (error) {
      setState(aiState, formatError(error.message), 'error');
    } finally {
      imageButton.disabled = false;
    }
  });
};
