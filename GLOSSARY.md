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

## Stand do trator

**Vídeo do stand**:
Resposta pré-gravada a uma pergunta central do público do stand, identificada por um id (`pipeline-completo`, `painel-sompo`, `painel-segurado`).
_Evitar_: Clipe, demo, apresentação.

**Resumo falado**:
Uma ou duas frases que a IA diz antes de tocar um Vídeo do stand.
_Evitar_: Legenda, descrição.

**Roteamento de pergunta**:
Decisão sobre uma pergunta do público: tocar um Vídeo do stand, oferecê-lo ou responder ao vivo.
_Evitar_: Classificação (termo da bancada de agentes), intent.

**Fora de escopo**:
Pergunta que pede resposta ao vivo, sem vídeo, mesmo quando cita trator ou Sompo.
_Evitar_: Pergunta inválida.

**Cenário do stand**:
Um Case com desfecho fixo, disparado por um clique ou por um botão do controle, que grava um episódio e tem uma pergunta associada que o Roteamento de pergunta usa para achar o vídeo. Hoje: obstáculo com alerta a tempo, inclinação perigosa e reação atrasada.
_Evitar_: Cenário pré-programado, roteiro.

**Reação atrasada**:
O alerta toca no mesmo instante de um desfecho seguro, mas o operador freia tarde e há contato. O atraso é humano, não do sistema.
_Evitar_: Alerta atrasado.

**Modo cabine**:
Câmera em primeira pessoa no assento do operador, com olhar livre limitado. É uma câmera, não muda os dados do cenário.
_Evitar_: Simulador em primeira pessoa (quando se refere só à câmera).

**Condução livre**:
O operador dirige com o controle, sem roteiro. Não grava episódio, e o que aparece na tela é rotulado SIMULADO.
_Evitar_: Case livre, desfecho manual.

## Pessoas do seguro rural

**Segurado**:
O produtor rural titular da apólice. É dono da máquina e do resultado, mesmo quando não a dirige. Hoje não tem visão própria no LUCA-AI: vê o mesmo painel SOMPO que qualquer conta.
_Evitar_: Cliente, usuário, operador (quando se refere ao titular).

**Operador**:
Quem dirige a máquina no campo. Pode ser o próprio segurado ou um funcionário. É quem recebe o alerta na cabine.
_Evitar_: Segurado, motorista (em máquina agrícola).

**Seguradora**:
A Sompo vendo o painel: casos de exemplo, dados públicos do setor, frota e episódios. Não há carteira real de apólices no app.
_Evitar_: Carteira da Sompo (para os casos de exemplo).
