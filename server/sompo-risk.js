import { normalizeSompoTelemetry } from '../shared/sompo-telemetry.js';
import { assessSompoRisk } from '../shared/sompo-risk.js';

export function registerSompoRiskRoutes(app, history, source) {
  app.get('/api/sompo/risk', (req, res) => {
    res.json({ ok: true, assessments: history.listAssessments(req.auth.user.id, String(req.query.trator || '001'), req.query.fonte === 'simulacao' ? 'simulation' : 'firebase') });
  });
  app.post('/api/sompo/risk', async (req, res) => {
    try {
      const { sourceKind, raw, context } = req.body || {};
      if (!['simulation', 'firebase'].includes(sourceKind) || !context || typeof context !== 'object' || Array.isArray(context)) return res.status(400).json({ error: 'sompo_risk_invalid_input' });
      let snapshot;
      if (sourceKind === 'firebase') {
        // The browser cannot submit physical readings or freshness claims.
        snapshot = await source.read();
      } else {
        snapshot = normalizeSompoTelemetry(raw);
        snapshot.source = { kind: 'simulation', provider: 'Simulação declarada pelo navegador', path: 'simulation://sompo' };
        snapshot.freshness = 'fresh';
        snapshot.connection.state = 'live';
      }
      const declared = { operation: context.operation, region: context.region, incidents: context.incidents };
      const assessment = assessSompoRisk(snapshot, declared);
      if (assessment.score === null) return res.status(422).json({ error: 'sompo_risk_incomplete', message: `Avaliação indisponível: ${assessment.missing.join(', ')}`, assessment });
      const evidence = history.saveAssessment(req.auth.user.id, { snapshot, assessment, coverage: 'pending_no_policy', contextOrigin: 'user_declared' });
      res.status(201).json({ ok: true, evidence });
    } catch (error) {
      const invalid = String(error.message).startsWith('sompo_telemetry_invalid') || String(error.message).startsWith('sompo_telemetry_empty');
      res.status(invalid ? 400 : 503).json({ error: 'sompo_risk_unavailable', message: 'Não foi possível registrar a avaliação. Confira a telemetria e tente novamente.' });
    }
  });
}
