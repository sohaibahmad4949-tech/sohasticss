'use strict';
/* Static file server: path-traversal safe, ETag + Last-Modified, Range
   (needed for video seeking), gzip for text assets. */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.map': 'application/json'
};
const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.json', '.txt', '.xml', '.svg']);
const gzCache = new Map();

function serveDir(root, { prefix = '', cache = 'public, max-age=300', immutable = false, index = 'index.html', hide = /^$/ } = {}) {
  const absRoot = path.resolve(root);
  return async function serve(req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (prefix && !(req.path === prefix || req.path.startsWith(prefix + '/'))) return next();
    let rel = req.path.slice(prefix.length) || '/';
    if (rel.includes('\0')) return next();
    if (rel.endsWith('/')) rel += index;
    const file = path.resolve(absRoot, '.' + path.posix.normalize(rel));
    if (file !== absRoot && !file.startsWith(absRoot + path.sep)) return next();
    const relFromRoot = path.relative(absRoot, file).split(path.sep);
    if (relFromRoot.some((s) => s.startsWith('.')) || hide.test(relFromRoot.join('/'))) return next();
    let st;
    try { st = await fs.promises.stat(file); } catch (e) { return next(); }
    if (st.isDirectory()) {
      if (!req.path.endsWith('/')) { res.statusCode = 301; res.setHeader('Location', req.path + '/'); return res.end(); }
      return next();
    }
    const ext = path.extname(file).toLowerCase();
    const type = TYPES[ext];
    if (!type) return next();                      // unknown types are never served
    const etag = '"' + crypto.createHash('sha1').update(st.size + ':' + st.mtimeMs).digest('hex').slice(0, 16) + '"';
    res.setHeader('ETag', etag);
    res.setHeader('Last-Modified', st.mtime.toUTCString());
    res.setHeader('Cache-Control', immutable ? 'public, max-age=31536000, immutable' : cache);
    res.setHeader('Content-Type', type);
    res.setHeader('Accept-Ranges', 'bytes');
    if (req.headers['if-none-match'] === etag) { res.statusCode = 304; return res.end(); }

    const range = req.headers.range && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (range) {
      let start = range[1] === '' ? st.size - parseInt(range[2], 10) : parseInt(range[1], 10);
      let end = range[1] === '' || range[2] === '' ? st.size - 1 : parseInt(range[2], 10);
      if (!(start >= 0) || end >= st.size) end = st.size - 1;
      if (!(start >= 0) || start > end) { res.statusCode = 416; res.setHeader('Content-Range', `bytes */${st.size}`); return res.end(); }
      res.statusCode = 206;
      res.setHeader('Content-Range', `bytes ${start}-${end}/${st.size}`);
      res.setHeader('Content-Length', end - start + 1);
      if (req.method === 'HEAD') return res.end();
      return fs.createReadStream(file, { start, end }).pipe(res);
    }

    if (COMPRESSIBLE.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] || '') && st.size > 1024) {
      const key = file + ':' + etag;
      let gz = gzCache.get(key);
      if (!gz) { gz = zlib.gzipSync(await fs.promises.readFile(file)); if (gzCache.size > 200) gzCache.clear(); gzCache.set(key, gz); }
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Vary', 'Accept-Encoding');
      res.setHeader('Content-Length', gz.length);
      return res.end(req.method === 'HEAD' ? undefined : gz);
    }
    res.setHeader('Content-Length', st.size);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  };
}
module.exports = { serveDir, TYPES };
