#!/usr/bin/env bash
# Executar pelo regente na sennin-kvm, nunca na VM shadow.
# --dry-run é somente leitura; --apply segura a trava real, salva rollback e instala.
set -euo pipefail
mode="${1:---dry-run}"
commit="${2:?uso: video-totem-kvm.sh --dry-run|--apply COMMIT12 RELEASE_ANTERIOR}"
previous="${3:?informe a release atual conferida por Portaria}"
[[ "$mode" == --dry-run || "$mode" == --apply ]]
[[ "$commit" =~ ^[0-9a-f]{12}$ && "$previous" =~ ^[0-9a-f]{12}$ ]]
staging="/tmp/luca-deploy-$commit"
root=/opt/sennin/luca-ai
current="$(readlink -f "$root/current")"
[[ "$current" == "$root/releases/$previous" ]] || {
  echo "release mudou: reconciliar com Portaria antes de aplicar" >&2; exit 1;
}
for file in source.tar dist.tar state.tar install-vm.sh SHA256SUMS; do
  test -s "$staging/$file"
done
(cd "$staging" && sha256sum --check SHA256SUMS)
test ! -e "$root/releases/$commit"
printf 'HOST=%s CURRENT=%s CANDIDATE=%s MODE=%s\n' "$(hostname)" "$current" "$commit" "$mode"
if [[ "$mode" == --dry-run ]]; then
  echo "Plano: lock /run/lock/luca-ai-deploy.lock; backup privado de estado/env/unit; install-vm.sh; health e asset com Portaria."
  echo "Aplicar: sudo bash $staging/video-totem-kvm.sh --apply $commit $previous"
  exit 0
fi
[[ "$EUID" == 0 ]] || { echo 'apply exige sudo' >&2; exit 1; }
exec 9>/run/lock/luca-ai-deploy.lock
echo 'Aguardando lock de deploy; manter este job e a vaga de Portaria até conclusão.'
flock 9
echo 'Lock adquirido; revalidando release antes de instalar.'
[[ "$(readlink -f "$root/current")" == "$current" ]]
systemctl is-active --quiet luca-ai.service cloudflared-luca-ai.service
curl -fsS --max-time 10 http://127.0.0.1:4242/api/health | node --input-type=module -e '
let input = ""; for await (const chunk of process.stdin) input += chunk;
const h = JSON.parse(input);
if (!h.ok || h.activeMission || h.scheduledMissions > 0) {
  console.error("runtime ocupado/indisponível: reconciliar evento com Portaria"); process.exit(1);
}'
# Horário de Brasília nos artefatos do lote; não imprime configuração/estado.
backup="/opt/sennin/backups/luca-video-$commit-$(TZ=America/Sao_Paulo date +%Y%m%dT%H%M%S)"
install -d -m 700 "$backup"
printf '%s\n' "$current" > "$backup/current.before"
cp -a /etc/sennin/luca-ai.env "$backup/luca-ai.env"
cp -a /etc/systemd/system/luca-ai.service "$backup/luca-ai.service"
tar -czf "$backup/state.tar.gz" -C /var/lib/luca-ai .
chmod 600 "$backup"/*
printf 'BACKUP=%s\n' "$backup"
# Não roda migração nem escreve prompt/dado vivo separado; aplica código versionado.
bash "$staging/install-vm.sh" "$commit"
[[ "$(readlink -f "$root/current")" == "$root/releases/$commit" ]]
systemctl is-active --quiet luca-ai.service cloudflared-luca-ai.service
curl -fsS --max-time 10 http://127.0.0.1:4242/api/health
printf '\nAPPLIED=%s BACKUP=%s\n' "$commit" "$backup"
# Falha não dispara retry nem rollback cego. Reconciliar estado e usar current.before
# para retorno de código; estado/env só restaurar explicitamente, preservando dados novos.
