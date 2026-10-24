import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const origem = fs.readFileSync(new URL('../src/components/gameplay/somMotor.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(origem.replace("import { somCompartilhado, type SomCompartilhado } from './somCompartilhado';", 'const somCompartilhado = {};'), { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText;
const { parametrosMotor, fecharLoop, criarSomMotor } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const estado = (acelerador = 0, velocidadeKph = 0, freio = 0, fase = 'dirigindo') => ({ comandos: { acelerador, freio }, maquina: { velocidadeKph }, tetoKph: 12, fase });

test('lenta e crescimento estrito com acelerador/velocidade; freio reduz carga, ganho e rate', () => {
 const lenta = parametrosMotor(estado());
 assert.equal(lenta.carga, 0); assert.ok(lenta.ganho > 0);
 const media = parametrosMotor(estado(0.5));
 const alta = parametrosMotor(estado(1));
 const andando = parametrosMotor(estado(1, 12));
 assert.ok(lenta.rate < media.rate && media.rate < alta.rate && alta.rate < andando.rate);
 assert.ok(lenta.ganho < media.ganho && media.ganho < alta.ganho && alta.ganho < andando.ganho);
 const freando = parametrosMotor(estado(1, 12, 1));
 assert.ok(freando.rate < andando.rate && freando.ganho < andando.ganho);
});

test('overlap faz borda final convergir à amostra seguinte ao início, sem pulo de origem', () => {
 const fonte = Float32Array.from([0,0.2,0.4,0.6,0.8,1,0.8,0.6,0.4,0.2,0,-1]);
 const criar = (c, n, rate) => { const a = new Float32Array(n); return { numberOfChannels:c,length:n,sampleRate:rate,getChannelData:()=>a }; };
 const original = { numberOfChannels:1,length:fonte.length,sampleRate:20,getChannelData:()=>fonte };
 const loop = fecharLoop({createBuffer:criar}, original);
 assert.equal(loop.length,9);
 assert.ok(Math.abs(loop.getChannelData(0)[8] - loop.getChannelData(0)[0]) < Math.abs(fonte.at(-1) - fonte[0]));
});

test('fontes só durante corrida; pausa/fim/saída param, não mudam ganho da voz', async () => {
 let fontes = [], volume = [];
 const parametro = () => ({value:0,setTargetAtTime:(v)=>volume.push(v)});
 const buffer = {numberOfChannels:1,length:24000,sampleRate:24000,getChannelData:()=>new Float32Array(24000)};
 const ctx = {state:'running',currentTime:0,destination:{},createBuffer:()=>buffer,decodeAudioData:async()=>buffer,
 createGain:()=>({gain:parametro(),connect(){},disconnect(){}}),
 createBufferSource:()=>{const f={playbackRate:parametro(),connect(){},disconnect(){},start(){this.iniciou=true},stop(){this.parou=true}}; fontes.push(f); return f;}};
 const anterior = globalThis.fetch;
 globalThis.fetch = async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(2)});
 try {
 const motor=criarSomMotor({obter:()=>ctx,destravar:async()=>true,destino:()=>{throw Error('não usar gate efeitos')}});
 await motor.carregar();
 motor.atualizar(estado(0,0,0,'pronto')); assert.equal(fontes.length,0);
 motor.atualizar(estado()); assert.equal(fontes.length,2);
 motor.atualizar(estado(),true); assert.ok(fontes.every(f=>f.parou));
 motor.atualizar(estado(1)); assert.equal(fontes.length,4);
 motor.atualizar(estado(0,0,0,'fim')); assert.ok(fontes.every(f=>f.parou));
 motor.desmontar(); motor.atualizar(estado(1)); assert.equal(fontes.length,4);
 assert.ok(volume.length>0);
 } finally {globalThis.fetch=anterior;}
});

test('corridas seguidas no mesmo contexto decodificam os loops do motor uma vez só', async () => {
 let decodes = 0, baixados = 0;
 const buffer = {numberOfChannels:1,length:24000,sampleRate:24000,getChannelData:()=>new Float32Array(24000)};
 const ctx = {state:'running',currentTime:0,destination:{},createBuffer:()=>buffer,decodeAudioData:async()=>{decodes++; return buffer;}};
 const anterior = globalThis.fetch;
 globalThis.fetch = async()=>{baixados++; return {ok:true,arrayBuffer:async()=>new ArrayBuffer(2)};};
 try {
  const som = {obter:()=>ctx,destravar:async()=>true};
  for (let corrida = 0; corrida < 5; corrida++) { const motor = criarSomMotor(som); await motor.carregar(); motor.desmontar(); }
  assert.equal(decodes, 2); assert.equal(baixados, 2);
 } finally {globalThis.fetch=anterior;}
});

test('falha ao baixar os loops não fica presa: a próxima corrida tenta de novo', async () => {
 let tentativas = 0;
 const buffer = {numberOfChannels:1,length:24000,sampleRate:24000,getChannelData:()=>new Float32Array(24000)};
 const ctx = {state:'running',currentTime:0,destination:{},createBuffer:()=>buffer,decodeAudioData:async()=>buffer};
 const anterior = globalThis.fetch;
 globalThis.fetch = async()=>{tentativas++; return tentativas <= 2 ? {ok:false} : {ok:true,arrayBuffer:async()=>new ArrayBuffer(2)};};
 try {
  const som = {obter:()=>ctx,destravar:async()=>true};
  await criarSomMotor(som).carregar();
  await new Promise((r) => setTimeout(r, 0));
  await criarSomMotor(som).carregar();
  assert.ok(tentativas >= 3);
 } finally {globalThis.fetch=anterior;}
});
