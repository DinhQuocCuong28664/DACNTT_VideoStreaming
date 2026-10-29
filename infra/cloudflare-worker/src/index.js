// API gateway of v2: forwards api-v2-<env>.zelostech.site to the API Lambda function URL.
//
// TARGET_HOST (wrangler.toml vars) is the function URL host of the environment.
// ORIGIN_VERIFY_SECRET (`wrangler secret put`) is sent as X-Origin-Verify; the API refuses
// requests without it, so calling the function URL around Cloudflare gets 403. A header of
// that name sent by a client is always replaced. The client address travels as
// CF-Connecting-IP, which the API trusts only together with the origin secret.
export default {
  async fetch(request, env) {
    const targetHost = env.TARGET_HOST;
    if (!targetHost || !env.ORIGIN_VERIFY_SECRET) {
      return new Response(JSON.stringify({ error: { code: 'GATEWAY_NOT_CONFIGURED', message: 'The gateway is not configured' } }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      });
    }

    const url = new URL(request.url);
    url.hostname = targetHost;
    url.port = '';
    url.protocol = 'https:';

    const headers = new Headers(request.headers);
    headers.set('host', targetHost);
    headers.set('x-origin-verify', env.ORIGIN_VERIFY_SECRET);
    const client = request.headers.get('cf-connecting-ip');
    if (client) headers.set('cf-connecting-ip', client);

    const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
    // Bodies stream through unchanged, so binary responses (the 16-byte HLS key) stay binary.
    return fetch(url.toString(), { method: request.method, headers, body: hasBody ? request.body : undefined, redirect: 'manual' });
  },
};
