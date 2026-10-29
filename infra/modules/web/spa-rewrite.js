// CloudFront Function (viewer request): app routes such as /watch/abc or /@e2e.creator get
// /index.html and the React router takes over. Paths ending in a file extension of the build
// keep their path, so a missing asset is still a 404 instead of an HTML page. Handles may
// contain dots, so "has a dot" is not enough to call a path a file.
var FILE = /\.(html|js|mjs|css|map|json|txt|xml|webmanifest|svg|png|jpe?g|webp|gif|ico|woff2?)$/i;

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- CloudFront calls handler by name
function handler(event) {
  var request = event.request;
  if (!FILE.test(request.uri)) {
    request.uri = '/index.html';
  }
  return request;
}
