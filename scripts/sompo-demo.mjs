import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import './offline-network.mjs';

// New disposable state on every launch; never reuse personal or production data.
process.env.LUCA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-sompo-demo-'));
process.env.LUCA_AUTH_DATA_PATH = path.join(process.env.LUCA_DATA_DIR, 'auth.json');
process.env.LUCA_SOMPO_OFFLINE = 'true';
process.env.HOST = '127.0.0.1';
process.env.PORT = process.env.LUCA_DEMO_PORT || '4243';
process.env.KAMUI_BASE = 'http://127.0.0.1:1';
process.env.ROUTER_BASE_URL = 'http://127.0.0.1:1';
for (const key of ['ROUTER_API_KEY', 'NINE_ROUTER_API_KEY', 'KAMUI_INTERNAL_API_TOKEN', 'SENNIN_INTERNAL_API_TOKEN', 'LUCA_MACHINE_TOKEN', 'BRAVE_SEARCH_API_KEY', 'TAVILY_API_KEY', 'LUCA_ADMIN_EMAILS', 'CLOUDFLARE_ACCESS_EMAILS']) process.env[key] = '';
process.env.REQUIRE_CLOUDFLARE_ACCESS = 'false';
console.log(`Demo isolada: http://127.0.0.1:${process.env.PORT} | Dados temporários: ${process.env.LUCA_DATA_DIR}`);
await import('../server/index.js');
