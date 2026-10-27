// Forwards api.<domain> to the backend's Lambda function URL.
//
// TARGET_HOST (wrangler.toml vars) is the function URL host of the environment.
// ORIGIN_VERIFY_SECRET (`wrangler secret put`) is sent as X-Origin-Verify: the
// backend refuses requests without it (backend/src/middleware/originVerify.js),
// so calling the function URL directly, around Cloudflare, gets 403. A header
// of that name sent by the client is always replaced.
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const targetHost = env.TARGET_HOST;

    url.hostname = targetHost;
    url.port = '';
    url.protocol = 'https:';

    const headers = new Headers(request.headers);
    headers.set('host', targetHost);
    headers.delete('x-origin-verify');
    if (env.ORIGIN_VERIFY_SECRET) {
      headers.set('x-origin-verify', env.ORIGIN_VERIFY_SECRET);
    }

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
