import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { commands } from './catalog.js';
import { CliError, createInput, emit, globalOptions, numberOption, objectBody, parseArgs, redact } from './io.js';
import { loadConfig, runProfile } from './config.js';
import { apiUrl, createClient, waitForJob } from './client.js';

export function help(prefix = '') {
  const matches = commands.filter(c => !prefix || c.name === prefix || c.name.startsWith(`${prefix} `));
  if (!matches.length) throw new CliError('unknown_command', `Comando desconhecido: ${prefix}. Use luca --help.`);
  const lines = ['LUCA-AI CLI · Node >=22 · ajuda e descoberta funcionam offline', '', 'Uso: luca <comando> [IDs] [opções]', 'Descoberta JSON: luca commands [prefixo]', 'Dados: --data @arquivo.json | --data - | --data \'{"campo":"valor"}\'', 'Saída: JSON em stdout; erros em stderr. Arquivos: --output caminho (ou -).', ''];
  for (const c of matches) {
    lines.push(`  ${c.name}${c.args.map(arg => ` <${arg}>`).join('')}  ${c.description}`);
    if (matches.length === 1) {
      lines.push(`    ${c.method ? `${c.method} ${c.path} · autenticação: ${c.auth}` : 'Local, sem conexão ao servidor.'}`);
      for (const f of c.fields) lines.push(`    --${f.name} <${f.type}>${f.required ? ' (obrigatório, ou no --data)' : ''}${f.description ? `: ${f.description}` : ''}`);
      if (c.example) lines.push(`    Exemplo: luca ${c.example}`);
    }
  }
  lines.push('', 'Opções comuns:');
  for (const [flag, text] of Object.entries(globalOptions)) lines.push(`  --${flag}  ${text}`);
  lines.push('', 'Saídas: 0 sucesso; 1 API/servidor; 2 uso/entrada; 3 autenticação; 4 rede/timeout; 5 job falhou; 130 interrupção.', 'Sessão: auth login --email EMAIL --password-stdin; senha também por LUCA_PASSWORD.', 'Token LUCA_MACHINE_TOKEN vale só para deliberations. Demais comandos usam sessão.', 'Câmera, áudio, MediaPipe e renderização 3D exigem navegador; comandos locais exercitam a lógica.', 'Documentação: docs/cli.md');
  return `${lines.join('\n')}\n`;
}

