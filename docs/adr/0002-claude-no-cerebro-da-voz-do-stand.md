# 0002 · Claude no cérebro da voz do stand

19/10/2026 · aceita

## Contexto

Desde 18/10, o produto inteiro usa só o Astra (`cx/gpt-6-astra-*`), e `server/config.js` recusa outro modelo. A voz do stand responde em tempo real, e a primeira frase do Astra levava de 3,6 a 5,8 s, longo demais para uma conversa falada. O Lucas pediu Claude/Sonnet para a voz.

## Decisão

A exceção vale só para o cérebro da voz do stand. `cadeiaCerebroStand` (`server/config.js`) aceita `cc/claude-*`, com a cadeia Sonnet 5 → Haiku 4.5 → Astra → fala pronta, e só `server/stand/cerebro.js` a usa. A rota `cc/` passa pelo mesmo 9Router Railway, sem conta nova. Fora do stand, a regra do Astra continua, e `server/config.test.js` cobre os dois lados.

## Consequências

- Se o p50 do primeiro áudio passar de 3,5 s, a troca do padrão para Haiku sobe ao Lucas com números.
- Retenção: o modo sem retenção da ElevenLabs (`enable_logging=false`) só existe no plano enterprise. O stand segue o padrão do provedor, como foi aceito em 19/10.
- A Grok Voice fica como reserva (`STAND_VOZ_PROVEDOR=xai`) até alguém decidir tirá-la.

Arquitetura e configuração: [`docs/stand-voz.md`](../stand-voz.md).
