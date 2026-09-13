import {readFileSync,writeFileSync,readdirSync} from 'node:fs';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';import assert from 'node:assert/strict';
const release=JSON.parse(readFileSync('.scratch/sompo-motion/release.json'));
const curl=url=>execFileSync('curl',['-fSs','--max-time','40',url],{maxBuffer:16*1024*1024});
const health=JSON.parse(curl('https://luca-ai.com.br/api/health'));assert.equal(health.ok,true);
const html=curl('https://luca-ai.com.br/sompo/?aba=telemetria').toString();
const local=readFileSync('dist/index.html','utf8');const entry=local.match(/src="(\/assets\/index-[^"]+\.js)"/)[1];assert.ok(html.includes(entry));
const names=[release.simulatorAsset,entry,...readdirSync('dist/assets').filter(x=>/^SompoTruckSimulator-.*\.css$/.test(x)||/^createSompoTruckModel-.*\.js$/.test(x)).map(x=>'/assets/'+x),'/models/sompo/generated-agri-tractor.glb','/models/sompo/generated-agri-harvester.glb'];
const assets=[];
for(const asset of names){const expected=readFileSync((asset.startsWith('/assets/')?'dist':'public')+asset),actual=curl('https://luca-ai.com.br'+asset);assert.equal(actual.length,expected.length,asset);assert.deepEqual(actual,expected,asset);assets.push({path:asset,bytes:actual.length,sha256:createHash('sha256').update(actual).digest('hex')});}
const remote=execFileSync('ssh',['-o','BatchMode=yes','sennin-kvm','readlink -f /opt/sennin/luca-ai/current; systemctl is-active luca-ai.service cloudflared-luca-ai.service'],{encoding:'utf8'}).trim().split('\n');assert.equal(remote[0],'/opt/sennin/luca-ai/releases/'+release.release);assert.deepEqual(remote.slice(1),['active','active']);
const result={verifiedAt:new Date().toISOString(),release:release.release,health,remote,entry,assets};writeFileSync('.scratch/sompo-motion/production-verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
