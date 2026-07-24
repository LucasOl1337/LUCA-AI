import { DEFAULT_ROUTER_MODEL, resolveRouterModel } from './router-models.js';

export const HOST = process.env.HOST || '127.0.0.1';
export const PORT = Number(process.env.PORT || 4242);
export const ROUTER_API_KEY = process.env.ROUTER_API_KEY || process.env.NINE_ROUTER_API_KEY || '';
export const ROUTER_BASE_URL = process.env.ROUTER_BASE_URL || 'http://127.0.0.1:20128/v1';
export const ROUTER_MODEL = resolveRouterModel(process.env.ROUTER_MODEL, DEFAULT_ROUTER_MODEL);
export const ROUTER_TIMEOUT_MS = Number(process.env.ROUTER_TIMEOUT_MS || 45000);
export const REQUIRE_CLOUDFLARE_ACCESS = process.env.REQUIRE_CLOUDFLARE_ACCESS === 'true';
export const CLOUDFLARE_ACCESS_EMAILS = Object.freeze(
  String(process.env.CLOUDFLARE_ACCESS_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);
export const API_RATE_LIMIT_MAX = Number(process.env.API_RATE_LIMIT_MAX || 120);
export const API_RATE_LIMIT_WINDOW_MS = Number(process.env.API_RATE_LIMIT_WINDOW_MS || 60000);
