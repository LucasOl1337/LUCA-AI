import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const page = fs.readFileSync(path.join(root, 'src/pages/AdminPage.tsx'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/index.css'), 'utf8');
const auth = fs.readFileSync(path.join(root, 'server/auth.js'), 'utf8');
const store = fs.readFileSync(path.join(root, 'server/auth-store.js'), 'utf8');

test('ADMIN_CONSOLE_V1 page loads report funnel and rankings', () => {
  assert.match(page, /\/api\/admin\/report/);
  assert.match(page, /Console de operações/);
  assert.match(page, /data-admin-product/);
  assert.match(page, /data-admin-rankings/);
  assert.match(page, /Funil de ativação/);
  assert.match(page, /Ranking de uso/);
});

test('ADMIN_CONSOLE_V1 CSS ships product funnel and rank cards', () => {
  assert.match(css, /\.admin-funnel/);
  assert.match(css, /\.admin-rank-grid/);
  assert.match(css, /\.admin-rank-card/);
});

test('ADMIN_CONSOLE_V1 backend exposes report and allowlist sync', () => {
  assert.match(auth, /\/api\/admin\/report/);
  assert.match(store, /syncAdminRoles/);
  assert.match(store, /ensureAdminEmails/);
  assert.match(store, /report\(/);
});
