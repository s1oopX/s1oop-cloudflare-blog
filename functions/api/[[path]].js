import worker from '../../workers/api.js';

export const onRequest = ({ request, env }) => worker.fetch(request, env, {});
