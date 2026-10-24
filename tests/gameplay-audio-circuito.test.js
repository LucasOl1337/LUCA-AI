import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFrontendModule } from './support/load-frontend-module.js';
const { criarAudioCircuito } = await loadFrontendModule('../../src/components/gameplay/audioCircuito.ts');
const { ALARMES } = await loadFrontendModule('../../src/components/gameplay/timbreAlarme.ts');
const { criarMotorGameplay } = await loadFrontendModule('../../src/components/gameplay/motorGameplay.ts');
const { INICIO_CIRCUITO, criarCircuito } = await loadFrontendModule('../../src/components/gameplay/circuito.ts');
const { relevoRampaLateral } = await loadFrontendModule('../../src/components/gameplay/rampaLateral.ts');
const { geofenceTalhao } = await loadFrontendModule('../../src/components/gameplay/geofenceTalhao.ts');
function audioFixture(){const scheduled=[];const param={value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},cancelScheduledValues(){}};const gain={gain:param,connect(){return this},disconnect(){}};
 // `hz` = primeira frequência agendada (fundamental do primeiro pulso da rajada).
 const ctx={state:'running',currentTime:0,destination:{},createPeriodicWave(){return {}},createOscillator(){const o={frequency:{...param,setValueAtTime(hz){o.hz??=hz}},setPeriodicWave(){},connect(){return gain},disconnect(){},start(){scheduled.push(o)},stop(){o.stopped=true}};return o},createGain(){return gain}};
 return {scheduled,motor:criarAudioCircuito({obter:()=>ctx,destravar:async()=>true})};}
function pilot(m,alvo){const e=m.ler(),h=e.maquina.rumoGraus*Math.PI/180,d=-Math.atan2(alvo.z-e.maquina.z,alvo.x-e.maquina.x),err=Math.atan2(Math.sin(d-h),Math.cos(d-h));return{esterco:Math.max(-1,Math.min(1,-err*2.4)),acelerador:.5,freio:0};}
test('sons são finitos, silenciosos fora do risco e interrompidos por pausa/mute/fim',()=>{
 const m=criarMotorGameplay();m.reiniciar(INICIO_CIRCUITO);const {scheduled,motor:a}=audioFixture();
 a.atualizar(m.ler(),0);assert.equal(scheduled.length,0);
 let e=m.ler();for(let i=0;i<1800&&!e.sensor.eco;i++)e=m.quadro(1/60,{acelerador:1,freio:0,esterco:0},relevoRampaLateral);
 assert.ok(e.sensor.eco);a.atualizar(e,1000);assert.equal(scheduled.length,1);assert.equal(scheduled[0].hz,ALARMES.proximidade.hz);
 a.atualizar(e,1100);assert.equal(scheduled.length,1,'cooldown sem repetição por frame');
 a.atualizar(e,1200,true);assert.ok(scheduled.every(o=>o.stopped));
 a.habilitar(false);a.atualizar(e,5000);assert.equal(scheduled.length,1);
 a.habilitar(true);a.atualizar({...e,fase:'fim'},6000);assert.equal(scheduled.length,1);
});
test('água aproximação/entrada e tom usam a mesma geometria dirigindo desde a partida',()=>{
 const m=criarMotorGameplay();m.reiniciar(INICIO_CIRCUITO);const c=criarCircuito('agua-real','2026-10-22');const {scheduled,motor:a}=audioFixture();
 // Contorna a estaca em (0,5); o objetivo deste caso é o alerta de água.
 const targets=[{x:-4,z:10},{x:15,z:15},{x:30,z:15}];let target=0;const niveis=new Set();
 for(let i=0;i<4000&&!c.registro.resultado;i++){const e0=m.ler();if(target<2&&Math.hypot(e0.maquina.x-targets[target].x,e0.maquina.z-targets[target].z)<3)target++;
 const e=m.quadro(1/60,pilot(m,targets[target]),relevoRampaLateral);const g=geofenceTalhao(e.maquina);niveis.add(g.nivel);a.atualizar(e,i*1000/60);c.quadro(e,1000/60,'2026-10-22');}
 assert.ok(niveis.has('rumo'));assert.ok(niveis.has('dentro'));assert.ok(scheduled.some(o=>o.hz===ALARMES.zona.hz));assert.equal(c.registro.resultado.motivo,'atolamento');
});
test('histerese de saída evita repetição no limiar e rearma após 600ms fora',()=>{
 const m=criarMotorGameplay();const e={...m.ler(),fase:'dirigindo',maquina:{...m.ler().maquina,velocidadeKph:3},sensor:{eco:true,alerta:false,distanciaCm:250}};
 const {motor:a,scheduled}=audioFixture();a.atualizar(e,0);a.atualizar({...e,sensor:{...e.sensor,eco:false}},20);a.atualizar(e,100);assert.equal(scheduled.length,1);
 a.atualizar({...e,sensor:{...e.sensor,eco:false}},200);a.atualizar({...e,sensor:{...e.sensor,eco:false}},810);a.atualizar(e,820);assert.equal(scheduled.length,2);
});
