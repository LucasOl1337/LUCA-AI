#!/usr/bin/env bash
# Sobe o runtime local do /stand e expõe na tailnet por HTTPS (o microfone exige HTTPS).
# Guia: docs/stand-tailnet.md. Não mexe nas outras portas do `tailscale serve`.
#
#   scripts/stand-tailnet.sh subir     build, runtime em 127.0.0.1:$STAND_PORTA e serve em :$STAND_HTTPS
#   scripts/stand-tailnet.sh status    runtime, serve e URL
#   scripts/stand-tailnet.sh desligar  tira o serve da porta HTTPS e para o runtime
#
# Variáveis (todas opcionais):
#   STAND_PORTA=4710          porta local do Express
#   STAND_HTTPS=8444          porta HTTPS na tailnet (8443, 8096 e / já são de outros serviços no PC lol)
#   STAND_DADOS=~/.local/state/luca-stand   LUCA_DATA_DIR isolado (contas e banco locais do stand)
#   STAND_SEM_BUILD=1         reaproveita o dist/ atual
#   ELEVENLABS_API_KEY        voz padrão (Scribe + TTS), só no env
#                             (padrão: chaveiro `secret-tool lookup servico elevenlabs usuario tts-agentes`)
#   STAND_VOZ_PROVEDOR=xai    volta para a Grok Voice; usa XAI_API_KEY | XAI_OAUTH_AUTH_FILE (~/.grok/auth.json)
#   ROUTER_API_KEY            chave do 9Router Railway (cérebro e embeddings; a URL é fixa em server/config.js)
#                             (padrão: STAND_ROTEADOR=railway pelo comando `rotas`, se existir)
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORTA="${STAND_PORTA:-4710}"
HTTPS="${STAND_HTTPS:-8444}"
DADOS="${STAND_DADOS:-$HOME/.local/state/luca-stand}"
PIDFILE="$DADOS/runtime.pid"
LOG="$DADOS/runtime.log"

host_tailnet() {
  tailscale status --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);process.stdout.write(String(j.Self?.DNSName||"").replace(/\.$/,""))})'
}

url_tailnet() { echo "https://$(host_tailnet):$HTTPS/stand"; }

runtime_vivo() { [[ -f "$PIDFILE" ]] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; }

serve_ocupado_por_outro() {
  # Recusa sobrescrever uma porta HTTPS que já aponta para outro destino.
  local atual
  atual="$(tailscale serve status --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s||"{}");const web=j.Web||{};for(const [k,v] of Object.entries(web)){if(k.endsWith(":"+process.argv[1])){const h=Object.values(v.Handlers||{})[0];process.stdout.write(h?.Proxy||"?")}}})' "$HTTPS")"
  [[ -n "$atual" && "$atual" != "http://127.0.0.1:$PORTA" ]] && { echo "$atual"; return 0; }
  return 1
}

subir() {
  command -v tailscale >/dev/null || { echo "tailscale não instalado" >&2; exit 1; }
  if destino="$(serve_ocupado_por_outro)"; then
    echo "a porta HTTPS $HTTPS da tailnet já aponta para $destino; escolha outra com STAND_HTTPS=" >&2
    exit 1
  fi
  mkdir -p "$DADOS"
  cd "$RAIZ"
  if [[ "${STAND_SEM_BUILD:-}" != 1 ]]; then
    npx vite build --configLoader native --logLevel warn
  fi
  if runtime_vivo; then
    echo "runtime já no ar (pid $(cat "$PIDFILE"))"
  else
    if ss -ltn "sport = :$PORTA" | grep -q LISTEN; then
      echo "porta $PORTA ocupada por outro processo; escolha outra com STAND_PORTA=" >&2
      exit 1
    fi
    if [[ "${STAND_VOZ_PROVEDOR:-elevenlabs}" == xai ]]; then
      if [[ -z "${XAI_API_KEY:-}" && -z "${XAI_OAUTH_AUTH_FILE:-}" && -f "$HOME/.grok/auth.json" ]]; then
        export XAI_OAUTH_AUTH_FILE="$HOME/.grok/auth.json"
      fi
      [[ -z "${XAI_API_KEY:-}" && -z "${XAI_OAUTH_AUTH_FILE:-}" ]] && echo "aviso: sem XAI_API_KEY/XAI_OAUTH_AUTH_FILE, o stand abre mas fica sem voz" >&2
    else
      if [[ -z "${ELEVENLABS_API_KEY:-}" ]] && command -v secret-tool >/dev/null; then
        ELEVENLABS_API_KEY="$(secret-tool lookup servico elevenlabs usuario tts-agentes 2>/dev/null || true)"
        [[ -n "$ELEVENLABS_API_KEY" ]] && export ELEVENLABS_API_KEY
      fi
      [[ -z "${ELEVENLABS_API_KEY:-}" ]] && echo "aviso: sem ELEVENLABS_API_KEY, o stand abre mas fica sem voz" >&2
    fi
    # A URL do 9Router é fixa no Railway (server/config.js); só a chave vem do ambiente.
    if [[ -z "${ROUTER_API_KEY:-}" ]] && command -v rotas >/dev/null; then
      ROUTER_API_KEY="$(rotas chave "${STAND_ROTEADOR:-railway}" 2>/dev/null || true)"
      [[ -n "$ROUTER_API_KEY" ]] && export ROUTER_API_KEY
    fi
    [[ -z "${ROUTER_API_KEY:-}" ]] && echo "aviso: sem ROUTER_API_KEY, o cérebro cai na fala de falha e o roteador de vídeo fica sem embeddings" >&2
    HOST=127.0.0.1 PORT="$PORTA" LUCA_DATA_DIR="$DADOS" LUCA_SOMPO_OFFLINE="${LUCA_SOMPO_OFFLINE:-true}" \
      nohup node server/index.js >"$LOG" 2>&1 &
    echo $! >"$PIDFILE"
    for _ in $(seq 1 60); do curl -fs "http://127.0.0.1:$PORTA/api/health" >/dev/null && break; sleep 0.5; done
    curl -fs "http://127.0.0.1:$PORTA/api/health" >/dev/null || { tail -20 "$LOG" >&2; exit 1; }
    echo "runtime no ar: http://127.0.0.1:$PORTA (pid $(cat "$PIDFILE"), log $LOG)"
  fi
  tailscale serve --bg --https="$HTTPS" "http://127.0.0.1:$PORTA" >/dev/null
  echo "stand na tailnet: $(url_tailnet)"
}

status() {
  if runtime_vivo; then echo "runtime: no ar (pid $(cat "$PIDFILE"), porta $PORTA)"; else echo "runtime: parado"; fi
  if tailscale serve status 2>/dev/null | grep -q ":$HTTPS "; then echo "serve: ligado em $(url_tailnet)"; else echo "serve: desligado (porta $HTTPS)"; fi
}

desligar() {
  if serve_ocupado_por_outro >/dev/null; then
    echo "serve em :$HTTPS é de outro destino; não mexi nele" >&2
  else
    tailscale serve --https="$HTTPS" off >/dev/null 2>&1 || true
    echo "serve :$HTTPS desligado"
  fi
  if runtime_vivo; then kill "$(cat "$PIDFILE")"; echo "runtime parado"; fi
  rm -f "$PIDFILE"
}

case "${1:-}" in
  subir) subir ;;
  status) status ;;
  desligar) desligar ;;
  *) sed -n '2,15p' "$0"; exit 2 ;;
esac
