export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const query = url.searchParams.get('q') ?? '';

    return Response.json({
      ok: true,
      query,
      results: [],
      index: '/search-index.json',
      message: 'Search runs on the static frontend index. This Worker is not required for site search.',
    });
  },
};