async function convertFields(command, options, input, data) {
  const values = { ...command.defaults, ...(data || {}) };
  for (const f of command.fields) {
    const raw = options[f.name];
    if (raw !== undefined) {
      let value = raw;
      if (f.type === 'json') value = await input.json(raw);
      if (f.type === 'number') value = numberOption(raw, f.name, undefined, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
      if (f.type === 'list') value = raw.split(',').map(item => item.trim()).filter(Boolean);
      values[f.key] = value;
    }
    if (f.required && (values[f.key] === undefined || values[f.key] === null || values[f.key] === '')) throw new CliError('missing_field', `Falta --${f.name} (ou ${f.key} no --data). Consulte luca ${command.name} --help.`);
  }
  return values;
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const { positionals, options } = parseArgs(argv, commands);
  if (options.version) {
    const pkg = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
    return emit({ name: 'luca', version: pkg.version, node: process.versions.node });
  }
  if (!positionals.length || options.help || positionals[0] === 'help') {
    const prefix = positionals[0] === 'help' ? positionals.slice(1).join(' ') : positionals.join(' ');
    const exact = commands.filter(c => prefix === c.name || prefix.startsWith(`${c.name} `)).sort((a, b) => b.name.length - a.name.length)[0];
    process.stdout.write(help(exact?.name || prefix));
    return;
  }
  if (positionals[0] === 'commands') {
    const prefix = positionals.slice(1).join(' ');
    const selected = commands.filter(c => !prefix || c.name === prefix || c.name.startsWith(`${prefix} `));
    if (!selected.length) throw new CliError('unknown_command', `Nenhum comando para ${prefix}.`);
    for (const key of Object.keys(options)) if (!['json', 'pretty', 'output'].includes(key)) throw new CliError('unsupported_option', `commands não aceita --${key}.`);
    return emit({ schema: 'luca.cli.commands.v1', commands: selected, globalOptions }, options);
  }
  const command = commands.filter(c => c.name.split(' ').every((word, i) => positionals[i] === word)).sort((a, b) => b.name.length - a.name.length)[0];
  if (!command) throw new CliError('unknown_command', `Comando desconhecido: ${positionals.join(' ')}. Use luca --help.`);
  const args = positionals.slice(command.name.split(' ').length);
  if (args.length !== command.args.length) throw new CliError('invalid_arguments', `Uso: luca ${command.name} ${command.args.map(arg => `<${arg}>`).join(' ')}. Recebidos ${args.length} argumentos.`);
  const allowed = new Set([...Object.keys(globalOptions), ...command.fields.map(f => f.name)]);
  for (const key of Object.keys(options)) if (!allowed.has(key)) throw new CliError('unknown_option', `--${key} não existe em ${command.name}.`);
  if (options['password-stdin'] && !command.credentials) throw new CliError('unsupported_option', '--password-stdin só vale para auth login/register.');
  if (options.wait && !command.job) throw new CliError('unsupported_option', '--wait só vale para jobs team/deliberations.');
  if (options.watch && (command.method !== 'GET' || command.binary || command.download || options.wait || options.output || options.pretty)) throw new CliError('unsupported_option', '--watch requer GET JSON, sem --wait, --pretty ou --output.');
  if (options.count !== undefined && !options.watch) throw new CliError('unsupported_option', '--count requer --watch.');
  const count = numberOption(options.count, 'count', 10, 1, 10000);
  if (!Number.isInteger(count)) throw new CliError('invalid_number', '--count deve ser inteiro.');
  const interval = numberOption(options.interval, 'interval', 1000, 100, 60000);
  numberOption(options['wait-timeout'], 'wait-timeout', 1800000);
  numberOption(options.timeout, 'timeout', command.timeout || 30000);
  if (command.binary && !options.output && !options['dry-run']) throw new CliError('output_required', 'Este comando baixa um arquivo. Use --output caminho ou --output -.');
  if (options.data && (command.method === 'GET' || command.upload || command.csvImport || command.name.startsWith('profile '))) throw new CliError('unsupported_option', '--data não se aplica a este comando.');
  const input = createInput();
  const data = options.data === undefined ? undefined : objectBody(await input.json(options.data));
  const fields = await convertFields(command, options, input, data);
  if (command.name.startsWith('profile ')) {
    if (options['dry-run']) return emit({ dryRun: true, command: command.name, args, fields: redact(fields) }, options);
    const config = await loadConfig({ ...options, _profileCommand: true }, env);
    return emit(await runProfile(command.name, args, options, config), options);
  }
  if (!command.method && !command.raw) {
    if (options.query) throw new CliError('unsupported_option', '--query só vale para comandos HTTP.');
    if (options['dry-run']) return emit({ dryRun: true, command: command.name, args, fields: redact(fields) }, options);
    const { runLocal } = await import('./local.js');
    return emit(await runLocal(command.name, fields, data), options);
  }
  let method = command.raw ? args[0].toUpperCase() : command.method;
  if (!['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'].includes(method)) throw new CliError('invalid_method', 'Método HTTP inválido.');
  if (['GET', 'HEAD'].includes(method) && data !== undefined) throw new CliError('unsupported_option', 'GET/HEAD não aceitam --data.');
  let route = command.raw ? args[1] : command.path;
  if (!command.raw && !command.bodyArgs) command.args.forEach((name, i) => {
    if (!args[i] || ['.', '..'].includes(args[i])) throw new CliError('invalid_id', `ID inválido: ${name}.`);
    route = route.replace(`:${name}`, encodeURIComponent(args[i]));
  });
  const config = await loadConfig(options, env);
  const url = apiUrl(config.url, route);
  let body = ['GET', 'HEAD'].includes(method) ? undefined : fields;
  if (command.method === 'GET') for (const [key, value] of Object.entries(fields)) url.searchParams.set(key, String(value));
  if (command.bodyArgs) command.args.forEach((name, i) => { body[name] = args[i]; });
  for (const pair of options.query || []) {
    const separator = pair.indexOf('=');
    if (separator < 1) throw new CliError('invalid_query', '--query requer key=value.');
    url.searchParams.append(pair.slice(0, separator), pair.slice(separator + 1));
  }
  if (command.credentials) {
    const password = options['password-stdin'] ? (await input.readStdin()).replace(/\r?\n$/, '') : env.LUCA_PASSWORD || body.password;
    if (!password) throw new CliError('password_required', 'Envie a senha com --password-stdin, LUCA_PASSWORD ou --data.');
    body.password = password;
  }
  const headers = {};
  if (command.upload) {
    body = await fs.readFile(fields.file);
    headers['Content-Type'] = 'application/octet-stream';
    headers['X-File-Name'] = encodeURIComponent(path.basename(fields.file));
    const mimes = { '.txt': 'text/plain', '.md': 'text/markdown', '.csv': 'text/csv', '.json': 'application/json', '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
    headers['X-File-Type'] = fields.mime || mimes[path.extname(fields.file).toLowerCase()] || 'application/octet-stream';
  }
  if (command.csvImport) {
    const { readLabInput } = await import('./local.js');
    body = await readLabInput(fields);
  }
  if (options['dry-run']) return emit({ dryRun: true, method, url: url.href, auth: command.auth, headers: redact(headers), body: Buffer.isBuffer(body) ? { file: fields.file, bytes: body.length } : redact(body) }, options);
  const controller = new AbortController();
  const onSignal = () => controller.abort();
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  try {
    const request = createClient(config, options, controller.signal);
    const binary = Boolean(command.binary || (command.download && options.output) || (command.raw && options.output));
    const requestOptions = { body, headers, binary, allowJobFailure: Boolean(command.job), timeout: numberOption(options.timeout, 'timeout', command.timeout || 30000) };
    let result = await request(method, `${url.pathname}${url.search}`, requestOptions);
    if (command.job && options.wait) result = await waitForJob(request, command.job, result, options, controller.signal);
    else if (command.job && result.status === 'failed') throw new CliError('job_failed', 'A execução falhou.', 5, { result });
    const select = value => command.select ? Object.fromEntries(command.select.map(key => [key, value[key] ?? null])) : value;
    await emit(select(result), options);
    if (options.watch) for (let index = 1; index < count; index++) {
      try { await delay(interval, undefined, { signal: controller.signal }); }
      catch { throw new CliError('interrupted', 'Observação interrompida.', 130); }
      await emit(select(await request(method, `${url.pathname}${url.search}`, requestOptions)), options);
    }
  } finally {
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
  }
}
