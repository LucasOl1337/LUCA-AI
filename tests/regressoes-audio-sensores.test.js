import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadFrontendModule } from './support/load-frontend-module.js';
const { VitrineStand } = await loadFrontendModule('../../src/components/stand/Modos.tsx');
const { CircuitoHud } = await loadFrontendModule('../../src/components/gameplay/CircuitoHud.tsx');
const { criarMotorGameplay } = await loadFrontendModule('../../src/components/gameplay/motorGameplay.ts');
const { criarSessaoCircuito } = await loadFrontendModule('../../src/components/gameplay/sessaoCircuito.ts');
const { INICIO_CIRCUITO } = await loadFrontendModule('../../src/components/gameplay/circuito.ts');
const item = { tipo:'video',titulo:'Pipeline',video:{id:'pipeline-completo',arquivo:'/stand/videos/pipeline-completo.mp4',titulo:'Pipeline'}};
test('Vitrine narrada não pode ser silenciada pela escuta e oferece controle de som acessível',()=>{
 const html=renderToStaticMarkup(React.createElement(VitrineStand,{item,pausado:false,semSom:true,aoTerminar(){}}));
 assert.ok(!/<video[^>]*muted/.test(html),html);
 assert.match(html,/aria-label="[^"]*som/i);
});
test('circuito mantém mapa vivo à direita e leituras nomeadas com unidades, não só velocidade',()=>{
 const motor=criarMotorGameplay();motor.reiniciar(INICIO_CIRCUITO);const sessao=criarSessaoCircuito();
 const html=renderToStaticMarkup(React.createElement(CircuitoHud,{motor,sessao,menu:false,aoMenu(){},aoAnalisar(){},aoNovo(){},touch(){}}));
 assert.match(html,/Mapa do talhão/);assert.match(html,/Sensor frontal/);assert.match(html,/Inclinação/);assert.match(html,/20°/);assert.match(html,/Sem obstáculo/);assert.match(html,/Geofence/);
});
