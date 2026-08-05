#!/usr/bin/env node
// STAGE_RELEASE_V1 — commercial packaging: deploy guard + source/dist/state tarballs for install-vm
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { assertProductionDeployAllowed } from './assert-production-deploy.mjs';

const MARKER = 'STAGE_RELEASE_V1';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SOURCE_INCLUDE = [
  'package.json',
  'package-lock.json',
  'server',
  'shared',
  'deploy',
  'public',
  'index.html',
  'vite.config.ts',
  'tsconfig.json',
  'tsconfig.node.json',
  'postcss.config.js',
  'tailwind.config.js',
  'src',
  'AGENTS.md',
  'README.md',
  'INDEX.md',
  'docs',
  'heartbeat_monitor.py',
];

const SOURCE_EXCLUDE = [
  'node_modules',
  'dist',
  '.git',
  '.luca',
  '_afk-marketing',
  'release-assets',
  'promo',
  'DocsDev',
  'site',
  'PraisonAI',
  'praisonai-tests',
  'grokimaginevideos',
  'tmp-shots',
  'brand',
  '.scratch',
];

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    dryRun: false,
    skipBuild: false,
    outDir: '',
    commit: '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--skip-build') out.skipBuild = true;
    else if (arg === '--out' || arg === '--out-dir') {
      out.outDir = String(argv[++i] || '').trim();
    } else if (arg === '--commit') {
      out.commit = String(argv[++i] || '').trim();
    } else if (arg.startsWith('--out=')) {
      out.outDir = arg.slice('--out='.length).trim();
    } else if (arg.startsWith('--commit=')) {
      out.commit = arg.slice('--commit='.length).trim();
    }
  }
  if (String(process.env.DEPLOY_DRY_RUN || '').trim() === '1') out.dryRun = true;
  return out;
}

function resolveCommit(forced = '') {
  if (forced) return forced;
  const envCommit = String(process.env.DEPLOY_COMMIT || '').trim();
  if (envCommit) return envCommit;
  const r = spawnSync('git', ['rev-parse', '--short=12', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  return `local-${Date.now().toString(36)}`;
}

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: options.stdio || 'inherit',
    env: { ...process.env, ...(options.env || {}) },
    shell: false,
  });
  if (result.status !== 0) {
    const err = new Error(`${MARKER}: command failed: ${cmd} ${args.join(' ')}`);
    err.code = 'STAGE_RELEASE_CMD';
    err.status = result.status;
    throw err;
  }
  return result;
}

function ensureDist(skipBuild) {
  const indexHtml = path.join(root, 'dist', 'index.html');
  if (fs.existsSync(indexHtml)) return { built: false, indexHtml };
  if (skipBuild) {
    const err = new Error(`${MARKER}: dist/index.html ausente e --skip-build ativo`);
    err.code = 'STAGE_RELEASE_DIST';
    throw err;
  }
  run(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'], {
    stdio: 'inherit',
  });
  if (!fs.existsSync(indexHtml)) {
    const err = new Error(`${MARKER}: build não produziu dist/index.html`);
    err.code = 'STAGE_RELEASE_DIST';
    throw err;
  }
  return { built: true, indexHtml };
}

function tarCreate(archivePath, cwd, paths, extraArgs = []) {
  // --force-local: Windows drive letters (C:) look like remote hosts to GNU tar
  const args = ['--force-local', '-cf', archivePath, ...extraArgs, ...paths];
  const result = spawnSync('tar', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    const err = new Error(
      `${MARKER}: tar failed (${archivePath}): ${result.stderr || result.stdout || result.status}`,
    );
    err.code = 'STAGE_RELEASE_TAR';
    throw err;
  }
}

