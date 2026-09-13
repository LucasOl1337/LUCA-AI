import {chromium} from 'playwright';
import {spawn,execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
const out='.scratch/sompo-motion/evidence';mkdirSync(out,{recursive:true});
let browser,server;
try {
 execFileSync('hyprctl',['eval','if not sompo_studio_qa_rule then sompo_studio_qa_rule=hl.window_rule({name="sompo-studio-qa-only",match={class="^sompo-studio-qa$"},workspace="7 silent",no_initial_focus=true,suppress_event="activate activatefocus"}) end']);
 server=spawn(process.execPath,['scripts/sompo-preview/serve.mjs'],{env:{...process.env,SOMPO_PREVIEW_PORT:'5199',SOMPO_PREVIEW_OUTPUT:'/tmp/sompo-motion-preview',SOMPO_PREVIEW_INSPECT:'1'},stdio:['ignore','pipe','inherit']});await new Promise((res,rej)=>{server.stdout.once('data',res);server.once('exit',rej);});
 browser=await chromium.launch({headless:false,executablePath:'/opt/google/chrome/chrome',args:['--class=sompo-studio-qa','--ozone-platform=x11','--use-angle=gl','--enable-gpu','--ignore-gpu-blocklist','--disable-backgrounding-occluded-windows','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>console.error('PAGE',e));
 const own=JSON.parse(execFileSync('hyprctl',['clients','-j'])).filter(x=>x.class==='sompo-studio-qa');if(!own.length||own.some(x=>x.workspace.id!==7))throw Error('Workspace 7 required');console.log('Workspace verified',own.map(x=>x.workspace.id));
 await page.goto('http://127.0.0.1:5199/?benchmark=1&offscreen=1');await page.locator('[data-sompo-model="modular"]').waitFor();
 for(const [id,time] of [['agri-harvest-dust',6000],['agri-hydraulic-failure',5500],['agri-field-bogging',8500],['agri-tractor-rollover',9500]]) {
  await page.locator('select[name="sompo-scenario"]').selectOption(id);await page.locator('[data-sompo-model="gltf"]').waitFor();await page.waitForTimeout(1200);
  await page.evaluate(ms=>{window.__sompoPreview.stepMs=100;window.__sompoPreview.advance(ms)},time);
  await page.waitForFunction(()=>window.__sompoPreview.time===window.__sompoPreview.until,null,{polling:50});
  await page.locator('[data-sompo-simulator]').screenshot({path:`${out}/${id}.png`});
  console.log(id,await page.evaluate(()=>{let f=window.__sompoPreview;let m=f.scene.getObjectByName('sompo-agri-machine');let wheels=[];f.scene.traverse(x=>{if(x.name.startsWith('agri-wheel-')&&x.isGroup)wheels.push({name:x.name,spin:x.rotation.z,vertices:x.children[0]?.geometry?.attributes.position.count})});return{position:m.position.toArray(),rotation:m.rotation.toArray(),wheels,metrics:f.measure().triangles}}));
 }
} finally {await browser?.close();server?.kill();}
