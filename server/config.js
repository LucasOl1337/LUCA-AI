export const HOST = process.env.HOST || '127.0.0.1';
export const PORT = Number(process.env.PORT || 4242);
export const ROUTER_API_KEY = process.env.ROUTER_API_KEY || process.env.NINE_ROUTER_API_KEY || '';
export const ROUTER_BASE_URL = process.env.ROUTER_BASE_URL || 'http://127.0.0.1:20128/v1';
export const ROUTER_MODEL = process.env.ROUTER_MODEL || 'cx/gpt-5.4-mini-xhigh';
export const ROUTER_TIMEOUT_MS = Number(process.env.ROUTER_TIMEOUT_MS || 45000);
