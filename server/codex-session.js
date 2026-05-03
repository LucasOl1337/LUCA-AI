import { spawn } from 'node:child_process';

export function runCodexTask({ codexBin, codexProfile, codexExtraArgs, codexProvider, workspace, model, prompt, timeoutMs, onLine }) {
  return new Promise((resolve) => {
    const codexArgs = [
      'exec',
      '-c',
      `model_provider="${codexProvider}"`,
      '--model',
      model,
      '--cd',
      workspace,
      '--skip-git-repo-check',
      '--json',
    ];
    if (codexProfile) codexArgs.splice(1, 0, '--profile', codexProfile);
    if (codexExtraArgs) codexArgs.splice(1, 0, ...splitArgs(codexExtraArgs));
    const command = process.platform === 'win32' ? 'cmd.exe' : codexBin;
    const args = process.platform === 'win32'
      ? ['/d', '/s', '/c', codexBin, ...codexArgs]
      : codexArgs;
    const child = spawn(command, args, {
      cwd: workspace,
      windowsHide: true,
      env: process.env,
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      onLine('[timeout] codex task exceeded timeout');
      resolve({ ok: false, code: null, stdout, stderr: `${stderr}\ntimeout` });
    }, timeoutMs);

    function consume(chunk, target) {
      const text = chunk.toString();
      if (target === 'stdout') stdout += text;
      if (target === 'stderr') stderr += text;
      for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) continue;
        const formatted = formatCodexLine(line, target);
        if (formatted) onLine(formatted);
      }
    }

    child.stdout.on('data', (chunk) => consume(chunk, 'stdout'));
    child.stderr.on('data', (chunk) => consume(chunk, 'stderr'));
    child.stdin.write(prompt);
    child.stdin.end();
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      onLine(`[error] ${error.message}`);
      resolve({ ok: false, code: null, stdout, stderr: error.message });
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: code === 0, code, stdout, stderr });
    });
  });
}

function splitArgs(value) {
  return value.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((arg) => arg.replace(/^"|"$/g, '')) ?? [];
}

function formatCodexLine(line, target) {
  if (target === 'stderr') {
    if (line.includes('Reading prompt from stdin')) return null;
    if (line.includes('UnauthorizedAccess') || line.includes('profile.ps1')) return null;
    if (line.includes('Execution_Policies') || line.includes('about_Execution_Policies')) return null;
    if (line.includes('CategoryInfo') || line.includes('FullyQualifiedErrorId')) return null;
    if (line.includes('ERROR') || line.includes('error:') || line.includes('failed')) {
      return `[codex:error] ${compactLine(line)}`;
    }
    return null;
  }
  try {
    const event = JSON.parse(line);
    if (event.type) return formatCodexEvent(event);
  } catch {
    // Codex can emit plain text depending on config/version.
  }
  return `[codex] ${compactLine(line)}`;
}

function formatCodexEvent(event) {
  if (event.type === 'thread.started') return '[codex] session started';
  if (event.type === 'turn.started') return '[codex] thinking';
  if (event.type === 'turn.completed') return '[codex] turn completed';
  if (event.type === 'turn.failed') return `[codex:error] ${compactLine(event.error?.message ?? 'turn failed')}`;
  if (event.type === 'error') return `[codex:error] ${compactLine(event.message ?? 'error')}`;
  if (event.type === 'item.started' && event.item?.type === 'command_execution') return '[tool] command started';
  if (event.type === 'item.completed') {
    if (event.item?.type === 'agent_message') return `[agent] ${compactLine(event.item.text ?? '')}`;
    if (event.item?.type === 'command_execution') return '[tool] command completed';
    if (event.item?.type === 'error') return `[codex:error] ${compactLine(event.item.message ?? 'error')}`;
  }
  return null;
}

function compactLine(value) {
  return String(value).replace(/\s+/g, ' ').slice(0, 220);
}
