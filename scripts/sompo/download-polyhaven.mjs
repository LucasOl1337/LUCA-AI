import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=path.resolve('.dream-loop/roadway-rebuild/sources');
for(const id of process.argv.slice(2)) {
 const metadata=await fetch(`https://api.polyhaven.com/files/${id}`).then(r=>{if(!r.ok)throw Error(`${id}: ${r.status}`);return r.json()});
 const dir=path.join(root,id);await fs.mkdir(dir,{recursive:true});
 await fs.writeFile(path.join(dir,'files.json'),JSON.stringify(metadata,null,2));
 const asset=metadata.blend['1k'].blend;
 const files=[[path.basename(new URL(asset.url).pathname),asset],...Object.entries(asset.include)];
 for(let i=0;i<files.length;i+=4) await Promise.all(files.slice(i,i+4).map(async([name,file])=>{
  const dest=path.join(dir,name);await fs.mkdir(path.dirname(dest),{recursive:true});
  try{const old=await fs.readFile(dest);if(createHash('md5').update(old).digest('hex')===file.md5)return;}catch{}
  const res=await fetch(file.url);if(!res.ok)throw Error(`${name}: HTTP ${res.status}`);
  const bytes=Buffer.from(await res.arrayBuffer());
  if(createHash('md5').update(bytes).digest('hex')!==file.md5)throw Error('Checksum '+name);
  await fs.writeFile(dest,bytes);console.log(id,name,bytes.length);
 }));
}
