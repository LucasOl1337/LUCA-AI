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
    const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
    const publicHost = forwardedHost && req.headers['cf-ray'] ? forwardedHost : String(req.headers.host || '');
    return new URL(origin).host === publicHost;
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

export function createAuthService({ rootDir = process.cwd(), dataPath = '', adminEmails = [], internalToken = '', workspaceCounter = null } = {}) {
  const stateDirectory = process.env.LUCA_DATA_DIR || path.resolve(rootDir, '.luca');
  const store = new AuthStore(dataPath || path.resolve(stateDirectory, 'auth.json'), { adminEmails });
  store.ensureAdminEmails(adminEmails);
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

  function workspaceCount() {
    try {
      if (typeof workspaceCounter === 'function') return Number(workspaceCounter() || 0);
    } catch {
      // ignore workspace probe failures
    }
    return 0;
  }

  function registerRoutes(app) {
    app.get('/api/auth/session', (req, res) => {
      store.syncAdminRoles({ persist: true });
      const session = sessionFromRequest(req, { touch: true });
      res.json({
        ok: true,
        user: session?.user ?? null,
        impersonation: session?.impersonation ?? null,
      });
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
        // Re-sync allowlist after login so env changes promote existing accounts.
        store.syncAdminRoles({ persist: true });
        const refreshed = store.resolveSession(result.token, { touch: false });
        res.setHeader('Set-Cookie', cookieHeader(result.token, req, 30 * 24 * 60 * 60));
        res.json({ ok: true, user: refreshed?.user || result.user });
      } catch (error) {
        sendAuthError(res, error);
      }
    });

    app.post('/api/auth/logout', (req, res) => {
      store.logout(tokenFromRequest(req));
      res.setHeader('Set-Cookie', cookieHeader('', req, 0));
      res.json({ ok: true });
    });

    // Sai do modo suporte e volta à conta admin (sem senha).
    app.post('/api/auth/stop-impersonation', (req, res) => {
      if (!sameOriginRequest(req)) {
        res.status(403).json({ ok: false, error: 'invalid_origin' });
        return;
      }
      try {
        const result = store.stopImpersonation(tokenFromRequest(req), {
          ip: requestIp(req),
          userAgent: req.headers['user-agent'],
        });
        res.setHeader('Set-Cookie', cookieHeader(result.token, req, 30 * 24 * 60 * 60));
        res.json({ ok: true, user: result.user, impersonation: null });
      } catch (error) {
        sendAuthError(res, error);
      }
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
    res.once('finish', () => {
      store.recordUsage(session.user.id, {
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
      });
    });
    next();
  }

  function requireAdmin(req, res, next) {
    store.syncAdminRoles({ persist: true });
    // Refresh role from store after allowlist sync.
    if (req.auth?.user?.id) {
      const fresh = store.listUsers().find((user) => user.id === req.auth.user.id);
      if (fresh) req.auth.user = fresh;
    }
    if (req.auth?.user?.role !== 'admin') {
      res.status(403).json({ ok: false, error: 'admin_required' });
      return;
    }
    next();
  }

  function ensureProductUsageBaseline() {
    if (typeof getProductUsageSummary !== 'function') return;
    try {
      store.rebaselineProductUsageV3((userId) => getProductUsageSummary(userId));
    } catch (error) {
      console.error('[auth] rebaselineProductUsageV3 failed', error?.message || error);
    }
  }

  function enrichUserWithProductUsage(user) {
    if (!user?.id || typeof getProductUsageSummary !== 'function') {
      return {
        ...user,
        promptCount: Number(user?.promptCount ?? user?.requestCount ?? 0),
        chatSessionCount: Number(user?.chatSessionCount || 0),
        workSessionCount: Number(user?.workSessionCount || 0),
      };
    }
    try {
      const product = getProductUsageSummary(user.id) || {};
      const promptCount = Math.max(0, Number(product.promptCount) || 0);
      return {
        ...user,
        promptCount,
        // Compat: rankings/UI antigos que leem requestCount/runCount.
        requestCount: promptCount,
        runCount: promptCount,
        chatSessionCount: Math.max(0, Number(product.chatSessionCount) || 0),
        workSessionCount: Math.max(0, Number(product.workSessionCount) || 0),
        messageCount: Math.max(0, Number(product.messageCount) || 0),
      };
    } catch {
      return {
        ...user,
        promptCount: Number(user?.promptCount ?? user?.requestCount ?? 0),
        chatSessionCount: 0,
        workSessionCount: 0,
      };
    }
  }

  let getProductUsageSummary = null;

  function registerAdminRoutes(app, {
    getUserChatLibrary = null,
    getUserChatSession = null,
    getProductUsage = null,
  } = {}) {
    if (typeof getProductUsage === 'function') {
      getProductUsageSummary = getProductUsage;
      ensureProductUsageBaseline();
    }

    app.get('/api/admin/overview', requireAdmin, (_req, res) => {
      ensureProductUsageBaseline();
      const users = store.listUsers().map(enrichUserWithProductUsage);
      const totalPrompts = users.reduce((sum, user) => sum + Number(user.promptCount || 0), 0);
      const usersWithPrompts = users.filter((user) => Number(user.promptCount || 0) > 0).length;
      const overview = {
        ...store.overview({ workspaces: workspaceCount() }),
        totalRequests: totalPrompts,
        totalPrompts,
        totalRuns: totalPrompts,
        totalActions: users.reduce((sum, user) => sum + Number(user.chatSessionCount || 0), 0),
        usersWithRuns: usersWithPrompts,
        usersWithActions: users.filter((user) => Number(user.chatSessionCount || 0) > 0).length,
        usersWithoutRuns: Math.max(0, users.length - usersWithPrompts),
      };
      res.json({ ok: true, overview });
    });
    app.get('/api/admin/users', requireAdmin, (req, res) => {
      ensureProductUsageBaseline();
      const users = store.listUsers({
        search: req.query.search,
        sort: req.query.sort,
      }).map(enrichUserWithProductUsage);
      // Re-sort after enrichment when ranking by product fields.
      const sort = String(req.query.sort || '');
      if (sort === 'runs_desc' || sort === 'requests_desc') {
        users.sort((a, b) => (b.promptCount || 0) - (a.promptCount || 0));
      }
      res.json({ ok: true, users });
    });
    app.get('/api/admin/report', requireAdmin, (req, res) => {
      ensureProductUsageBaseline();
      const limit = Math.max(1, Math.min(30, Number(req.query.limit) || 8));
      const users = store.listUsers().map(enrichUserWithProductUsage);
      const totalPrompts = users.reduce((sum, user) => sum + Number(user.promptCount || 0), 0);
      const usersWithPrompts = users.filter((user) => Number(user.promptCount || 0) > 0).length;
      const usersWithSessions = users.filter((user) => Number(user.chatSessionCount || 0) > 0).length;
      const overview = {
        ...store.overview({ workspaces: workspaceCount() }),
        totalRequests: totalPrompts,
        totalPrompts,
        totalRuns: totalPrompts,
        totalActions: users.reduce((sum, user) => sum + Number(user.chatSessionCount || 0), 0),
        usersWithRuns: usersWithPrompts,
        usersWithActions: usersWithSessions,
        usersWithoutRuns: Math.max(0, users.length - usersWithPrompts),
      };
      const byPrompts = [...users].sort((a, b) => (b.promptCount || 0) - (a.promptCount || 0)).slice(0, limit);
      const bySessions = [...users].sort((a, b) => (b.chatSessionCount || 0) - (a.chatSessionCount || 0)).slice(0, limit);
      const byActivity = [...users].sort((a, b) => Date.parse(b.lastSeenAt || 0) - Date.parse(a.lastSeenAt || 0)).slice(0, limit);
      const activationRate = overview.totalUsers
        ? Number(((usersWithPrompts / overview.totalUsers) * 100).toFixed(1))
        : 0;
      const activeRate = overview.totalUsers
        ? Number(((overview.activeToday / overview.totalUsers) * 100).toFixed(1))
        : 0;
      res.json({
        ok: true,
        report: {
          overview,
          funnel: {
            registered: overview.totalUsers,
            activeToday: overview.activeToday,
            withActions: usersWithSessions,
            withRuns: usersWithPrompts,
            withoutRuns: Math.max(0, overview.totalUsers - usersWithPrompts),
            activationRate,
            activeRate,
          },
          rankings: {
            byRuns: byPrompts.map((user, index) => ({ rank: index + 1, ...user })),
            byActions: bySessions.map((user, index) => ({ rank: index + 1, ...user })),
            byRequests: byPrompts.map((user, index) => ({ rank: index + 1, ...user })),
            byActivity: byActivity.map((user, index) => ({ rank: index + 1, ...user })),
          },
          generatedAt: overview.generatedAt,
        },
      });
    });

    // Read-only inspect of another account's LUCA-AI chat library (no write / no session hijack).
    app.get('/api/admin/users/:userId/chat/library', requireAdmin, (req, res) => {
      if (typeof getUserChatLibrary !== 'function') {
        res.status(501).json({ ok: false, error: 'chat_library_unavailable' });
        return;
      }
      try {
        const userId = String(req.params.userId || '').trim();
        const account = store.listUsers().find((user) => user.id === userId) || null;
        if (!account) {
          res.status(404).json({ ok: false, error: 'user_not_found' });
          return;
        }
        const library = getUserChatLibrary(userId);
        res.json({
          ok: true,
          mode: 'admin_readonly',
          account: {
            id: account.id,
            name: account.name,
            email: account.email,
            role: account.role,
            lastSeenAt: account.lastSeenAt,
          },
          ...library,
        });
      } catch (error) {
        res.status(Number(error?.status) || 500).json({ ok: false, error: error?.message || String(error) });
      }
    });

    app.get('/api/admin/users/:userId/chat/sessions/:sessionId', requireAdmin, (req, res) => {
      if (typeof getUserChatSession !== 'function') {
        res.status(501).json({ ok: false, error: 'chat_library_unavailable' });
        return;
      }
      try {
        const userId = String(req.params.userId || '').trim();
        const sessionId = String(req.params.sessionId || '').trim();
        const account = store.listUsers().find((user) => user.id === userId) || null;
        if (!account) {
          res.status(404).json({ ok: false, error: 'user_not_found' });
          return;
        }
        const session = getUserChatSession(userId, sessionId);
        res.json({
          ok: true,
          mode: 'admin_readonly',
          account: {
            id: account.id,
            name: account.name,
            email: account.email,
            role: account.role,
          },
          session,
        });
      } catch (error) {
        res.status(Number(error?.status) || 500).json({ ok: false, error: error?.message || String(error) });
      }
    });

    // Suporte: admin assume a sessão da conta (cookie) para reproduzir o produto.
    app.post('/api/admin/users/:userId/impersonate', requireAdmin, (req, res) => {
      try {
        const targetUserId = String(req.params.userId || '').trim();
        const result = store.impersonate({
          actorAdminId: req.auth.user.id,
          targetUserId,
          ip: requestIp(req),
          userAgent: req.headers['user-agent'],
        });
        res.setHeader('Set-Cookie', cookieHeader(result.token, req, 30 * 24 * 60 * 60));
        res.json({
          ok: true,
          user: result.user,
          impersonation: result.impersonation,
        });
      } catch (error) {
        sendAuthError(res, error);
      }
    });
  }

  return { registerRoutes, registerAdminRoutes, requireUser, sessionFromRequest, store };
}
