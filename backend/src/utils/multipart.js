'use strict';
/* Parses a multipart/form-data request body (buffered, size-capped).
   Returns { fields: {}, files: [{ field, filename, mime, data }] } */
const { badRequest, tooLarge } = require('./errors');

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const declared = parseInt(req.headers['content-length'] || '0', 10);
    if (declared > limit) { req.resume(); return reject(tooLarge(`Upload exceeds the ${Math.round(limit / 1048576)} MB limit`)); }
    const chunks = []; let size = 0; let done = false;
    req.on('data', (c) => {
      if (done) return;
      size += c.length;
      if (size > limit) { done = true; req.resume(); return reject(tooLarge(`Upload exceeds the ${Math.round(limit / 1048576)} MB limit`)); }
      chunks.push(c);
    });
    req.on('end', () => { if (!done) { done = true; resolve(Buffer.concat(chunks)); } });
    req.on('error', (e) => { if (!done) { done = true; reject(e); } });
    req.on('aborted', () => { if (!done) { done = true; reject(badRequest('Upload aborted')); } });
  });
}

async function parseMultipart(req, { maxBytes, maxFiles = 1 }) {
  const ct = req.headers['content-type'] || '';
  const m = ct.match(/^multipart\/form-data;\s*boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!m) throw badRequest('Expected multipart/form-data upload');
  const boundary = Buffer.from('--' + (m[1] || m[2]));
  const body = await readBody(req, maxBytes + 64 * 1024);
  const fields = {}; const files = [];
  let pos = body.indexOf(boundary);
  if (pos < 0) throw badRequest('Malformed upload');
  while (pos >= 0) {
    pos += boundary.length;
    if (body[pos] === 0x2d && body[pos + 1] === 0x2d) break;       // closing --
    if (body[pos] === 0x0d) pos += 2;                              // CRLF
    const headerEnd = body.indexOf('\r\n\r\n', pos);
    if (headerEnd < 0) throw badRequest('Malformed upload');
    const headerText = body.slice(pos, headerEnd).toString('utf8');
    const next = body.indexOf(boundary, headerEnd + 4);
    if (next < 0) throw badRequest('Malformed upload');
    const data = body.slice(headerEnd + 4, next - 2);              // strip CRLF before boundary
    const line = (headerText.match(/content-disposition:[^\r\n]*/i) || [''])[0];
    const nameM = /[;\s]name="([^"]*)"/i.exec(line);
    const fileM = /[;\s]filename="([^"]*)"/i.exec(line);
    const type = headerText.match(/content-type:\s*([^\r\n;]+)/i);
    if (nameM) {
      if (fileM) {
        if (fileM[1] !== '') {
          if (files.length >= maxFiles) throw badRequest(`At most ${maxFiles} file(s) per request`);
          files.push({ field: nameM[1], filename: fileM[1], mime: type ? type[1].trim().toLowerCase() : 'application/octet-stream', data });
        }
      } else {
        fields[nameM[1]] = data.toString('utf8').slice(0, 5000);
      }
    }
    pos = next;
  }
  return { fields, files };
}
module.exports = { parseMultipart, readBody };
