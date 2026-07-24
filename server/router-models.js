export const ROUTER_PROFILES = Object.freeze([
  { name: 'Claude Fable 5', route: 'cc/claude-fable-5' },
  { name: 'Claude Opus 4.8 Alto', route: 'cc/claude-opus-4-8(max)' },
  { name: 'GPT 5.6 Sol Normal', route: 'cx/gpt-5.6-sol' },
  { name: 'GPT 5.6 Sol High', route: 'cx/gpt-5.6-sol-high' },
  { name: 'GPT 5.6 Sol xhigh', route: 'cx/gpt-5.6-sol-xhigh' },
  { name: 'GPT 5.6 Sol Ultra', route: 'cx/gpt-5.6-sol-xhigh' },
  { name: 'GPT 5.6 Luna xhigh', route: 'cx/gpt-5.6-luna-xhigh' },
  { name: 'GPT 5.6 Luna Ultra', route: 'cx/gpt-5.6-luna-xhigh' },
  { name: 'GPT 5.5 xhigh', route: 'cx/gpt-5.5-xhigh' },
  { name: 'Grok 4.5', route: 'gcli/grok-4.5' },
  { name: 'Kimi K3 General', route: 'kimi/kimi-k3' },
  { name: 'Kimi K3 Code', route: 'kimi/k3' },
  { name: 'Kimi K2.7 Code', route: 'kimi/kimi-for-coding' },
  { name: 'Kimi K2.7 Code HighSpeed', route: 'kimi/kimi-for-coding-highspeed' },
]);

export const ROUTER_MODEL_IDS = Object.freeze([...new Set(ROUTER_PROFILES.map(({ route }) => route))]);
export const DEFAULT_ROUTER_MODEL = 'cx/gpt-5.6-sol-high';

const routeSet = new Set(ROUTER_MODEL_IDS);
const profileRoutes = new Map(ROUTER_PROFILES.map(({ name, route }) => [name.toLowerCase(), route]));

export function resolveRouterModel(value, fallback = DEFAULT_ROUTER_MODEL) {
  const requested = String(value || '').trim();
  const withoutProvider = requested.startsWith('9router/') ? requested.slice('9router/'.length) : requested;
  if (routeSet.has(withoutProvider)) return withoutProvider;
  const profileRoute = profileRoutes.get(requested.toLowerCase());
  if (profileRoute) return profileRoute;
  return routeSet.has(fallback) ? fallback : DEFAULT_ROUTER_MODEL;
}

export function isAllowedRouterModel(value) {
  return routeSet.has(String(value || '').trim().replace(/^9router\//, ''));
}
