# Glossário

Termos de domínio do LUCA-AI. Um termo, um significado; código e interface seguem estes nomes.

## Laboratório do sensor

**Ensaio do sensor**:
Demonstração controlada de um fenômeno que ajuda a entender uma leitura e sua interpretação na operação.
_Evitar_: Case, quando não há um cenário com desfechos.

**Leitura simulada**:
Valor produzido por um ensaio, não uma medição do equipamento físico.
_Evitar_: Leitura ao vivo, dado medido.

**Limite didático**:
Referência configurada para uma demonstração, não uma certificação de estabilidade ou segurança do equipamento.
_Evitar_: Limite seguro do veículo.

## SOMPO: cadastro de veículos

- **Veículo**: máquina cadastrada na aba Veículos do SOMPO, por conta. Campos: `id` (minúsculas, números e hífen, imutável e único), `veiculo` (o Tipo), `placa` (placa ou, em máquina agrícola, identificação interna como `TRT0001`), `modelo` (o modelo comercial, rotulado "Modelo (cadastro)" na tela), `modelo3d` e `dispositivo` (opcional). Contrato em `shared/sompo-vehicles.js`.
- **Tipo**: `Caminhão` ou `Trator`, o campo `veiculo` do cadastro. Define quais cases o simulador oferece.
- **Modelo 3D**: a malha usada no simulador, campo `modelo3d` do cadastro e coluna `model3d_id` do episódio. Hoje: `caminhao-sompo` (caminhão atual) e `trator-max` (o trator de brinquedo das fotos em `missoes/trator-referencias`, equipamento `max-tractor` na cena agrícola). Não confundir com o "Modelo (cadastro)", que é texto livre.
- **Dispositivo**: o ESP32 que manda telemetria, identificado por `tractorId`/`trator` (`001` no Firebase, `SIM-001` no simulador). Não é o Veículo: a associação é explícita, pelo campo `dispositivo` do cadastro (vazio = sem dispositivo; um dispositivo por veículo na conta). Nome parecido não associa: `trator-0001` só vira o feed `001` se alguém gravar `001` no campo. Com associação, o modo físico mostra o Modelo 3D do veículo; sem ela, mostra a situação.
- **Case**: um cenário do simulador com seus desfechos (ex. obstáculo frontal com parada segura ou toque leve). Os dados de case são sintéticos e aparecem rotulados assim na tela. Um episódio gravado guarda o case (`scenario_id`, `outcome_id`) e, desde o cadastro, o veículo (`vehicle_id`, `vehicle_snapshot`, `model3d_id`).
