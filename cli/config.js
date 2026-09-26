import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { CliError } from './io.js';

export function normalizeOrigin(value) {
  let url;
  try { url = new URL(value); } catch { throw new CliError('invalid_url', 'Use uma origem absoluta HTTP(S).'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) throw new CliError('invalid_url', 'A URL deve conter apenas protocolo, host e porta, sem senha, caminho ou query.');
  return url.origin;
}

export async function loadConfig(options, env = process.env) {
  const file = path.resolve(options.config || env.LUCA_CLI_CONFIG || path.join(env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'luca', 'config.json'));
  let data = { version: 1, current: 'local', profiles: { local: { url: 'http://127.0.0.1:4242' } } };
  try {
    data = JSON.parse(await fs.readFile(file, 'utf8'));
    if (data.version !== 1 || !data.profiles || Array.isArray(data.profiles) || typeof data.profiles !== 'object') throw new Error('invalid');
  } catch (error) {
    if (error.code !== 'ENOENT') throw new CliError('invalid_config', `Config inválida: ${file}. Corrija o arquivo ou escolha outro --config.`);
  }
  const name = options.profile || env.LUCA_PROFILE || data.current || 'local';
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/.test(name) || ['__proto__', 'prototype', 'constructor'].includes(name)) throw new CliError('invalid_profile', 'Nome de perfil inválido.');
  const profile = Object.hasOwn(data.profiles, name) ? data.profiles[name] : null;
  const override = options['base-url'] || env.LUCA_URL;
  if (!profile && !override && !options._profileCommand) throw new CliError('profile_not_found', `Perfil ${name} não existe. Use profile set NOME --url URL.`);
  const url = normalizeOrigin(override || profile?.url || 'http://127.0.0.1:4242');
  const cookie = env.LUCA_SESSION ? `luca_session=${encodeURIComponent(env.LUCA_SESSION)}` : profile?.url === url ? profile.cookie || '' : '';

  async function save() {
    await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
      await fs.rename(temporary, file);
    } finally { await fs.rm(temporary, { force: true }); }
  }
  return {
    file, data, name, url, cookie,
    machineToken: env.LUCA_MACHINE_TOKEN || '',
    save,
    async setCookie(cookie) {
      // An explicit login on --base-url binds this profile to that origin.
      data.profiles[name] = { url, ...(cookie ? { cookie } : {}) };
      await save();
    },
  };
}

export async function runProfile(command, args, options, config) {
  const safe = (name, profile) => ({ name, url: profile.url, authenticated: Boolean(profile.cookie), current: config.data.current === name });
  if (command === 'profile list') return { profiles: Object.entries(config.data.profiles).map(([name, profile]) => safe(name, profile)) };
  if (command === 'profile show') return { profile: config.name, url: config.url, authenticated: Boolean(config.cookie), config: config.file };
  const name = args[0];
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/.test(name) || ['__proto__', 'prototype', 'constructor'].includes(name)) throw new CliError('invalid_profile', 'Nome de perfil inválido.');
  if (command === 'profile set') {
    const url = normalizeOrigin(options.url);
    const previous = Object.hasOwn(config.data.profiles, name) ? config.data.profiles[name] : null;
    config.data.profiles[name] = { url, ...(previous?.url === url && previous.cookie ? { cookie: previous.cookie } : {}) };
  } else {
    if (!Object.hasOwn(config.data.profiles, name)) throw new CliError('profile_not_found', `Perfil ${name} não existe.`);
    if (command === 'profile use') config.data.current = name;
    else {
      delete config.data.profiles[name];
      if (config.data.current === name) config.data.current = Object.keys(config.data.profiles)[0] || 'local';
    }
  }
  await config.save();
  return { ok: true, profile: name, action: command.split(' ')[1] };
}
