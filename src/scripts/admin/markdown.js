const parseScalar = (value) => String(value || '').trim().replace(/^['"]|['"]$/g, '');

export const parseFrontmatter = (source) => {
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

export const firstMarkdownImage = (markdown) => {
  const match = markdown.match(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/);
  return match?.[2] || '';
};
