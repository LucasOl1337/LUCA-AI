# Stand na tailnet

Leia ao abrir o `/stand` com voz numa máquina da tailnet do Lucas (outro PC, notebook ou celular), sem passar pela produção. O script é `scripts/stand-tailnet.sh`.

## O que sobe

Sobe um runtime Express isolado em `127.0.0.1:4710`, com dados próprios e o Sompo offline, publicado por `tailscale serve` em HTTPS na porta 8444 do PC. O microfone do navegador só funciona em HTTPS (contexto seguro), e o certificado do `*.ts.net` resolve isso sem configurar nada. A resposta manda `permissions-policy: microphone=(self)`.

URL do PC `lol`: `https://lol.tail57ca21.ts.net:8444/stand`

Não é a produção (`luca-ai.com.br`). O banco, as contas e os episódios ficam em `STAND_DADOS` (padrão `~/.local/state/luca-stand`).

## Comandos

```bash
scripts/stand-tailnet.sh subir      # build, runtime e serve; repetir é seguro
scripts/stand-tailnet.sh status     # runtime e serve
scripts/stand-tailnet.sh desligar   # tira o serve da 8444 e para o runtime
```

| Variável | Padrão | Para quê |
| --- | --- | --- |
| `STAND_PORTA` | `4710` | Porta local do Express. |
| `STAND_HTTPS` | `8444` | Porta HTTPS na tailnet. |
| `STAND_DADOS` | `~/.local/state/luca-stand` | `LUCA_DATA_DIR` do stand: contas, banco, `runtime.log` e `runtime.pid`. |
| `STAND_SEM_BUILD` | vazio | `1` reaproveita o `dist/` atual. |
| `XAI_API_KEY` ou `XAI_OAUTH_AUTH_FILE` | `~/.grok/auth.json`, se existir | Credencial da voz (xAI). Fica só no ambiente do processo. Sem ela o stand abre, mas fica sem voz. |
| `ROUTER_BASE_URL` e `ROUTER_API_KEY` | 9Router `STAND_ROTEADOR` (padrão `hostinger`) lido pelo comando `rotas` | Embeddings do roteador de vídeo. Sem eles a IA ainda conversa, mas não escolhe Vídeo do stand pela pergunta. |

No PC `lol`, as portas HTTPS 443, 8096 e 8443 do `tailscale serve` já são de outros serviços. O script recusa uma porta que já aponta para outro destino e, no `desligar`, só mexe na porta dele.

## Primeiro acesso

O `/stand` exige sessão. No banco novo, a primeira conta criada vira admin, a não ser que `LUCA_ADMIN_EMAILS` esteja definido. Crie a conta pelo próprio painel (`https://…:8444/`) ou pelo CLI:

```bash
node bin/luca.js profile set stand --url https://lol.tail57ca21.ts.net:8444
node bin/luca.js auth register --profile stand --name "Stand" --email EMAIL --password-stdin
```

Guarde a senha no chaveiro, não no repo. Depois faça login no navegador da máquina do stand, abra `/stand` e toque na tela: esse toque é o gesto que libera o microfone e o áudio. O navegador pede permissão do microfone uma vez por origem (host e porta).

## Outras máquinas

Qualquer máquina logada na tailnet do Lucas abre a URL acima. Celular Android: app Tailscale ligado e Chrome. Se o MagicDNS de uma máquina não resolver `lol.tail57ca21.ts.net` (aconteceu no servidor `sherlocker` em 16/10/2026), ligue o DNS do Tailscale nela (`tailscale set --accept-dns`). O certificado vale para o nome, não para o IP `100.99.71.120`.

## Limites

- O runtime não reinicia sozinho no boot. Para deixar fixo, rode `subir` de novo depois de reiniciar o PC.
- Os limites da voz são os da M1: sessão encerra após 20 s de silêncio, teto de 240 s e 30 sessões por hora (`GET /api/stand/status`).
- A IA responde ao público com `docs/stand-publico.md` e a lista branca de `server/stand/conhecimento.js`. Não lê código, deploy nem `.env`.
