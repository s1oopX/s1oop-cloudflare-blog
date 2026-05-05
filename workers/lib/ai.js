import { arrayBufferToBase64, text } from './strings.js';

const BASE_URL = 'https://aistudio.baidu.com/llm/lmapi/v3';
const DEFAULT_TEXT_MODEL = 'ernie-3.5-8k';
const DEFAULT_IMAGE_MODEL = 'ERNIE-Image-Turbo';
const MAX_MARKDOWN_CHARS = 12000;
const MAX_PROMPT_CHARS = 900;

const cleanText = (value, limit = 4000) => text(value)
  .replace(/```[\s\S]*?```/g, ' ')
  .replace(/!\[([^\]]*)]\([^)]+\)/g, '$1 ')
  .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
  .replace(/[#>*_`~|[\]()-]/g, ' ')
  .replace(/\s+/g, ' ')
  .slice(0, limit)
  .trim();

const jsonError = (message, status = 500) => ({ error: { message, status } });

const aiHeaders = (env) => ({
  authorization: `Bearer ${env.AI_STUDIO_API_KEY}`,
  'content-type': 'application/json',
  'x-client-platform': 'aistudio',
});

async function fetchAi(env, path, body) {
  if (!env.AI_STUDIO_API_KEY) return jsonError('AI_STUDIO_API_KEY is not configured', 501);

  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: aiHeaders(env),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return jsonError(data?.error?.message || data?.message || 'AI Studio request failed', response.status);
    }
    return { data };
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'AI Studio request failed');
  }
}

const extractJson = (value) => {
  const raw = text(value);
  const fenced = raw.match(/```(?:json)?\s*([\s\S]+?)```/i)?.[1] || raw;
  const start = fenced.indexOf('{');
  const end = fenced.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(fenced.slice(start, end + 1));
  } catch {
    return null;
  }
};

const normalizeAssist = (value) => {
  const data = extractJson(value) || {};
  const summary = cleanText(data.summary, 260);
  const imagePrompt = sanitizeImagePrompt(data.imagePrompt);
  const imageAlt = cleanText(data.imageAlt, 80);

  return {
    summary,
    imagePrompt,
    imageAlt,
  };
};

function sanitizeImagePrompt(value) {
  let prompt = cleanText(value, MAX_PROMPT_CHARS)
    .replace(/屏幕上(?:显示|呈现|展示)着?[^，。]*[，。]?/g, '')
    .replace(/(?:写满|写着|显示着|标注着)[^，。]*[，。]?/g, '')
    .replace(/标题、摘要、配图和正文/g, '几块空白排版区')
    .replace(/标题|摘要|正文|文字|字母|数字|Logo|水印|网页界面|后台界面|博客模板界面|UI/g, (match) => (
      ['Logo', '水印'].includes(match) ? '' : '空白元素'
    ))
    .replace(/\s+/g, ' ')
    .replace(/。，/g, '，')
    .replace(/，。/g, '。')
    .replace(/，{2,}/g, '，')
    .replace(/^，|，$/g, '')
    .trim();
  if (prompt && !/无文字/.test(prompt)) {
    prompt = `${prompt}，画面无文字、无字母数字、无标识、无水印`;
  }
  return prompt.slice(0, MAX_PROMPT_CHARS).trim();
}

export async function createBlogAssist(env, payload) {
  const title = cleanText(payload?.title, 120);
  const excerpt = cleanText(payload?.excerpt, 260);
  const markdown = cleanText(payload?.markdown, MAX_MARKDOWN_CHARS);
  if (!title && !excerpt && markdown.length < 80) {
    return { error: { message: '文章内容太少，无法生成总结', status: 400 } };
  }

  const body = {
    model: env.AI_STUDIO_TEXT_MODEL || DEFAULT_TEXT_MODEL,
    messages: [
      {
        role: 'system',
        content: [
          '你是个人博客编辑助手。',
          '只返回 JSON，不要使用 Markdown 代码块。',
          'summary 是可直接放在正文开头的中文导读，60 到 120 字。',
          'summary 只能概括用户给出的内容，不得新增正文没有承诺的方法、技巧、步骤或结论。',
          'summary 不要写“本文/这篇文章将/下面将/助你/高效完成”等营销式或预告式表达。',
          'imagePrompt 是用于文生图的中文提示词，具体描述画面、主体、环境、光线和风格。',
          'imagePrompt 不得要求画面出现文字、Logo、水印、屏幕文字、网页界面、后台界面或可读 UI。',
          'imageAlt 是 20 字以内的中文图片 alt。',
          'JSON 格式：{"summary":"","imagePrompt":"","imageAlt":""}',
        ].join('\n'),
      },
      {
        role: 'user',
        content: JSON.stringify({ title, excerpt, markdown }),
      },
    ],
    temperature: 0.4,
  };

  const result = await fetchAi(env, '/chat/completions', body);
  if (result.error) return result;

  const content = result.data?.choices?.[0]?.message?.content || '';
  const assist = normalizeAssist(content);
  if (!assist.summary || !assist.imagePrompt) {
    return { error: { message: 'AI 返回内容不完整', status: 502 } };
  }
  return { assist };
}

const imageMimeFromB64 = (value) => {
  const raw = stripDataUrl(value);
  if (raw.startsWith('/9j/')) return 'image/jpeg';
  if (raw.startsWith('UklGR')) return 'image/webp';
  return 'image/png';
};

const stripDataUrl = (value) => text(value).replace(/^data:image\/[a-z0-9.+-]+;base64,/i, '');

async function imageUrlToBase64(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(90000) });
  if (!response.ok) throw new Error('AI image download failed');
  const contentType = response.headers.get('content-type') || 'image/png';
  const body = await response.arrayBuffer();
  return {
    b64Json: arrayBufferToBase64(body),
    mimeType: contentType.split(';')[0] || 'image/png',
  };
}

export async function createBlogImages(env, payload) {
  const prompt = cleanText(payload?.prompt, MAX_PROMPT_CHARS);
  if (prompt.length < 8) return { error: { message: '图片提示词太短', status: 400 } };

  const count = Math.min(4, Math.max(1, Number(payload?.n ?? 4) || 4));
  const allowedSizes = new Set(['1024x1024', '1376x768', '1264x848', '1200x896', '896x1200', '848x1264', '768x1376']);
  const size = allowedSizes.has(payload?.size) ? payload.size : '1024x1024';
  const body = {
    model: env.AI_STUDIO_IMAGE_MODEL || DEFAULT_IMAGE_MODEL,
    prompt,
    n: count,
    response_format: 'b64_json',
    size,
    seed: Number.isFinite(Number(payload?.seed)) ? Number(payload.seed) : undefined,
    use_pe: true,
    num_inference_steps: 8,
    guidance_scale: 1.0,
  };

  const result = await fetchAi(env, '/images/generations', body);
  if (result.error) return result;

  try {
    const images = await Promise.all((result.data?.data || []).slice(0, count).map(async (item, index) => {
      const source = item?.b64_json || item?.b64Json || '';
      const image = source
        ? { b64Json: stripDataUrl(source), mimeType: imageMimeFromB64(source) }
        : await imageUrlToBase64(item?.url || '');
      return {
        ...image,
        filename: `ai-image-${Date.now()}-${index + 1}.${image.mimeType.includes('webp') ? 'webp' : image.mimeType.includes('jpeg') ? 'jpg' : 'png'}`,
      };
    }));
    if (!images.length) return { error: { message: 'AI 没有返回图片', status: 502 } };
    return { images };
  } catch (error) {
    return { error: { message: error instanceof Error ? error.message : 'AI 图片解析失败', status: 502 } };
  }
}
