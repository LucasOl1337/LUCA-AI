import express from 'express';
import fs from 'node:fs';
import path from 'node:path';

import {
  API_RATE_LIMIT_MAX,
  API_RATE_LIMIT_WINDOW_MS,
  CLOUDFLARE_ACCESS_EMAILS,
  HOST,
  PORT,
  REQUIRE_CLOUDFLARE_ACCESS,
} from './config.js';
import { buildKamuiYumeAvatarUrl, normalizeYumeAvatarPath } from './persona-cards.js';
import { createPersonaWorkbench } from './persona-workbench.js';
import { get9RouterProfiles } from './router-client.js';

const app = express();
const workbench = createPersonaWorkbench();

app.disable('x-powered-by');
app.set('trust proxy', 'loopback');
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'self'; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob:; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'");
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use(express.json({ limit: '256kb' }));

const rateBuckets = new Map();

function requestIdentity(req) {
  return String(req.headers['cf-connecting-ip'] || req.ip || req.socket.remoteAddress || 'unknown');
}

function isDirectLoopback(req) {
  const address = String(req.socket.remoteAddress || '');
  return !req.headers['cf-ray'] && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address);
}

function requireCloudflareAccess(req, res, next) {
  if (!REQUIRE_CLOUDFLARE_ACCESS || isDirectLoopback(req)) {
    next();
    return;
  }
  const email = String(req.headers['cf-access-authenticated-user-email'] || '').trim().toLowerCase();
  const assertion = String(req.headers['cf-access-jwt-assertion'] || '').trim();
  const emailAllowed = CLOUDFLARE_ACCESS_EMAILS.length === 0 || CLOUDFLARE_ACCESS_EMAILS.includes(email);
  if (!email || !assertion || !emailAllowed) {
    res.status(401).json({ ok: false, error: 'cloudflare_access_required' });
    return;
  }
  next();
}

function rateLimitApi(req, res, next) {
  const now = Date.now();
  const key = requestIdentity(req);
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + API_RATE_LIMIT_WINDOW_MS });
    next();
    return;
  }
  bucket.count += 1;
  if (bucket.count > API_RATE_LIMIT_MAX) {
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
    res.status(429).json({ ok: false, error: 'rate_limit_exceeded' });
    return;
  }
  next();
}

app.use('/api', requireCloudflareAccess, rateLimitApi);

function sendFailure(res, error, source = 'luca-ai', status = 502) {
  res.status(status).json({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    source,
  });
}

app.get('/api/health', async (_req, res) => {
  res.json(await workbench.health());
});

app.get('/api/models', (_req, res) => {
  res.json({ ok: true, provider: '9router', profiles: get9RouterProfiles() });
});

app.get('/api/events', (req, res) => {
  res.json({
    ok: true,
    events: workbench.listEvents({
      limit: req.query.limit,
      type: req.query.type,
      traceId: req.query.traceId,
    }),
  });
});

app.get('/api/personas/avatar', async (req, res) => {
  const avatarPath = normalizeYumeAvatarPath(req.query.src);
  if (!avatarPath) {
    res.status(400).json({ ok: false, error: 'invalid_avatar_src' });
    return;
  }
  try {
    const upstream = await fetch(buildKamuiYumeAvatarUrl(avatarPath), {
      headers: {
        Accept: 'image/*',
        'X-Kamui-Caller': 'luca',
        'User-Agent': 'luca-ai-service (persona-avatar-proxy)',
      },
    });
    const contentType = upstream.headers.get('content-type') || '';
    if (!upstream.ok) {
      res.status(upstream.status).json({ ok: false, error: `avatar_upstream_${upstream.status}` });
      return;
    }
    if (!contentType.toLowerCase().startsWith('image/')) {
      res.status(502).json({ ok: false, error: 'avatar_upstream_not_image' });
      return;
    }
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    sendFailure(res, error, 'kamui');
  }
});

app.get('/api/personas/available', async (_req, res) => {
  try {
    res.json({ ok: true, personas: await workbench.listPersonas() });
  } catch (error) {
    sendFailure(res, error, 'kamui');
  }
});

app.post('/api/agent/persona/add', async (req, res) => {
  const slug = String(req.body?.slug || '').trim();
  if (!slug) {
    res.status(400).json({ ok: false, error: 'slug_required' });
    return;
  }
  try {
    res.json({ ok: true, agent: await workbench.importPersona(slug) });
  } catch (error) {
    sendFailure(res, error, 'kamui');
  }
});

app.post('/api/agent/persona/remove', (req, res) => {
  const slug = String(req.body?.slug || '').trim();
  if (!slug) {
    res.status(400).json({ ok: false, error: 'slug_required' });
    return;
  }
  res.json({ ok: true, removed: workbench.removePersona(slug) });
});

app.post('/api/luca-ai/persona-team/run', async (req, res) => {
  try {
    const result = await workbench.run(req.body);
    res.status(result.ok ? 200 : 400).json(result);
  } catch (error) {
    sendFailure(res, error, 'luca-ai');
  }
});

app.use('/api', (_req, res) => {
  res.status(404).json({ ok: false, error: 'route_not_found' });
});

const distPath = path.resolve(process.cwd(), 'dist');
const indexPath = path.join(distPath, 'index.html');

if (fs.existsSync(indexPath)) {
  app.use(express.static(distPath));
  app.get('*splat', (_req, res) => res.sendFile(indexPath));
} else {
  app.get('/', (_req, res) => {
    res.status(503).type('text/plain').send('Build ausente. Rode npm run build.');
  });
}

app.listen(PORT, HOST, () => {
  console.log(`[luca-ai] http://${HOST}:${PORT}`);
});
