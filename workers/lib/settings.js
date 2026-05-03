export const SETTINGS = {
  commentsEnabled: 'comments.enabled',
};

async function getSetting(env, key, fallback) {
  if (!env.BLOG_DB) return fallback;
  try {
    const row = await env.BLOG_DB.prepare(
      'SELECT value FROM site_settings WHERE key = ?',
    ).bind(key).first();
    return row?.value ?? fallback;
  } catch {
    return fallback;
  }
}

export async function setSetting(env, key, value) {
  await env.BLOG_DB.prepare(
    `INSERT INTO site_settings (key, value, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = CURRENT_TIMESTAMP`,
  ).bind(key, value).run();
}

export async function getCommentSettings(env) {
  const enabled = await getSetting(env, SETTINGS.commentsEnabled, 'false');
  return {
    enabled: enabled === 'true',
  };
}
