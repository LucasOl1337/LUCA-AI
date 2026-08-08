import { createHash, timingSafeEqual } from 'node:crypto';

import { normalizePersonaTeamRunInput } from '../persona-team.js';
import {
  normalizeContextBundle,
  renderDeliberationMission,
} from './context-bundle.js';
import { buildDecisionPackage } from './decision-package.js';

const MACHINE_OWNER_ID = 'machine:default';
const MAX_CONTEXT_RECORDS = 400;

function tokenDigest(value) {
  return createHash('sha256').update(String(value || '')).digest();
}

function safeTokenMatch(received, configured) {
  return timingSafeEqual(tokenDigest(received), tokenDigest(configured));
}

function sendInputError(res, error) {
  const code = String(error?.code || error?.error || error?.message || 'deliberation_invalid');
  res.status(Number(error?.status) || 400).json({
    ok: false,
    error: code,
    ...(Array.isArray(error?.missingRoles) ? { missingRoles: error.missingRoles } : {}),
  });
}

export function createDeliberations({
  engine,
  requireUser,
  jobStore,
  ensureWorkspace,
  runWithWorkspaceUser,
  machineToken = '',
} = {}) {
  if (typeof engine !== 'function') throw new Error('deliberation_engine_required');
  if (typeof requireUser !== 'function') throw new Error('deliberation_user_auth_required');
  if (!jobStore?.start || !jobStore?.get) throw new Error('deliberation_job_store_required');
  if (typeof ensureWorkspace !== 'function' || typeof runWithWorkspaceUser !== 'function') {
    throw new Error('deliberation_workspace_required');
  }

  const configuredMachineToken = String(machineToken || '');
  const machineAuthEnabled = configuredMachineToken.length >= 32;
  const contexts = new Map();

  function remember(runId, value) {
    contexts.set(runId, value);
    while (contexts.size > MAX_CONTEXT_RECORDS) contexts.delete(contexts.keys().next().value);
  }

  function authenticate(req, res, next) {
    const authorization = String(req.headers.authorization || '').trim();
    if (authorization) {
      const match = authorization.match(/^Bearer\s+(.+)$/i);
      if (!match || !machineAuthEnabled || !safeTokenMatch(match[1], configuredMachineToken)) {
        res.status(401).json({ ok: false, error: 'machine_auth_required' });
        return;
      }
      req.deliberationOwnerId = MACHINE_OWNER_ID;
      next();
      return;
    }

    requireUser(req, res, () => {
      const ownerId = String(req.auth?.user?.id || '').trim();
      if (!ownerId) {
        res.status(401).json({ ok: false, error: 'authentication_required' });
        return;
      }
      req.deliberationOwnerId = ownerId;
      next();
    });
  }

  function registerRoutes(app) {
    app.post('/api/deliberations', authenticate, (req, res) => {
      let bundle;
      let input;
      try {
        bundle = normalizeContextBundle(req.body);
        input = normalizePersonaTeamRunInput({
          mission: renderDeliberationMission(bundle),
          mode: bundle.team.mode,
          slugs: bundle.team.slugs,
          judgeSlug: bundle.team.judgeSlug,
          workflow: bundle.team.workflow,
          modelOverrides: bundle.team.modelOverrides,
          traceId: bundle.traceId,
        }, { maxMissionChars: 120_000 });
        if (!input.ok) throw input;
      } catch (error) {
        sendInputError(res, error);
        return;
      }

      const ownerId = req.deliberationOwnerId;
      try {
        ensureWorkspace(ownerId);
        const job = jobStore.start({
          ownerId,
          traceId: input.traceId,
          execute: () => runWithWorkspaceUser(
            ownerId,
            () => engine({ ...input, traceId: null }, { toolsEnabled: false }),
          ),
        });
        remember(job.runId, { ownerId, objective: bundle.objective });
        res.status(202).json({
          ok: true,
          deliberationId: job.runId,
          traceId: job.traceId,
          status: job.status,
          startedAt: job.startedAt,
        });
      } catch (error) {
        res.status(500).json({ ok: false, error: error?.message || 'deliberation_start_failed' });
      }
    });

    app.get('/api/deliberations/:deliberationId', authenticate, (req, res) => {
      const ownerId = req.deliberationOwnerId;
      const job = jobStore.get(req.params.deliberationId, ownerId);
      if (!job) {
        res.status(404).json({ ok: false, error: 'deliberation_not_found' });
        return;
      }
      const context = contexts.get(job.runId);
      res.json(buildDecisionPackage(job, {
        objective: context?.ownerId === ownerId ? context.objective : '',
      }));
    });
  }

  return { registerRoutes };
}
