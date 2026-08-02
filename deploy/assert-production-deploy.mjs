#!/usr/bin/env node
// DEPLOY_MAIN_ONLY_V1 — commercial packaging/wrangler must not run off main unless ALLOW_NON_MAIN_DEPLOY=1
import { execSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const MARKER = 'DEPLOY_MAIN_ONLY_V1';

export function resolveGitBranch(env = process.env, exec = execSync) {
  const forced = String(env.DEPLOY_GIT_BRANCH || '').trim();
  if (forced) return forced;
  try {
    return exec('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

export function assertProductionDeployAllowed(env = process.env, options = {}) {
  const branch = String(options.branch ?? resolveGitBranch(env, options.exec)).trim();
  const allow = String(env.ALLOW_NON_MAIN_DEPLOY || '').trim() === '1';
  const dryRun = String(env.DEPLOY_DRY_RUN || '').trim() === '1';
  if (dryRun) {
    return { ok: true, branch, allow, dryRun: true, marker: MARKER };
  }
  if (branch === 'main' || allow) {
    return { ok: true, branch, allow, dryRun: false, marker: MARKER };
  }
  const err = new Error(
    `${MARKER}: deploy comercial bloqueado fora de main (branch=${branch || 'unknown'}). Use main ou ALLOW_NON_MAIN_DEPLOY=1.`,
  );
  err.code = 'DEPLOY_MAIN_ONLY';
  err.branch = branch;
  throw err;
}

const isCli = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCli) {
  try {
    const result = assertProductionDeployAllowed();
    console.log(`${MARKER}: ok branch=${result.branch || 'unknown'} dryRun=${result.dryRun ? '1' : '0'}`);
    process.exit(0);
  } catch (error) {
    console.error(error?.message || error);
    process.exit(1);
  }
}
