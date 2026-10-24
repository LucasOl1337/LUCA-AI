import { chromium } from 'playwright';
import fs from 'node:fs';
const dir='/home/lol/relatorios/luca-circuito-20261022';
const b=await chromium.connectOverCDP('http://127.0.0.1:19081');
let p;
for(const c of b.contexts()) for(const q of c.pages()) {const s=await c.newCDPSession(q);const {targetInfo}=await s.send('Target.getTargetInfo');await s.detach();if(targetInfo.targetId==='1A717D4D15BEE547DB4357EE315790EC')p=q;}
if(!p)throw Error('target mission absent');
const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.addInitScript(()=>{
 window.__input={axes:[0,0,0,0],buttons:Array.from({length:17},()=>({value:0,pressed:false}))};
 Object.defineProperty(navigator,'getGamepads',{value:()=>[{mapping:'standard',connected:true,...window.__input}]});
 window.__raf=new Set();const raf=window.requestAnimationFrame.bind(window),cancel=window.cancelAnimationFrame.bind(window);
 window.requestAnimationFrame=(fn)=>{const id=raf(t=>{window.__raf.delete(id);fn(t)});window.__raf.add(id);return id};
 window.cancelAnimationFrame=(id)=>{window.__raf.delete(id);cancel(id)};
 window.__cameraCalls=0;if(navigator.mediaDevices){navigator.mediaDevices.getUserMedia=async()=>{window.__cameraCalls++;throw new DOMException('Fixture câmera negada','NotAllowedError')}}
});
const results=[];
for(const [width,height,kind] of [[1920,1080,'chegada'],[1366,768,'colisao']]) {
 await p.setViewportSize({width,height});await p.goto('http://127.0.0.1:4317/circuito-fixture');
 await p.locator('[data-gameplay] canvas').waitFor();
 await p.locator('.gameplay-kiosk-palco[data-modelo=gltf]').waitFor({timeout:45000});
 await p.screenshot({path:`${dir}/hud-${width}-limpo.png`});
 const rota=[{x:-12,z:0},{x:0,z:0},{x:8,z:-5},{x:20,z:-7},{x:32,z:-14},{x:48,z:-10},{x:55,z:4},{x:65,z:13},{x:78,z:13}];
 const trace=[];const start=Date.now();let ended='';
 while(Date.now()-start<110000){
  const state=await p.locator('[data-gameplay]').evaluate(e=>({...e.dataset}));trace.push({at:Date.now()-start,...state});
  ended=await p.locator('[data-circuito-hud]').getAttribute('data-resultado');if(ended!=='dirigindo')break;
  let turn=0;
  if(kind==='chegada'){
   const alvo=Number(state.marco)>=rota.length ? {x:82,z:13} : rota[Math.min(Number(state.marco||1),8)],h=Number(state.rumoGraus||0)*Math.PI/180;
   const desejado=-Math.atan2(alvo.z-Number(state.zM),alvo.x-Number(state.xM));
   const error=Math.atan2(Math.sin(desejado-h),Math.cos(desejado-h));
   turn=Math.max(-1,Math.min(1,-error*2.4));
  }
  const axis=Math.sign(turn)*(.12+.88*Math.abs(turn)**(1/1.8));
  await p.evaluate(({axis})=>{window.__input.axes[0]=axis;window.__input.buttons[7]={value:.65,pressed:true}},{axis});
  await new Promise(r=>setTimeout(r,65));
 }
 await p.evaluate(()=>{window.__input.buttons[7]={value:0,pressed:false};window.__input.axes[0]=0});
 await p.screenshot({path:`${dir}/resultado-${kind}-${width}.png`});
 if(ended!==kind)throw Error(`desfecho esperado ${kind}, veio ${ended}: ${JSON.stringify(trace.at(-1))}`);
 await p.getByRole('button',{name:'Analisar na bancada de agentes'}).click();
 await p.locator('[data-chat-circuito]').waitFor();
 await new Promise(r=>setTimeout(r,100));
 const disposal=await p.evaluate(()=>({canvas:document.querySelectorAll('canvas').length,raf:window.__raf.size,cameraCalls:window.__cameraCalls,run:JSON.parse(sessionStorage.getItem('luca.circuito.chat.v1')).relatorio.registro}));
 if(disposal.canvas!==0||disposal.raf!==0||disposal.cameraCalls!==0)throw Error(`recursos não liberados ${JSON.stringify(disposal)}`);
 await p.getByRole('button',{name:'Enviar para análise',exact:true}).click();
 await p.getByText(/FIXTURE LOCAL — agente de teste recebeu run/).first().waitFor({timeout:20000});
 await p.screenshot({path:`${dir}/chat-${kind}-${width}.png`});
 const chat=await p.locator('[data-chat-circuito]').innerText();
 const before=JSON.parse(await p.evaluate(()=>sessionStorage.getItem('luca.circuito.chat.v1')));
 await p.reload();await p.locator('[data-chat-circuito]').waitFor();
 await p.getByText(/FIXTURE LOCAL — agente de teste recebeu run/).first().waitFor({timeout:10000});
 const after=JSON.parse(await p.evaluate(()=>sessionStorage.getItem('luca.circuito.chat.v1')));
 if(before.casoId!==after.casoId)throw Error('Case id changed');
 results.push({width,height,kind,ended,disposal,chat,trace,caseId:after.casoId});
 await p.getByRole('button',{name:'Voltar · nova corrida'}).click();
 await p.locator('[data-gameplay]').waitFor();
 await p.goto('about:blank');
}
fs.writeFileSync(`${dir}/browser-resultados.json`,JSON.stringify({results,errors},null,2));
console.log(JSON.stringify({results:results.map(r=>({kind:r.kind,width:r.width,elapsedMs:r.disposal.run.elapsedMs,episodios:r.disposal.run.episodios,caseId:r.caseId,disposal:{canvas:r.disposal.canvas,raf:r.disposal.raf,cameraCalls:r.disposal.cameraCalls}})),errors},null,2));
await b.close();
