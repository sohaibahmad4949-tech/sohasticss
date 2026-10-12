/**
 * Rules for URL-ish values that end up inside the public site's markup
 * (image/video sources). Strict on purpose: the CMS engine builds some of
 * these into style attributes, so quotes, brackets and whitespace are refused.
 */
const SAFE_URL = /^(https?:\/\/[^\s'"`()<>\\]+|\/[^\s'"`()<>\\]*)$/i;
const MAX_URL = 2048;

function isSafeUrl(value) {
  return typeof value === 'string' && value.length <= MAX_URL && SAFE_URL.test(value);
}

const DATA_IMAGE = /^data:image\/(png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/;

module.exports = { isSafeUrl, DATA_IMAGE, MAX_URL };
