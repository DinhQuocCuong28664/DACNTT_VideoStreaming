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

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      init.body = request.body;
    }

    const response = await fetch(url.toString(), init);

    // Clean up duplicate CORS headers returned by Lambda + Express
    const responseHeaders = new Headers(response.headers);
    const acao = responseHeaders.get('access-control-allow-origin');
    if (acao && acao.includes(',')) {
      responseHeaders.set('access-control-allow-origin', acao.split(',')[0].trim());
    }
    const acac = responseHeaders.get('access-control-allow-credentials');
    if (acac && acac.includes(',')) {
      responseHeaders.set('access-control-allow-credentials', 'true');
    }
    const vary = responseHeaders.get('vary');
    if (vary && vary.includes(',')) {
      responseHeaders.set('vary', 'Origin');
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  },
};
