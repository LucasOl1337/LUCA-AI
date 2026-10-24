import { chromium } from 'playwright';
import fs from 'node:fs';
const dir='/home/lol/relatorios/luca-circuito-20261022';
const b=await chromium.connectOverCDP('http://127.0.0.1:19081');let p;
for(const c of b.contexts())for(const q of c.pages()){const s=await c.newCDPSession(q);const {targetInfo}=await s.send('Target.getTargetInfo');await s.detach();if(targetInfo.targetId==='1A717D4D15BEE547DB4357EE315790EC')p=q;}
if(!p)throw Error('target absent');
await p.route('**/api/auth/session',r=>r.fulfill({json:{user:null}}));
await p.addInitScript(()=>{window.__cameraCalls=0;navigator.mediaDevices.getUserMedia=async()=>{window.__cameraCalls++;throw new DOMException('Fixture negada','NotAllowedError')};window.__pad={connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({value:0,pressed:false}))};Object.defineProperty(navigator,'getGamepads',{value:()=>[window.__pad]})});
const results=[];
for(const [width,height] of [[1920,1080],[1366,768]]){
 await p.setViewportSize({width,height});await p.goto('http://127.0.0.1:4317/circuito-fixture?full=1&stub=1');
 await p.getByRole('button',{name:'Simulação',exact:true}).click();await p.getByRole('button',{name:'Começar · Enter / ✕ / A'}).click();
 await p.locator('[data-gameplay] canvas').waitFor();await p.locator('.gameplay-kiosk-palco[data-modelo=gltf]').waitFor({timeout:30000});
 const before=await p.evaluate(()=>window.__cameraCalls);
 await p.screenshot({path:`${dir}/stand-hud-${width}.png`});
 if(await p.getByRole('navigation',{name:'Modo do stand'}).count())throw Error('navbar presente');
 await p.keyboard.press('Escape');await p.getByRole('dialog',{name:'Opções do circuito'}).waitFor();
 const checkbox=p.getByRole('checkbox',{name:/Ativar webcam/});if(await checkbox.isChecked())throw Error('webcam ligada padrão');
 await checkbox.check();await p.locator('.gameplay-webcam[data-fase=erro]').waitFor({timeout:30000});
 const denied=await p.evaluate(()=>window.__cameraCalls);
 await p.screenshot({path:`${dir}/stand-sono-negada-${width}.png`});
 await p.getByRole('button',{name:/^Continuar/}).click();
 await p.keyboard.down('ArrowUp');await new Promise(r=>setTimeout(r,700));await p.keyboard.up('ArrowUp');
 await p.keyboard.down('Space');await new Promise(r=>setTimeout(r,500));await p.keyboard.up('Space');
 if(await p.locator('.gameplay-webcam').isVisible())throw Error('webcam negada encobre pista');
 await p.evaluate(()=>window.__pad.buttons[9]={value:1,pressed:true});await p.getByRole('dialog').waitFor();await p.evaluate(()=>window.__pad.buttons[9]={value:0,pressed:false});
 await p.getByRole('button',{name:'Abandonar esta corrida',exact:true}).click();await p.getByRole('button',{name:/Analisar na bancada/}).click();
 await p.locator('[data-chat-circuito]').waitFor();
 const r=JSON.parse(await p.evaluate(()=>sessionStorage.getItem('luca.circuito.chat.v1'))).relatorio.registro;
 const calls=await p.evaluate(()=>window.__cameraCalls);
 if(calls!==denied||denied!==before+1)throw Error(`retry indevido ${before},${denied},${calls}`);
 if(!r.pausas.length)throw Error('pausas ausentes');
 if(await p.locator('canvas').count())throw Error('canvas vivo');
 results.push({width,height,before,denied,calls,registro:r});
 await p.getByRole('button',{name:'Voltar · nova corrida'}).click();await p.locator('[data-gameplay]').waitFor();
 await p.goto('about:blank');
}
fs.writeFileSync(`${dir}/stand-browser.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));await b.close();
