import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import * as THREE from 'three';

test('rural maize fills its world-anchored plots, leaves the pasture gaps open and remains grounded after travel and seek', async () => {
  const result = await build({entryPoints:[new URL('../src/components/sompo/createSompoRoadDetails.ts',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'three-singleton',setup(b){b.onResolve({filter:/^three(?:\/.*)?$/},args=>({path:import.meta.resolve(args.path),external:true}));}}]});
  const {createSompoRoadDetails}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
  const terrain = await build({entryPoints:[new URL('../src/components/sompo/createSompoTerrain.ts',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'three-singleton',setup(b){b.onResolve({filter:/^three(?:\/.*)?$/},args=>({path:import.meta.resolve(args.path),external:true}));}}]});
  const {sompoIsCornX,SOMPO_WORLD_PERIOD}=await import(`data:text/javascript;base64,${Buffer.from(terrain.outputFiles[0].contents).toString('base64')}`);
  const saved=globalThis.document;
  const context={createRadialGradient:()=>({addColorStop(){}}),fillRect(){}};
  const canvas=()=>({getContext:()=>context,cloneNode:canvas});
  globalThis.document={createElement:canvas};
  const root=new THREE.Group();
  let details;
  try {
    details=createSompoRoadDetails(root);
    const near=root.getObjectByName('row-crop-field-near');
    const matrix=new THREE.Matrix4(), position=new THREE.Vector3();
    const half=SOMPO_WORLD_PERIOD/2;
    let baseline;
    for(const truckX of [0,115,241,2000,0]) {
      details.update(6000,false,false,truckX);
      const bins=new Map();
      for(let i=0;i<near.count;i++) {
        near.getMatrixAt(i,matrix);position.setFromMatrixPosition(matrix);
        assert.ok(Math.abs(position.x-truckX)<=half+0.001,'plant outside wrapping period');
        assert.ok(sompoIsCornX(position.x,-3),`plant in a pasture gap at ${position.x}`);
        const bin=Math.floor(position.x/20);bins.set(bin,(bins.get(bin)??0)+1);
        const scale=new THREE.Vector3().setFromMatrixScale(matrix);
        assert.ok(scale.x/scale.y>.84 && scale.x/scale.y<1.07,'normalized leaves must not be squeezed when plant height doubles');
        assert.ok(Number.isFinite(position.y));
      }
      // Every 20 m bin that lies wholly inside a plot is planted: no moving bare gap.
      let checked=0;
      for(let x=Math.ceil((truckX-half)/20)*20;x+20<=truckX+half;x+=20) {
        if(sompoIsCornX(x,-4)&&sompoIsCornX(x+10,-4)&&sompoIsCornX(x+19.9,-4)&&sompoIsCornX(x,4)&&sompoIsCornX(x+19.9,4))
          { checked++; assert.ok((bins.get(x/20)??0)>60,`bare section of plot at ${x} (truck ${truckX})`); }
      }
      assert.ok(checked>=10,`only ${checked} plot bins checked`);
      if(truckX===0) {
        if(baseline) assert.deepEqual(near.instanceMatrix.array,baseline,'seeking back must restore exact placement');
        else baseline=near.instanceMatrix.array.slice();
      }
    }
  } finally {
    details?.dispose();
    root.traverse(node=>{if(node.isMesh){node.geometry.dispose();for(const m of [].concat(node.material))m.dispose();}});
    if(saved===undefined) delete globalThis.document; else globalThis.document=saved;
  }
});
