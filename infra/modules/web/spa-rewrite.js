// CloudFront Function (viewer request).
//
// 1. A www. host gets a 301 to the same path on the bare host, so the app has one origin
//    (CORS, Google sign-in and cookies are set up for it).
// 2. App routes such as /watch/abc or /@e2e.creator get /index.html and the React router takes
//    over. Paths ending in a file extension of the build keep their path, so a missing asset is
//    still a 404 instead of an HTML page. Handles may contain dots, so "has a dot" is not enough
//    to call a path a file.
var FILE = /\.(html|js|mjs|css|map|json|txt|xml|webmanifest|svg|png|jpe?g|webp|gif|ico|woff2?)$/i;

// Keys come from the request itself and are only read, never written.
/* eslint-disable security/detect-object-injection */
function query(qs) {
  var parts = [];
  for (var key in qs) {
    var param = qs[key];
    var values = param.multiValue ? param.multiValue : [param];
    for (var i = 0; i < values.length; i++) {
      parts.push(values[i].value === '' ? key : key + '=' + values[i].value);
    }
  }
  return parts.length ? '?' + parts.join('&') : '';
}
/* eslint-enable security/detect-object-injection */

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- CloudFront calls handler by name
function handler(event) {
  var request = event.request;
  var host = request.headers.host ? request.headers.host.value : '';
  if (host.indexOf('www.') === 0) {
    return {
      statusCode: 301,
      statusDescription: 'Moved Permanently',
      headers: { location: { value: 'https://' + host.slice(4) + request.uri + query(request.querystring) } },
    };
  }
  if (!FILE.test(request.uri)) {
    request.uri = '/index.html';
  }
  return request;
}
