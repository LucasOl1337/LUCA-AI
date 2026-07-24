import path from 'node:path';
import { AuthError, AuthStore } from './auth-store.js';

export const AUTH_COOKIE = 'luca_session';

function parseCookies(header = '') {
  return Object.fromEntries(String(header).split(';').map((part) => {
    const separator = part.indexOf('=');
    if (separator < 0) return ['', ''];
    return [part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim())];
  }).filter(([key]) => key));
}

function requestIp(req) {
  return String(req.headers['cf-connecting-ip'] || req.ip || req.socket.remoteAddress || '');
}

function sameOriginRequest(req) {
  const fetchSite = String(req.headers['sec-fetch-site'] || '').toLowerCase();
  if (fetchSite === 'cross-site') return false;
  const origin = String(req.headers.origin || '').trim();
  if (!origin) return true;
  try {
    return new URL(origin).host === String(req.headers.host || '');
  } catch {
    return false;
  }
}

function isSecureRequest(req) {
  return req.secure || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https' || Boolean(req.headers['cf-ray']);
}

function cookieHeader(token, req, maxAgeSeconds) {
  const parts = [`${AUTH_COOKIE}=${encodeURIComponent(token)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSeconds}`];
  if (isSecureRequest(req)) parts.push('Secure');
  return parts.join('; ');
}

function sendAuthError(res, error) {
  if (error instanceof AuthError) {
    res.status(error.status).json({ ok: false, error: error.code });
    return;
  }
  console.error('[auth]', error);
  res.status(500).json({ ok: false, error: 'auth_internal_error' });
}

export function createAuthService({ rootDir = process.cwd(), dataPath = '', adminEmails = [], internalToken = '' } = {}) {
  const stateDirectory = process.env.LUCA_DATA_DIR || path.resolve(rootDir, '.luca');
  const store = new AuthStore(dataPath || path.resolve(stateDirectory, 'auth.json'), { adminEmails });
  const authAttempts = new Map();

  function protectAuthAttempt(req, res, next) {
    if (!sameOriginRequest(req)) {
      res.status(403).json({ ok: false, error: 'invalid_origin' });
      return;
    }
    const key = requestIp(req);
    const now = Date.now();
    const bucket = authAttempts.get(key);
    if (!bucket || bucket.resetAt <= now) {
      authAttempts.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
      next();
      return;
    }
    bucket.count += 1;
    if (bucket.count > 20) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      res.status(429).json({ ok: false, error: 'rate_limit_exceeded' });
      return;
    }
    next();
  }

  function tokenFromRequest(req) {
    return parseCookies(req.headers.cookie)[AUTH_COOKIE] || '';
  }

  function sessionFromRequest(req, options) {
    return store.resolveSession(tokenFromRequest(req), options);
  }

  function registerRoutes(app) {
    app.get('/api/auth/session', (req, res) => {
      const session = sessionFromRequest(req, { touch: true });
      res.json({ ok: true, user: session?.user ?? null });
    });

    app.post('/api/auth/register', protectAuthAttempt, (req, res) => {
      try {
        const result = store.register({
          name: req.body?.name,
          email: req.body?.email,
          password: req.body?.password,
          ip: requestIp(req),
          userAgent: req.headers['user-agent'],
        });
        res.setHeader('Set-Cookie', cookieHeader(result.token, req, 30 * 24 * 60 * 60));
        res.status(201).json({ ok: true, user: result.user });
      } catch (error) {
        sendAuthError(res, error);
      }
    });

    app.post('/api/auth/login', protectAuthAttempt, (req, res) => {
      try {
        const result = store.login({
          email: req.body?.email,
          password: req.body?.password,
          ip: requestIp(req),
          userAgent: req.headers['user-agent'],
        });
        res.setHeader('Set-Cookie', cookieHeader(result.token, req, 30 * 24 * 60 * 60));
        res.json({ ok: true, user: result.user });
      } catch (error) {
        sendAuthError(res, error);
      }
    });

    app.post('/api/auth/logout', (req, res) => {
      store.logout(tokenFromRequest(req));
      res.setHeader('Set-Cookie', cookieHeader('', req, 0));
      res.json({ ok: true });
    });
  }

  function requireUser(req, res, next) {
    const remoteAddress = String(req.socket.remoteAddress || '');
    const internalRequest = internalToken
      && req.headers['x-luca-internal-auth'] === internalToken
      && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remoteAddress);
    if (internalRequest) {
      req.auth = { user: { id: 'system', name: 'LUCA Runtime', email: '', role: 'admin', status: 'active' } };
      next();
      return;
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !sameOriginRequest(req)) {
      res.status(403).json({ ok: false, error: 'invalid_origin' });
      return;
    }
    const session = sessionFromRequest(req, { touch: true });
    if (!session) {
      res.status(401).json({ ok: false, error: 'authentication_required' });
      return;
    }
    req.auth = session;
    next();
  }

  function requireAdmin(req, res, next) {
    if (req.auth?.user?.role !== 'admin') {
      res.status(403).json({ ok: false, error: 'admin_required' });
      return;
    }
    next();
  }

  function registerAdminRoutes(app) {
    app.get('/api/admin/overview', requireAdmin, (_req, res) => {
      res.json({ ok: true, overview: store.overview() });
    });
    app.get('/api/admin/users', requireAdmin, (req, res) => {
      res.json({ ok: true, users: store.listUsers({ search: req.query.search }) });
    });
  }

  return { registerRoutes, registerAdminRoutes, requireUser, sessionFromRequest, store };
}
