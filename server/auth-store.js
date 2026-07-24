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

  #createSession(user, { ip, userAgent, persist = true }) {
    this.#cleanupSessions();
    const token = crypto.randomBytes(32).toString('base64url');
    const createdAt = nowIso();
    const session = {
      id: crypto.randomUUID(),
      userId: user.id,
      tokenHash: hashToken(token),
      ip: String(ip || '').slice(0, 120),
      userAgent: String(userAgent || '').slice(0, 500),
      createdAt,
      lastSeenAt: createdAt,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    };
    this.data.sessions.push(session);
    const ownSessions = this.data.sessions.filter((item) => item.userId === user.id)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    if (ownSessions.length > 10) {
      const keep = new Set(ownSessions.slice(0, 10).map((item) => item.id));
      this.data.sessions = this.data.sessions.filter((item) => item.userId !== user.id || keep.has(item.id));
    }
    if (persist) this.#persist();
    return { token, expiresAt: session.expiresAt };
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
    return { user: publicUser(user), session: { id: session.id, expiresAt: session.expiresAt } };
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

  overview() {
    this.#cleanupSessions();
    const now = Date.now();
    const activeSince = now - 24 * 60 * 60 * 1000;
    return {
      totalUsers: this.data.users.length,
      admins: this.data.users.filter((user) => user.role === 'admin').length,
      activeToday: this.data.users.filter((user) => Date.parse(user.lastSeenAt || 0) >= activeSince).length,
      activeSessions: this.data.sessions.filter((session) => Date.parse(session.expiresAt) > now).length,
      totalLogins: this.data.users.reduce((sum, user) => sum + Number(user.loginCount || 0), 0),
      totalRequests: this.data.users.reduce((sum, user) => sum + usageSnapshot(user).requestCount, 0),
      totalActions: this.data.users.reduce((sum, user) => sum + usageSnapshot(user).actionCount, 0),
      totalRuns: this.data.users.reduce((sum, user) => sum + usageSnapshot(user).runCount, 0),
      generatedAt: nowIso(),
    };
  }

  listUsers({ search = '' } = {}) {
    const query = String(search).trim().toLowerCase();
    return this.data.users
      .filter((user) => !query || user.email.includes(query) || user.name.toLowerCase().includes(query))
      .map((user) => ({
        ...publicUser(user),
        sessionCount: this.data.sessions.filter((session) => session.userId === user.id).length,
      }))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }
}

export const authInternals = { normalizeEmail, validEmail, hashToken };
