export const CACHE = {
  noStore: 'no-store',
  publicList: 'public, max-age=30, stale-while-revalidate=120',
  publicDetail: 'public, max-age=10, stale-while-revalidate=60',
  publicAsset: 'public, max-age=31536000, immutable',
};

export const json = (data, init = {}) =>
  Response.json(data, {
    ...init,
    headers: {
      'cache-control': CACHE.noStore,
      ...init.headers,
    },
  });
