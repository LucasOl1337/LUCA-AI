#!/usr/bin/env bash
set -euo pipefail

commit="${1:?uso: install-vm.sh <commit> [staging-dir]}"
staging="${2:-/tmp/luca-deploy-$commit}"
release_root=/opt/sennin/luca-ai
release="$release_root/releases/$commit"
backup="/opt/sennin/backups/luca-ai-$(date -u +%Y%m%dT%H%M%SZ)"

test -f "$staging/source.tar"
test -f "$staging/dist.tar"
test -f "$staging/state.tar"

install -d -m 750 "$backup"
[[ ! -f /etc/cloudflared/luca-ai.yml ]] || cp -a /etc/cloudflared/luca-ai.yml "$backup/luca-ai.yml.before-luca"
[[ ! -f /etc/systemd/system/luca-ai.service ]] || cp -a /etc/systemd/system/luca-ai.service "$backup/luca-ai.service"

if ! id luca-ai >/dev/null 2>&1; then
  useradd --system --home-dir /var/lib/luca-ai --shell /usr/sbin/nologin luca-ai
fi

install -d -o root -g root -m 755 "$release_root" "$release_root/releases"
if [[ -e "$release" ]]; then
  echo "release já existe: $release" >&2
  exit 1
fi
install -d -o root -g root -m 755 "$release"
tar -xf "$staging/source.tar" -C "$release"
tar -xf "$staging/dist.tar" -C "$release"
cd "$release"
npm ci --omit=dev --ignore-scripts --no-audit --no-fund

install -d -o luca-ai -g luca-ai -m 700 /var/lib/luca-ai
tar -xf "$staging/state.tar" -C /var/lib/luca-ai --strip-components=1
chown -R luca-ai:luca-ai /var/lib/luca-ai
chmod 700 /var/lib/luca-ai
find /var/lib/luca-ai -type f -exec chmod 600 {} +

set -a
# Chaves reutilizadas somente dentro da VM e nunca impressas nem copiadas ao repositório.
source /etc/sennin/yume.env
# Token interno do Kamui: sem ele o proxy não injeta YUME_INTERNAL_API_TOKEN no tether.
if [[ -f /etc/sennin/kamui.env ]]; then
  # shellcheck disable=SC1091
  source /etc/sennin/kamui.env
fi
set +a
test -n "${YUME_9ROUTER_API_KEY:-}"
test -n "${KAMUI_INTERNAL_API_TOKEN:-}"
install -d -o root -g root -m 750 /etc/sennin
env_tmp="$(mktemp /etc/sennin/luca-ai.env.XXXXXX)"
chmod 600 "$env_tmp"
printf '%s\n' \
  'ROUTER_BASE_URL=http://127.0.0.1:20129/v1' \
  'ROUTER_MODEL=cx/gpt-5.6-sol-high' \
  'KAMUI_BASE=http://127.0.0.1:1338' \
  'LUCA_ADMIN_EMAILS=lucasplays2000@gmail.com' \
  "ROUTER_API_KEY=$YUME_9ROUTER_API_KEY" \
  "KAMUI_INTERNAL_API_TOKEN=$KAMUI_INTERNAL_API_TOKEN" > "$env_tmp"
mv "$env_tmp" /etc/sennin/luca-ai.env

ln -s "$release" "$release_root/current.next"
mv -Tf "$release_root/current.next" "$release_root/current"
install -o root -g root -m 644 "$release/deploy/luca-ai.service" /etc/systemd/system/luca-ai.service
systemctl daemon-reload
systemctl enable luca-ai.service
systemctl restart luca-ai.service

for _attempt in $(seq 1 30); do
  if curl -fsS --max-time 2 http://127.0.0.1:4242/api/auth/session >/dev/null; then
    break
  fi
  sleep 1
done
curl -fsS --max-time 5 http://127.0.0.1:4242/api/auth/session >/dev/null
# INSTALL_VM_HEALTH_GATE_V1: fail closed if health/version diverge from package.json
expected_version="$(node -p "require('./package.json').version" 2>/dev/null || true)"
test -n "$expected_version"
health_json="$(curl -fsS --max-time 5 http://127.0.0.1:4242/api/health)"
printf '%s' "$health_json" | node -e '
const fs = require("fs");
const expected = process.argv[1];
const body = JSON.parse(fs.readFileSync(0, "utf8"));
if (body.ok !== true) {
  console.error("health.ok != true", body);
  process.exit(1);
}
if (body.service !== "luca-ai") {
  console.error("health.service unexpected", body.service);
  process.exit(1);
}
if (!body.version || String(body.version).trim() !== expected) {
  console.error("health.version mismatch", { expected, got: body.version });
  process.exit(1);
}
' "$expected_version"
private_status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:4242/api/state)"
test "$private_status" = 401

# Tunnel oficial do LUCA (somente hostnames luca-ai.com.br).
tunnel_config=/etc/cloudflared/luca-ai.yml
if [[ ! -f "$tunnel_config" ]]; then
  echo "tunnel config ausente: $tunnel_config" >&2
  exit 1
fi
if ! grep -q 'hostname: luca-ai.com.br' "$tunnel_config"; then
  config_tmp="$(mktemp /etc/cloudflared/luca-ai.yml.XXXXXX)"
  awk '
    /  - service: http_status:404/ {
      print "  - hostname: luca-ai.com.br"
      print "    service: http://127.0.0.1:4242"
      print "    originRequest:"
      print "      connectTimeout: 10s"
      print "      tcpKeepAlive: 30s"
      print "      keepAliveTimeout: 90s"
      print "      keepAliveConnections: 100"
    }
    { print }
  ' "$tunnel_config" > "$config_tmp"
  chmod --reference="$tunnel_config" "$config_tmp"
  chown --reference="$tunnel_config" "$config_tmp"
  mv "$config_tmp" "$tunnel_config"
fi

# cloudflared bin: unit da sennin aponta para /opt/9router; fallback no PATH.
if command -v cloudflared >/dev/null 2>&1; then
  cloudflared tunnel --config "$tunnel_config" ingress validate
elif [[ -x /opt/9router/data/bin/cloudflared ]]; then
  /opt/9router/data/bin/cloudflared tunnel --config "$tunnel_config" ingress validate
fi
systemctl restart cloudflared-luca-ai.service
systemctl is-active --quiet luca-ai.service
systemctl is-active --quiet cloudflared-luca-ai.service

printf 'DEPLOYED_COMMIT=%s\n' "$commit"
printf 'PRIVATE_STATUS=%s\n' "$private_status"
printf 'HEALTH_VERSION=%s\n' "$expected_version"
