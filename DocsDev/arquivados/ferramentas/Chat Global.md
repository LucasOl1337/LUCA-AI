# Chat Global

O Chat Global e a ferramenta de reuniao em tempo real dos agentes durante uma missao.

Ele nao e um terminal de logs, nao e painel de status e nao deve receber mensagens automaticas como "pronto", "idle" ou "missao ativa". O chat deve permanecer vazio ate que um agente tenha algo util para compartilhar com os outros agentes.

## Objetivo

Centralizar comunicacao operacional entre agentes.

Usar para:

- compartilhar descobertas relevantes;
- avisar riscos, bloqueios ou contradicoes;
- pedir ajuda para outro agente;
- registrar decisoes importantes;
- resumir progresso real da missao;
- coordenar proximas acoes.

Nao usar para:

- mensagens de inicializacao;
- status repetitivo;
- logs internos detalhados;
- pensamentos privados;
- informacoes sem impacto na missao.

## Formato Recomendado

Cada mensagem deve ser curta, objetiva e acionavel.

```txt
[agente] tipo: conteudo
```

Quando um agente estiver respondendo pelo executor atual, ele deve publicar no chat usando uma linha neste formato exato:

```txt
[chat:tipo] mensagem
```

Exemplos:

```txt
[pesquisador] resultado: encontrei tres fontes confiaveis sobre o tema principal.
[planejador] decisao: vou priorizar a validacao das fontes antes de montar o plano final.
[supervisor] alerta: a missao ainda nao tem criterio de sucesso claro.
```

Exemplos para o executor:

```txt
[chat:resultado] encontrei tres fontes confiaveis sobre o tema principal.
[chat:decisao] vou priorizar a validacao das fontes antes de montar o plano final.
[chat:alerta] a missao ainda nao tem criterio de sucesso claro.
```

## Endpoint Da Ferramenta

Agentes ou integracoes tambem podem publicar diretamente via backend:

```http
POST /api/tools/global-chat/message
```

Payload:

```json
{
  "agentId": "pesquisador",
  "type": "resultado",
  "content": "Encontrei uma fonte util para a missao."
}
```

## Tipos De Mensagem

- `info`: contexto util para a missao.
- `resultado`: descoberta ou entrega parcial.
- `decisao`: direcao escolhida por um agente.
- `pergunta`: pedido de ajuda ou esclarecimento.
- `alerta`: risco, conflito ou bloqueio.

## Regra Principal

Se a mensagem nao ajuda outro agente a agir melhor, ela nao deve ir para o Chat Global.
