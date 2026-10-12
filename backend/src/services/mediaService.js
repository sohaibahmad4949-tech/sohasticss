'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const media = require('../models/media');
const content = require('../models/content');
const collections = require('../models/collections');
const { badRequest, tooLarge, notFound, validation } = require('../utils/errors');

/* Identify a file by its leading bytes — the client-supplied name and MIME type are never trusted. */
function detect(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf.slice(1, 4).toString() === 'PNG' && buf[4] === 0x0d) return { kind: 'image', mime: 'image/png', ext: 'png' };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { kind: 'image', mime: 'image/jpeg', ext: 'jpg' };
  if (/^GIF8[79]a/.test(buf.slice(0, 6).toString('latin1'))) return { kind: 'image', mime: 'image/gif', ext: 'gif' };
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return { kind: 'image', mime: 'image/webp', ext: 'webp' };
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return { kind: 'video', mime: 'video/webm', ext: 'webm' };
  if (buf.slice(4, 8).toString('latin1') === 'ftyp') {
    const brand = buf.slice(8, 12).toString('latin1');
    return brand === 'qt  ' ? { kind: 'video', mime: 'video/quicktime', ext: 'mov' } : { kind: 'video', mime: 'video/mp4', ext: 'mp4' };
  }
  return null;
}

const limitBytes = (kind) => (kind === 'video' ? config.MAX_VIDEO_MB : config.MAX_IMAGE_MB) * 1024 * 1024;
const publicUrl = (rel) => config.PUBLIC_URL + rel;

async function saveBuffer(buf, { originalName = '', createdBy = null, dedupe = false } = {}) {
  const type = detect(buf);
  if (!type) throw validation([{ field: 'file', message: 'Unsupported file type. Allowed: PNG, JPG, GIF, WebP images and MP4, WebM, MOV videos.' }]);
  if (buf.length > limitBytes(type.kind)) {
    throw tooLarge(`${type.kind === 'video' ? 'Videos' : 'Images'} can be at most ${type.kind === 'video' ? config.MAX_VIDEO_MB : config.MAX_IMAGE_MB} MB`);
  }
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  if (dedupe) { const existing = media.findBySha(sha); if (existing && fs.existsSync(path.join(config.UPLOAD_DIR, existing.filename))) return existing; }

  const d = new Date();
  const rel = `${type.kind}s/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}.${type.ext}`;
  const abs = path.join(config.UPLOAD_DIR, rel);
  await fs.promises.mkdir(path.dirname(abs), { recursive: true });
  await fs.promises.writeFile(abs, buf, { flag: 'wx', mode: 0o644 });
  try {
    return media.create({
      id: crypto.randomUUID(), kind: type.kind, filename: rel, originalName: String(originalName).replace(/[^\w.\- ]+/g, '').slice(0, 120),
      mime: type.mime, size: buf.length, sha256: sha, url: publicUrl('/uploads/' + rel), createdBy
    });
  } catch (e) { await fs.promises.unlink(abs).catch(() => {}); throw e; }
}

function decodeDataUri(uri) {
  const m = /^data:image\/(?:png|jpe?g|webp|gif);base64,([A-Za-z0-9+/=\s]+)$/i.exec(uri);
  if (!m) throw validation([{ field: 'image', message: 'Embedded images must be PNG, JPG, GIF or WebP' }]);
  return Buffer.from(m[1], 'base64');
}

/* Walk any JSON value, saving embedded data:image URIs as files and replacing them with URLs. */
async function externalizeDataUris(value, adminId) {
  if (typeof value === 'string') {
    if (!/^\s*data:/i.test(value)) return value;
    const file = await saveBuffer(decodeDataUri(value.trim()), { originalName: 'embedded', createdBy: adminId, dedupe: true });
    return file.url;
  }
  if (Array.isArray(value)) { const out = []; for (const v of value) out.push(await externalizeDataUris(v, adminId)); return out; }
  if (value && typeof value === 'object') {
    const out = {}; for (const [k, v] of Object.entries(value)) out[k] = await externalizeDataUris(v, adminId); return out;
  }
  return value;
}

function inUse(m) { return content.allJsonText().includes(m.filename) || collections.searchText(m.filename); }

async function remove(id, { force = false } = {}) {
  const m = media.get(id);
  if (!m) throw notFound('File not found');
  if (!force && inUse(m)) throw badRequest('This file is used by your site content. Remove it from the page first, or delete anyway.', { code: 'MEDIA_IN_USE' });
  media.remove(id);
  await fs.promises.unlink(path.join(config.UPLOAD_DIR, m.filename)).catch(() => {});
  return m;
}
module.exports = { detect, saveBuffer, externalizeDataUris, remove, inUse, limitBytes };
