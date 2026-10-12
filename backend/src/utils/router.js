'use strict';
/* A very small Express-style app: middleware chain, route params, groups. */
const { AppError } = require('./errors');

function compile(path) {
  const keys = [];
  const src = path.replace(/\/+$/, '').split('/').map((seg) => {
    if (seg.startsWith(':')) { keys.push(seg.slice(1)); return '([^/]+)'; }
    return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('/');
  return { re: new RegExp('^' + (src || '') + '/?$'), keys };
}

function createApp() {
  const globals = []; const routes = []; let errorHandler = null; let notFoundHandler = null;

  function add(method, path, handlers) {
    const c = compile(path);
    routes.push({ method, re: c.re, keys: c.keys, handlers: handlers.flat() });
  }
  function api(prefix, mw) {
    const p = (path) => prefix + (path === '/' ? '' : path);
    const h = (fns) => [...mw, ...fns];
    return {
      get: (path, ...f) => add('GET', p(path), h(f)),
      post: (path, ...f) => add('POST', p(path), h(f)),
      put: (path, ...f) => add('PUT', p(path), h(f)),
      patch: (path, ...f) => add('PATCH', p(path), h(f)),
      delete: (path, ...f) => add('DELETE', p(path), h(f)),
      group: (sub, ...more) => api(prefix + sub, [...mw, ...more])
    };
  }

  /* Runs the chain. Every promise returned by next() is tracked, so an error
     thrown downstream always reaches the error handler even if a middleware
     forgot to `return next()`. */
  async function run(fns, req, res) {
    let i = 0; const pending = [];
    const next = (err) => {
      if (err) return Promise.reject(err);
      const fn = fns[i++];
      if (!fn || res.writableEnded) return Promise.resolve();
      const p = Promise.resolve().then(() => fn(req, res, next));
      pending.push(p);
      return p;
    };
    await next();
    while (pending.length) await pending.shift();
  }

  async function handle(req, res) {
    try {
      const url = new URL(req.url, 'http://x');
      req.path = decodeURIComponent(url.pathname);
      req.query = Object.fromEntries(url.searchParams);
      req.params = {};
      const chain = [...globals];
      let matched = null; let pathMatched = false;
      for (const r of routes) {
        const m = r.re.exec(req.path);
        if (!m) continue;
        pathMatched = true;
        if (r.method !== req.method && !(r.method === 'GET' && req.method === 'HEAD')) continue;
        matched = r;
        r.keys.forEach((k, idx) => { req.params[k] = m[idx + 1]; });
        break;
      }
      if (matched) chain.push(...matched.handlers);
      else chain.push(async (rq, rs) => {
        if (rq.method === 'OPTIONS') { rs.statusCode = 204; return rs.end(); }
        if (notFoundHandler && !pathMatched) return notFoundHandler(rq, rs);
        throw new AppError(pathMatched ? 405 : 404, pathMatched ? 'Method not allowed' : 'Route not found',
          { code: pathMatched ? 'METHOD_NOT_ALLOWED' : 'NOT_FOUND' });
      });
      await run(chain, req, res);
    } catch (err) {
      if (errorHandler) errorHandler(err, req, res);
      else { res.statusCode = 500; res.end('Internal Server Error'); }
    }
  }

  return {
    use: (fn) => globals.push(fn),
    onError: (fn) => { errorHandler = fn; },
    onNotFound: (fn) => { notFoundHandler = fn; },
    handle,
    ...api('', [])
  };
}
module.exports = { createApp };
