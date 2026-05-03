import path from 'node:path';

const rootDir = path.resolve(process.cwd());

export const config = {
  port: Number(process.env.LUCA_PORT ?? 4141),
  workspace: process.env.LUCA_WORKSPACE ?? rootDir,
  lucaDir: path.join(rootDir, '.luca'),
  heartbeatMs: Number(process.env.LUCA_HEARTBEAT_MS ?? 2000),
  codexBin: process.env.LUCA_CODEX_BIN ?? 'codex.cmd',
  codexProfile: process.env.LUCA_CODEX_PROFILE ?? '',
  codexExtraArgs: process.env.LUCA_CODEX_EXTRA_ARGS ?? '',
  codexProvider: process.env.LUCA_CODEX_PROVIDER ?? '9router',
  supervisorModel: process.env.LUCA_SUPERVISOR_MODEL ?? 'cx/gpt-5.5',
  executorModel: process.env.LUCA_EXECUTOR_MODEL ?? 'cx/gpt-5.5',
  codexTimeoutMs: Number(process.env.LUCA_CODEX_TIMEOUT_MS ?? 180000),
};
