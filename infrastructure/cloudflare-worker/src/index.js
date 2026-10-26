export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const targetHost = 'b7ssxm6vbhvfdcaxsdn7vmosgy0thkbw.lambda-url.ap-southeast-1.on.aws';

    url.hostname = targetHost;
    url.port = '';
    url.protocol = 'https:';

    const headers = new Headers(request.headers);
    headers.set('host', targetHost);

    const init = {
      method: request.method,
      headers: headers,
      redirect: 'follow',
    };

    // Only attach body for methods that allow it
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      init.body = request.body;
    }

    const newRequest = new Request(url.toString(), init);
    return fetch(newRequest);
  },
};
