export default {
  async fetch(request, env, ctx) {
    if (request.method === 'GET') {
      return Response.json({
        ok: true,
        enabled: false,
        comments: [],
        message: 'Public comments are closed for this private blog',
      });
    }

    if (request.method === 'POST') {
      return Response.json(
        {
          ok: false,
          message: 'Public comments are closed for this private blog',
        },
        { status: 403 },
      );
    }

    return new Response('Method Not Allowed', { status: 405 });
  },
};
