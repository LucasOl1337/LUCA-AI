import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

function summarizeCommand(result = {}) {
  const text = result.stdout || result.stderr || result.error || '';
  return String(text).split(/\r?\n/).find(Boolean) || null;
}

function spawnCommand(command, args = [], { cwd = process.cwd(), timeoutMs = 2_500 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      resolve({ ok: false, error: `timeout depois de ${timeoutMs}ms`, stdout: stdout.trim(), stderr: stderr.trim() });
    }, timeoutMs);

    child.stdout?.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, error: error.message, stdout: stdout.trim(), stderr: stderr.trim() });
    });
    child.on('exit', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: code === 0, code, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

async function validateWritableState(stateDir) {
  const probeDir = path.join(stateDir, 'preflight-runtime-check');
  const probeFile = path.join(probeDir, 'last-check.json');
  const payload = {
    ok: true,
    checkedAt: new Date().toISOString(),
  };
  await fs.mkdir(probeDir, { recursive: true });
  await fs.writeFile(probeFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  const saved = JSON.parse(await fs.readFile(probeFile, 'utf8'));
  return {
    ok: saved.ok === true,
    detail: path.relative(process.cwd(), probeFile) || probeFile,
  };
}

function buildCheck(id, label, ok, detail, source = 'videogen-preflight-pattern') {
  return {
    id,
    label,
    ok,
    detail,
    source,
  };
}

export async function runRuntimeReadinessChecks({
  rootDir = process.cwd(),
  stateDir = path.join(rootDir, '.luca'),
  heartbeatScriptPath = path.join(rootDir, 'heartbeat_monitor.py'),
  probeCommand = spawnCommand,
} = {}) {
  const nodeCheck = await probeCommand(process.execPath, ['--version'], { cwd: rootDir });
  const pythonCommand = process.platform === 'win32' ? 'py' : 'python3';
  const pythonArgs = process.platform === 'win32' ? ['-3', '--version'] : ['--version'];
  const pythonCheck = await probeCommand(pythonCommand, pythonArgs, { cwd: rootDir });

  let writableState;
  try {
    writableState = await validateWritableState(stateDir);
  } catch (error) {
    writableState = {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  let heartbeatScriptOk = false;
  try {
    await fs.access(heartbeatScriptPath);
    heartbeatScriptOk = true;
  } catch {
    heartbeatScriptOk = false;
  }

  const checks = [
    buildCheck('runtime:node', 'Node runtime', nodeCheck.ok === true, summarizeCommand(nodeCheck) || 'node indisponivel'),
    buildCheck('runtime:python', 'Python runtime', pythonCheck.ok === true, summarizeCommand(pythonCheck) || 'python indisponivel'),
    buildCheck('runtime:state-write', 'Writable runtime state', writableState.ok === true, writableState.detail || 'nao foi possivel gravar em .luca'),
    buildCheck('runtime:heartbeat-script', 'Heartbeat script', heartbeatScriptOk, heartbeatScriptOk ? path.relative(rootDir, heartbeatScriptPath) || heartbeatScriptPath : 'heartbeat_monitor.py ausente'),
  ];

  return {
    ok: checks.every((check) => check.ok),
    checks,
    source: ['videogen-preflight-pattern'],
  };
}
