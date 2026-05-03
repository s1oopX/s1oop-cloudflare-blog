import { escapeHtml, text } from './strings.js';

function parseScalar(value) {
  const trimmed = text(value);
  if (!trimmed) return '';
  return trimmed.replace(/^['"]|['"]$/g, '');
}

function parseTags(value, lines, startIndex) {
  const raw = text(value);
  if (raw.startsWith('[') && raw.endsWith(']')) {
    return {
      tags: raw.slice(1, -1).split(',').map(parseScalar).filter(Boolean),
      nextIndex: startIndex,
    };
  }

  if (raw) {
    return {
      tags: raw.split(',').map(parseScalar).filter(Boolean),
      nextIndex: startIndex,
    };
  }

  const tags = [];
  let index = startIndex + 1;
  while (index < lines.length && /^\s*-\s+/.test(lines[index])) {
    tags.push(parseScalar(lines[index].replace(/^\s*-\s+/, '')));
    index += 1;
  }

  return { tags: tags.filter(Boolean), nextIndex: index - 1 };
}

export function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\s*\n([\s\S]+?)\n---\s*\n?/);
  if (!match) {
    return { data: {}, body: markdown, error: 'Markdown must include YAML frontmatter.' };
  }

  const data = {};
  const lines = match[1].split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const field = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!field) continue;

    const key = field[1];
    if (key === 'tags') {
      const parsed = parseTags(field[2], lines, index);
      data.tags = parsed.tags;
      index = parsed.nextIndex;
    } else if (key === 'draft') {
      data.draft = ['true', 'yes', '1'].includes(text(field[2]).toLowerCase());
    } else {
      data[key] = parseScalar(field[2]);
    }
  }

  if (!data.title) return { data, body: markdown.slice(match[0].length), error: 'Frontmatter must include title.' };
  if (!data.date) return { data, body: markdown.slice(match[0].length), error: 'Frontmatter must include date.' };

  return { data, body: markdown.slice(match[0].length), error: null };
}

function sanitizeUrl(value, allowedRelativePrefixes = ['/', '#']) {
  const url = text(value).replace(/^['"]|['"]$/g, '');
  if (!url) return '';
  if (allowedRelativePrefixes.some((prefix) => url.startsWith(prefix))) return url;
  if (/^https?:\/\//i.test(url)) return url;
  if (/^mailto:/i.test(url)) return url;
  return '';
}

function inlineMarkdown(value) {
  let output = escapeHtml(value);

  output = output.replace(/`([^`]+)`/g, (_, code) => `<code>${code}</code>`);
  output = output.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]+&quot;)?\)/g, (_, alt, source) => {
    const src = sanitizeUrl(source, ['/', '#']);
    if (!src) return '';
    return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async" />`;
  });
  output = output.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
    const url = sanitizeUrl(href, ['/', '#']);
    if (!url) return label;
    return `<a href="${escapeHtml(url)}">${label}</a>`;
  });
  output = output.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  output = output.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  return output;
}

export function markdownToHtml(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let paragraph = [];
  let listOpen = false;
  let quoteOpen = false;
  let codeOpen = false;
  let codeBuffer = [];

  const closeParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`);
    paragraph = [];
  };

  const closeList = () => {
    if (!listOpen) return;
    html.push('</ul>');
    listOpen = false;
  };

  const closeQuote = () => {
    if (!quoteOpen) return;
    html.push('</blockquote>');
    quoteOpen = false;
  };

  const closeBlocks = () => {
    closeParagraph();
    closeList();
    closeQuote();
  };

  for (const line of lines) {
    if (/^```/.test(line)) {
      if (codeOpen) {
        html.push(`<pre><code>${escapeHtml(codeBuffer.join('\n'))}</code></pre>`);
        codeOpen = false;
        codeBuffer = [];
      } else {
        closeBlocks();
        codeOpen = true;
      }
      continue;
    }

    if (codeOpen) {
      codeBuffer.push(line);
      continue;
    }

    if (!text(line)) {
      closeBlocks();
      continue;
    }

    const heading = line.match(/^(#{2,4})\s+(.+)$/);
    if (heading) {
      closeBlocks();
      const level = Math.min(4, heading[1].length);
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const listItem = line.match(/^\s*[-*]\s+(.+)$/);
    if (listItem) {
      closeParagraph();
      closeQuote();
      if (!listOpen) {
        html.push('<ul>');
        listOpen = true;
      }
      html.push(`<li>${inlineMarkdown(listItem[1])}</li>`);
      continue;
    }

    const quote = line.match(/^>\s?(.+)$/);
    if (quote) {
      closeParagraph();
      closeList();
      if (!quoteOpen) {
        html.push('<blockquote>');
        quoteOpen = true;
      }
      html.push(`<p>${inlineMarkdown(quote[1])}</p>`);
      continue;
    }

    if (/^---+$/.test(text(line))) {
      closeBlocks();
      html.push('<hr />');
      continue;
    }

    paragraph.push(line.trim());
  }

  if (codeOpen) {
    html.push(`<pre><code>${escapeHtml(codeBuffer.join('\n'))}</code></pre>`);
  }
  closeBlocks();

  return html.join('\n');
}

export function readingStats(markdown) {
  const clean = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*]\([^)]+\)/g, ' ')
    .replace(/\[[^\]]*]\([^)]+\)/g, ' ')
    .replace(/[#>*_`~-]/g, ' ');
  const cjkCount = (clean.match(/[\u3400-\u9fff]/g) ?? []).length;
  const latinWordCount = (clean.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g) ?? []).length;
  const wordCount = cjkCount + latinWordCount;

  return {
    wordCount,
    readingMinutes: Math.max(1, Math.ceil(wordCount / 450)),
  };
}

export function searchText(markdown) {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[([^\]]*)]\([^)]+\)/g, '$1 ')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1 ')
    .replace(/[#>*_`~|[\]()-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 8000);
}

export function firstImage(markdown, fallbackTitle) {
  const match = markdown.match(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/);
  if (!match) return null;
  return {
    alt: match[1] || fallbackTitle,
    src: match[2],
  };
}
