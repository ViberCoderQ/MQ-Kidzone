// Minimal static file server for running this app locally. Needed because opening index.html
// directly (file://) blocks canvas pixel reads (getImageData/toBlob) as a security restriction --
// that breaks the admin editor's Save/Download, the eyedropper, undo/redo snapshots, and template
// thumbnail cropping. Always launch via "Launch Kid Zone.bat", not by double-clicking index.html.
const http = require('http');
const fs = require('fs');
const path = require('path');

// Deliberately not 8791 or 8792 -- the original coloring-app's live server uses 8791, and the
// test suite (tests/run-all.js) uses 8791/8792 internally for its own temp-copy runs. This port
// is just for day-to-day local use of this app, so it can run alongside both without colliding.
const PORT = 8793;
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.webmanifest': 'application/manifest+json',
};

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const filePath = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`Kid Zone server running at http://localhost:${PORT}`));