function stageSourceTar(outFile) {
  const present = SOURCE_INCLUDE.filter((rel) => fs.existsSync(path.join(root, rel)));
  if (!present.includes('package.json') || !present.includes('server')) {
    const err = new Error(`${MARKER}: source incompleto (package.json/server)`);
    err.code = 'STAGE_RELEASE_SOURCE';
    throw err;
  }
  const excludeArgs = SOURCE_EXCLUDE.flatMap((name) => ['--exclude', name]);
  // Also exclude nested node_modules/dist if present under included trees
  excludeArgs.push('--exclude', 'node_modules', '--exclude', 'dist', '--exclude', '.git');
  tarCreate(outFile, root, present, excludeArgs);
}

function stageDistTar(outFile) {
  const distDir = path.join(root, 'dist');
  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    const err = new Error(`${MARKER}: dist/index.html ausente para dist.tar`);
    err.code = 'STAGE_RELEASE_DIST';
    throw err;
  }
  // install-vm extracts into release root; unit requires dist/index.html
  tarCreate(outFile, root, ['dist']);
}

function stageStateTar(outFile) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-state-'));
  try {
    const top = path.join(tmp, 'state');
    fs.mkdirSync(top, { recursive: true });
    // install-vm --strip-components=1 → /var/lib/luca-ai gets these placeholders
    fs.writeFileSync(path.join(top, '.stage-release'), `${MARKER}\n`, 'utf8');
    tarCreate(outFile, tmp, ['state']);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

export function stageRelease(options = {}) {
  const dryRun = Boolean(options.dryRun);
  const skipBuild = Boolean(options.skipBuild);
  const commit = resolveCommit(options.commit || '');
  const outDir = path.resolve(
    options.outDir || process.env.STAGE_OUT_DIR || path.join(os.tmpdir(), `luca-deploy-${commit}`),
  );

  const guardEnv = dryRun
    ? { ...process.env, DEPLOY_DRY_RUN: '1' }
    : { ...process.env };
  const guard = assertProductionDeployAllowed(guardEnv, options.guardOptions || {});

  const plan = {
    ok: true,
    marker: MARKER,
    commit,
    outDir,
    dryRun,
    skipBuild,
    branch: guard.branch,
    files: {
      source: path.join(outDir, 'source.tar'),
      dist: path.join(outDir, 'dist.tar'),
      state: path.join(outDir, 'state.tar'),
    },
  };

  if (dryRun) {
    return { ...plan, built: false, wrote: false };
  }

  fs.mkdirSync(outDir, { recursive: true });
  const distInfo = ensureDist(skipBuild);
  stageSourceTar(plan.files.source);
  stageDistTar(plan.files.dist);
  stageStateTar(plan.files.state);

  for (const file of Object.values(plan.files)) {
    const st = fs.statSync(file);
    if (!st.isFile() || st.size < 32) {
      const err = new Error(`${MARKER}: tarball inválido ${file}`);
      err.code = 'STAGE_RELEASE_TAR';
      throw err;
    }
  }

  return {
    ...plan,
    built: distInfo.built,
    wrote: true,
    sizes: Object.fromEntries(
      Object.entries(plan.files).map(([k, p]) => [k, fs.statSync(p).size]),
    ),
  };
}

const isCli = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCli) {
  try {
    const args = parseArgs();
    const result = stageRelease(args);
    if (result.dryRun) {
      console.log(
        `${MARKER}: dry-run ok branch=${result.branch || 'unknown'} commit=${result.commit} out=${result.outDir}`,
      );
    } else {
      console.log(
        `${MARKER}: ok branch=${result.branch || 'unknown'} commit=${result.commit} out=${result.outDir} built=${result.built ? '1' : '0'}`,
      );
      console.log(`SOURCE_TAR=${result.files.source}`);
      console.log(`DIST_TAR=${result.files.dist}`);
      console.log(`STATE_TAR=${result.files.state}`);
      if (result.sizes) {
        console.log(
          `SIZES source=${result.sizes.source} dist=${result.sizes.dist} state=${result.sizes.state}`,
        );
      }
    }
    process.exit(0);
  } catch (error) {
    console.error(error?.message || error);
    process.exit(1);
  }
}
