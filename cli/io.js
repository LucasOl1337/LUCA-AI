import fs from 'node:fs/promises';

export class CliError extends Error {
  constructor(code, message, exitCode = 2, details = {}) {
    super(message);
    Object.assign(this, { code, exitCode, details });
  }
}

export const globalOptions = {
  'base-url': 'Origem do servidor; padrão LUCA_URL ou http://127.0.0.1:4242',
  profile: 'Perfil salvo; padrão LUCA_PROFILE ou perfil ativo',
  config: 'Arquivo de perfis; padrão LUCA_CLI_CONFIG ou XDG_CONFIG_HOME/luca/config.json',
  data: 'Corpo JSON: literal, @arquivo.json ou - para stdin',
  query: 'Parâmetro key=value; repetível; valores escapados como texto',
  output: 'Gravar resposta em arquivo, ou - para stdout binário/texto',
  pretty: 'Identar JSON (stdout padrão é JSON compacto)',
  json: 'JSON explícito; padrão para respostas estruturadas',
  timeout: 'Timeout de cada requisição em ms (padrão 30000)',
  wait: 'Aguardar job team/deliberations sem reenviar POST',
  'wait-timeout': 'Limite total da espera em ms (padrão 1800000)',
  interval: 'Intervalo de polling em ms (padrão 1000, mínimo 100)',
  watch: 'Repetir GET e emitir snapshots NDJSON; padrão 10 amostras',
  count: 'Quantidade de snapshots de --watch (1 a 10000)',
  'dry-run': 'Exibir método/URL/corpo com credenciais ocultas; sem rede',
  'password-stdin': 'Ler senha de stdin em auth login/register; também aceita LUCA_PASSWORD',
  help: 'Ajuda local, sem rede',
  version: 'Versão do CLI',
};
const booleans = new Set(['pretty', 'json', 'wait', 'watch', 'dry-run', 'password-stdin', 'help', 'version']);
const aliases = { h: 'help', V: 'version', d: 'data', o: 'output' };

export function parseArgs(argv, commands) {
  const positionals = [];
  const options = Object.create(null);
  // Command-specific boolean names are known before resolving the command.
  const booleanFields = new Set(commands.flatMap(c => c.fields.filter(f => f.type === 'boolean').map(f => f.name)));
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--') { positionals.push(...argv.slice(index + 1)); break; }
    if (!arg.startsWith('-') || arg === '-') { positionals.push(arg); continue; }
    const match = /^(--?)([^=]+)(?:=(.*))?$/s.exec(arg);
    let name = match?.[2];
    if (match?.[1] === '-') name = aliases[name];
    if (!name) throw new CliError('invalid_option', `Opção inválida: ${arg}`);
    let value = match[3];
    const negated = name.startsWith('no-') && booleanFields.has(name.slice(3));
    if (negated) { name = name.slice(3); value = 'false'; }
    if (booleans.has(name) || booleanFields.has(name)) {
      if (value === undefined && ['true', 'false'].includes(argv[index + 1])) value = argv[++index];
      value ??= 'true';
      if (!['true', 'false'].includes(value)) throw new CliError('invalid_boolean', `--${name} aceita true ou false.`);
      value = value === 'true';
    } else if (value === undefined) {
      if (argv[index + 1] === undefined || argv[index + 1].startsWith('--')) throw new CliError('missing_value', `Falta valor para --${name}.`);
      value = argv[++index];
    }
    if (name === 'query') (options.query ??= []).push(value);
    else {
      if (Object.hasOwn(options, name)) throw new CliError('duplicate_option', `--${name} repetido.`);
      options[name] = value;
    }
  }
  return { positionals, options };
}

export function numberOption(value, name, fallback, min = 1, max = 2147483647) {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!String(value).trim() || !Number.isFinite(number) || number < min || number > max) throw new CliError('invalid_number', `--${name} deve estar entre ${min} e ${max}.`);
  return number;
}

export function createInput(stdin = process.stdin) {
  let used = false;
  async function readStdin() {
    if (used) throw new CliError('stdin_reused', 'stdin só pode ser usado uma vez por comando.');
    if (stdin.isTTY) throw new CliError('stdin_required', 'Envie os dados por pipe ou use @arquivo.');
    used = true;
    const chunks = [];
    let bytes = 0;
    for await (const chunk of stdin) {
      bytes += Buffer.byteLength(chunk);
      if (bytes > 16 * 1024 * 1024) throw new CliError('input_too_large', 'stdin excede 16 MiB.');
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString('utf8');
  }
  return {
    readStdin,
    async json(value) {
      const raw = value === '-' ? await readStdin() : value.startsWith('@') ? await fs.readFile(value.slice(1), 'utf8') : value;
      try { return JSON.parse(raw); }
      catch { throw new CliError('invalid_json', 'JSON inválido. Use JSON literal, @arquivo.json ou - para stdin.'); }
    },
  };
}

export function objectBody(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CliError('invalid_body', 'O corpo deve ser um objeto JSON.');
  return value;
}

export function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, /password|authorization|cookie|machine.?token/i.test(key) ? '[REDACTED]' : redact(item)]));
  return value;
}

export async function emit(value, options = {}) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(`${JSON.stringify(value, null, options.pretty ? 2 : undefined)}\n`);
  if (options.output && options.output !== '-') {
    await fs.writeFile(options.output, bytes, { mode: 0o600 });
    process.stdout.write(`${JSON.stringify({ ok: true, output: options.output, bytes: bytes.length })}\n`);
  } else {
    process.stdout.write(bytes);
  }
}
