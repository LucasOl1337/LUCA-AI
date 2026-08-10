import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import express from 'express';

const serverIndex = readFileSync(new URL('./index.js', import.meta.url), 'utf8');

test('PUT /team-templates/:kind/order is registered before /:kind/:id', () => {
  const orderIdx = serverIndex.indexOf("app.put('/api/luca-ai/team-templates/:kind/order'");
  const idIdx = serverIndex.indexOf("app.put('/api/luca-ai/team-templates/:kind/:id'");
  assert.ok(orderIdx >= 0, 'rota de reorder deve existir');
  assert.ok(idIdx >= 0, 'rota de update por id deve existir');
  assert.ok(
    orderIdx < idIdx,
    'Express casa a primeira rota: se /:id vier antes, reorder vira update com id="order" e responde template_not_found',
  );
});

test('Express com order antes de :id reordena; ordem invertida vira template_not_found', async (context) => {
  async function probe(register) {
    const app = express();
    app.use(express.json());
    register(app);
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    context.after(() => server.close());
    const port = server.address().port;
    const res = await fetch(`http://127.0.0.1:${port}/api/luca-ai/team-templates/team/order`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids: ['equipe-a', 'equipe-b'] }),
    });
    return { status: res.status, body: await res.json() };
  }

  const broken = await probe((app) => {
    app.put('/api/luca-ai/team-templates/:kind/:id', (req, res) => {
      res.status(404).json({
        ok: false,
        error: 'template_not_found',
        message: 'template_not_found',
        id: req.params.id,
      });
    });
    app.put('/api/luca-ai/team-templates/:kind/order', (req, res) => {
      res.json({ ok: true, ids: req.body?.ids });
    });
  });
  assert.equal(broken.status, 404);
  assert.equal(broken.body.error, 'template_not_found');
  assert.equal(broken.body.id, 'order');

  const fixed = await probe((app) => {
    app.put('/api/luca-ai/team-templates/:kind/order', (req, res) => {
      res.json({ ok: true, ids: req.body?.ids });
    });
    app.put('/api/luca-ai/team-templates/:kind/:id', (req, res) => {
      res.status(404).json({ ok: false, error: 'template_not_found', id: req.params.id });
    });
  });
  assert.equal(fixed.status, 200);
  assert.equal(fixed.body.ok, true);
  assert.deepEqual(fixed.body.ids, ['equipe-a', 'equipe-b']);
});
