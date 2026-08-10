import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TOUCH_INTERVAL_MS = 60 * 1000;

export class AuthError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function passwordHash(password, salt) {
  return crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString('hex');
}

function safeEqualHex(left, right) {
  try {
    const a = Buffer.from(left, 'hex');
    const b = Buffer.from(right, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function usageSnapshot(user) {
  const usage = user.usage && typeof user.usage === 'object' ? user.usage : {};
  return {
    requestCount: Number(usage.requestCount || 0),
    actionCount: Number(usage.actionCount || 0),
    runCount: Number(usage.runCount || 0),
    errorCount: Number(usage.errorCount || 0),
    websocketCount: Number(usage.websocketCount || 0),
    lastRequestAt: String(usage.lastRequestAt || ''),
  };
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    lastSeenAt: user.lastSeenAt,
    loginCount: user.loginCount,
    ...usageSnapshot(user),
  };
}

export class AuthStore {
  constructor(filePath, { adminEmails = [] } = {}) {
    this.filePath = filePath;
    this.adminEmails = new Set(adminEmails.map(normalizeEmail).filter(Boolean));
    this.data = this.#load();
    this.syncAdminRoles({ persist: true });
  }

  #load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      return {
        version: 1,
        users: Array.isArray(parsed.users) ? parsed.users : [],
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      };
    } catch {
      return { version: 1, users: [], sessions: [] };
    }
  }

  #persist() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(this.data, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temporaryPath, this.filePath);
  }

  /**
   * Promote allowlisted emails to admin at runtime (not only on register).
   * Never demotes existing admins automatically.
   */
  syncAdminRoles({ persist = true } = {}) {
    if (!this.adminEmails.size) return { changed: 0, admins: [] };
    let changed = 0;
    for (const user of this.data.users) {
      const email = normalizeEmail(user.email);
      if (!this.adminEmails.has(email)) continue;
      if (user.role !== 'admin') {
        user.role = 'admin';
        changed += 1;
      }
    }
    if (changed && persist) this.#persist();
    return {
      changed,
      admins: this.data.users
        .filter((user) => user.role === 'admin')
        .map((user) => ({ id: user.id, email: user.email, name: user.name })),
    };
  }

  ensureAdminEmails(emails = []) {
    for (const email of emails.map(normalizeEmail).filter(Boolean)) {
      this.adminEmails.add(email);
    }
    return this.syncAdminRoles({ persist: true });
  }

  #cleanupSessions() {
    const now = Date.now();
    const before = this.data.sessions.length;
    this.data.sessions = this.data.sessions.filter((session) => Date.parse(session.expiresAt) > now);
    return before !== this.data.sessions.length;
  }

  register({ name, email, password, ip = '', userAgent = '' }) {
    const normalizedEmail = normalizeEmail(email);
    const normalizedName = String(name ?? '').trim().slice(0, 80) || normalizedEmail.split('@')[0];
    if (!validEmail(normalizedEmail)) throw new AuthError('invalid_email');
    if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
      throw new AuthError('invalid_password');
    }
    if (this.data.users.some((user) => user.email === normalizedEmail)) {
      throw new AuthError('email_already_registered', 409);
    }

    const timestamp = nowIso();
    const salt = crypto.randomBytes(16).toString('hex');
    const isFirstAccount = this.data.users.length === 0;
    const user = {
      id: crypto.randomUUID(),
      name: normalizedName,
      email: normalizedEmail,
      role: (isFirstAccount && this.adminEmails.size === 0) || this.adminEmails.has(normalizedEmail) ? 'admin' : 'user',
      status: 'active',
      passwordSalt: salt,
      passwordHash: passwordHash(password, salt),
      createdAt: timestamp,
      lastLoginAt: timestamp,
      lastSeenAt: timestamp,
      loginCount: 1,
      usage: {
        requestCount: 0,
        actionCount: 0,
        runCount: 0,
        errorCount: 0,
        websocketCount: 0,
        lastRequestAt: '',
      },
    };
    this.data.users.push(user);
    const session = this.#createSession(user, { ip, userAgent, persist: false });
    this.#persist();
    return { user: publicUser(user), ...session };
  }

  login({ email, password, ip = '', userAgent = '' }) {
    const normalizedEmail = normalizeEmail(email);
    const user = this.data.users.find((candidate) => candidate.email === normalizedEmail);
    if (!user || typeof password !== 'string') throw new AuthError('invalid_credentials', 401);
    const candidateHash = passwordHash(password, user.passwordSalt);
    if (!safeEqualHex(candidateHash, user.passwordHash)) throw new AuthError('invalid_credentials', 401);
    if (user.status !== 'active') throw new AuthError('account_disabled', 403);

    const timestamp = nowIso();
    user.lastLoginAt = timestamp;
    user.lastSeenAt = timestamp;
    user.loginCount = Number(user.loginCount || 0) + 1;
    const session = this.#createSession(user, { ip, userAgent, persist: false });
    this.#persist();
    return { user: publicUser(user), ...session };
  }

  #createSession(user, { ip, userAgent, persist = true, actorAdminId = '' } = {}) {
    this.#cleanupSessions();
    const token = crypto.randomBytes(32).toString('base64url');
    const createdAt = nowIso();
    const actor = String(actorAdminId || '').trim();
    const session = {
      id: crypto.randomUUID(),
      userId: user.id,
      tokenHash: hashToken(token),
      ip: String(ip || '').slice(0, 120),
      userAgent: String(userAgent || '').slice(0, 500),
      createdAt,
      lastSeenAt: createdAt,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
      // Sessão de suporte: cookie age como o usuário, mas carrega o admin que entrou.
      ...(actor ? { actorAdminId: actor } : {}),
    };
    this.data.sessions.push(session);
    const ownSessions = this.data.sessions.filter((item) => item.userId === user.id)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    if (ownSessions.length > 10) {
      const keep = new Set(ownSessions.slice(0, 10).map((item) => item.id));
      this.data.sessions = this.data.sessions.filter((item) => item.userId !== user.id || keep.has(item.id));
    }
    if (persist) this.#persist();
    return { token, expiresAt: session.expiresAt, sessionId: session.id, actorAdminId: actor || undefined };
  }

  #impersonationPayload(session) {
    const actorId = String(session?.actorAdminId || '').trim();
    if (!actorId) return null;
    const actor = this.data.users.find((candidate) => candidate.id === actorId);
    if (!actor) return { active: true, actorAdminId: actorId, actor: null };
    return {
      active: true,
      actorAdminId: actor.id,
      actor: {
        id: actor.id,
        name: actor.name,
        email: actor.email,
        role: actor.role,
      },
    };
  }

  resolveSession(token, { touch = false } = {}) {
    if (!token) return null;
    const changed = this.#cleanupSessions();
    const session = this.data.sessions.find((candidate) => candidate.tokenHash === hashToken(token));
    if (!session) {
      if (changed) this.#persist();
      return null;
    }
    const user = this.data.users.find((candidate) => candidate.id === session.userId);
    if (!user || user.status !== 'active') return null;
    if (touch && Date.now() - Date.parse(session.lastSeenAt) >= TOUCH_INTERVAL_MS) {
      session.lastSeenAt = nowIso();
      user.lastSeenAt = session.lastSeenAt;
      this.#persist();
    } else if (changed) {
      this.#persist();
    }
    return {
      user: publicUser(user),
      session: { id: session.id, expiresAt: session.expiresAt },
      impersonation: this.#impersonationPayload(session),
    };
  }

  /**
   * Admin entra na conta de outro usuário (suporte). Não incrementa loginCount.
   * Emite sessão com actorAdminId para permitir "voltar" sem senha.
   */
  impersonate({ actorAdminId, targetUserId, ip = '', userAgent = '' }) {
    const actorId = String(actorAdminId || '').trim();
    const targetId = String(targetUserId || '').trim();
    if (!actorId || !targetId) throw new AuthError('user_not_found', 404);

    this.syncAdminRoles({ persist: false });
    const actor = this.data.users.find((candidate) => candidate.id === actorId);
    if (!actor || actor.role !== 'admin' || actor.status !== 'active') {
      throw new AuthError('admin_required', 403);
    }
    if (actorId === targetId) throw new AuthError('cannot_impersonate_self', 400);

    const target = this.data.users.find((candidate) => candidate.id === targetId);
    if (!target) throw new AuthError('user_not_found', 404);
    if (target.status !== 'active') throw new AuthError('account_disabled', 403);

    // Atualiza lastSeen do alvo (atividade de suporte), sem contar login real.
    target.lastSeenAt = nowIso();
    const session = this.#createSession(target, {
      ip,
      userAgent,
      actorAdminId: actor.id,
      persist: false,
    });
    this.#persist();
    return {
      user: publicUser(target),
      ...session,
      impersonation: {
        active: true,
        actorAdminId: actor.id,
        actor: {
          id: actor.id,
          name: actor.name,
          email: actor.email,
          role: actor.role,
        },
      },
    };
  }

  /**
   * Encerra a sessão de suporte e reabre sessão do admin original.
   */
  stopImpersonation(token, { ip = '', userAgent = '' } = {}) {
    if (!token) throw new AuthError('authentication_required', 401);
    const current = this.resolveSession(token, { touch: false });
    if (!current?.impersonation?.active || !current.impersonation.actorAdminId) {
      throw new AuthError('not_impersonating', 400);
    }
    const actorId = current.impersonation.actorAdminId;
    this.logout(token);

    this.syncAdminRoles({ persist: false });
    const actor = this.data.users.find((candidate) => candidate.id === actorId);
    if (!actor || actor.role !== 'admin' || actor.status !== 'active') {
      throw new AuthError('admin_required', 403);
    }
    const timestamp = nowIso();
    actor.lastSeenAt = timestamp;
    const session = this.#createSession(actor, { ip, userAgent, persist: false });
    this.#persist();
    return { user: publicUser(actor), ...session, impersonation: null };
  }

  logout(token) {
    if (!token) return;
    const tokenHash = hashToken(token);
    const before = this.data.sessions.length;
    this.data.sessions = this.data.sessions.filter((session) => session.tokenHash !== tokenHash);
    if (before !== this.data.sessions.length) this.#persist();
  }

  recordUsage(userId, {
    method = 'GET',
    path: requestPath = '',
    statusCode = 200,
    websocket = false,
  } = {}) {
    const user = this.data.users.find((candidate) => candidate.id === userId);
    if (!user) return;

    const current = usageSnapshot(user);
    const normalizedMethod = String(method || 'GET').toUpperCase();
    const normalizedPath = String(requestPath || '').split('?')[0];
    const isAction = !websocket && !['GET', 'HEAD', 'OPTIONS'].includes(normalizedMethod);
    const isRun = normalizedMethod === 'POST' && (
      normalizedPath === '/api/luca-ai/persona-team/run'
      || normalizedPath === '/api/mission/activate'
      || normalizedPath === '/api/agent/run'
      || normalizedPath === '/api/supervisor/start'
    );
    const timestamp = nowIso();

    user.usage = {
      requestCount: current.requestCount + 1,
      actionCount: current.actionCount + (isAction ? 1 : 0),
      runCount: current.runCount + (isRun ? 1 : 0),
      errorCount: current.errorCount + (Number(statusCode) >= 400 ? 1 : 0),
      websocketCount: current.websocketCount + (websocket ? 1 : 0),
      lastRequestAt: timestamp,
    };
    user.lastSeenAt = timestamp;
    this.#persist();
  }

  overview(extra = {}) {
    this.#cleanupSessions();
    this.syncAdminRoles({ persist: false });
    const now = Date.now();
    const activeSince = now - 24 * 60 * 60 * 1000;
    const hourSince = now - 60 * 60 * 1000;
    const usersWithRuns = this.data.users.filter((user) => usageSnapshot(user).runCount > 0).length;
    const usersWithActions = this.data.users.filter((user) => usageSnapshot(user).actionCount > 0).length;
    const totalErrors = this.data.users.reduce((sum, user) => sum + usageSnapshot(user).errorCount, 0);
    return {
      totalUsers: this.data.users.length,
      admins: this.data.users.filter((user) => user.role === 'admin').length,
      activeToday: this.data.users.filter((user) => Date.parse(user.lastSeenAt || 0) >= activeSince).length,
      activeHour: this.data.users.filter((user) => Date.parse(user.lastSeenAt || 0) >= hourSince).length,
      activeSessions: this.data.sessions.filter((session) => Date.parse(session.expiresAt) > now).length,
      usersWithRuns,
      usersWithActions,
      usersWithoutRuns: Math.max(0, this.data.users.length - usersWithRuns),
      totalLogins: this.data.users.reduce((sum, user) => sum + Number(user.loginCount || 0), 0),
      totalRequests: this.data.users.reduce((sum, user) => sum + usageSnapshot(user).requestCount, 0),
      totalActions: this.data.users.reduce((sum, user) => sum + usageSnapshot(user).actionCount, 0),
      totalRuns: this.data.users.reduce((sum, user) => sum + usageSnapshot(user).runCount, 0),
      totalErrors,
      totalWebsockets: this.data.users.reduce((sum, user) => sum + usageSnapshot(user).websocketCount, 0),
      workspaces: Number(extra.workspaces || 0),
      allowlistedAdmins: [...this.adminEmails],
      generatedAt: nowIso(),
    };
  }

  listUsers({ search = '', sort = 'created_desc' } = {}) {
    this.syncAdminRoles({ persist: false });
    const query = String(search).trim().toLowerCase();
    const rows = this.data.users
      .filter((user) => !query || user.email.includes(query) || user.name.toLowerCase().includes(query))
      .map((user) => ({
        ...publicUser(user),
        sessionCount: this.data.sessions.filter((session) => session.userId === user.id).length,
      }));

    const sorter = {
      created_desc: (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
      activity_desc: (a, b) => Date.parse(b.lastSeenAt || 0) - Date.parse(a.lastSeenAt || 0),
      runs_desc: (a, b) => (b.runCount || 0) - (a.runCount || 0) || (b.actionCount || 0) - (a.actionCount || 0),
      requests_desc: (a, b) => (b.requestCount || 0) - (a.requestCount || 0),
      logins_desc: (a, b) => (b.loginCount || 0) - (a.loginCount || 0),
    }[String(sort)] || null;

    return rows.sort(sorter || ((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)));
  }

  report({ limit = 8 } = {}) {
    this.syncAdminRoles({ persist: false });
    const capped = Math.max(1, Math.min(30, Number(limit) || 8));
    const users = this.listUsers({ sort: 'runs_desc' });
    const byRuns = [...users].sort((a, b) => (b.runCount || 0) - (a.runCount || 0)).slice(0, capped);
    const byActions = [...users].sort((a, b) => (b.actionCount || 0) - (a.actionCount || 0)).slice(0, capped);
    const byRequests = [...users].sort((a, b) => (b.requestCount || 0) - (a.requestCount || 0)).slice(0, capped);
    const byActivity = [...users].sort((a, b) => Date.parse(b.lastSeenAt || 0) - Date.parse(a.lastSeenAt || 0)).slice(0, capped);
    const overview = this.overview();
    const activationRate = overview.totalUsers
      ? Number(((overview.usersWithRuns / overview.totalUsers) * 100).toFixed(1))
      : 0;
    const activeRate = overview.totalUsers
      ? Number(((overview.activeToday / overview.totalUsers) * 100).toFixed(1))
      : 0;

    return {
      overview,
      funnel: {
        registered: overview.totalUsers,
        activeToday: overview.activeToday,
        withActions: overview.usersWithActions,
        withRuns: overview.usersWithRuns,
        withoutRuns: overview.usersWithoutRuns,
        activationRate,
        activeRate,
      },
      rankings: {
        byRuns: byRuns.map((user, index) => ({ rank: index + 1, ...user })),
        byActions: byActions.map((user, index) => ({ rank: index + 1, ...user })),
        byRequests: byRequests.map((user, index) => ({ rank: index + 1, ...user })),
        byActivity: byActivity.map((user, index) => ({ rank: index + 1, ...user })),
      },
      generatedAt: nowIso(),
    };
  }
}

export const authInternals = { normalizeEmail, validEmail, hashToken };
