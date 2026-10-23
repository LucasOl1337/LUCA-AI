# Áudio do trator

`trator/lenta.mp3` e `trator/carga.mp3`: gerados para LUCA-AI com ElevenLabs Sound Effects (conta autorizada do proprietário), endpoint `/v1/sound-generation`, 23/10/2026. Não são gravações CC0 nem material de terceiros baixado; uso conforme termos comerciais ElevenLabs: https://elevenlabs.io/terms-of-use . Sem clonagem de voz.

Prompts: motor de trator diesel agrícola, som contínuo sem fala/música, lenta800rpm ou carga2100rpm, perspectiva de cabine, sem partida/troca de marcha/aceleração. `duration_seconds:5`, `loop:true`, `prompt_influence:0.5`. Arquivos de origem idênticos às amostras som-trator-lenta.mp3 e som-trator-alta.mp3 da rodada 20261023. Total162254B.

Amostra intermediária de1400rpm gerada e preservada fora do repo para avaliação; não é carregada pelo app. Três gerações usadas de teto10 autorizado. Avaliação perceptual pendente pelo proprietário/regente; integração permite substituir assets sem chamar provedor em runtime.

As bordas de origem não são perfeitamente coincidentes (delta PCM lenta0.0023, alta0.083). O módulo somMotor.ts prepara AudioBuffers com overlap linear de150ms para eliminar descontinuidade de loop; crossfade entre lenta/carga equal-power, rotação e volume suavizados em120ms. Sem alteração automática por fala, sem ducking.
