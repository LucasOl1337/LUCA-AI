import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import * as THREE from 'three';

test('rural maize covers the complete wrapping period and remains grounded after travel and seek', async () => {
  const result = await build({entryPoints:[new URL('../src/components/sompo/createSompoRoadDetails.ts',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'three-singleton',setup(b){b.onResolve({filter:/^three(?:\/.*)?$/},args=>({path:import.meta.resolve(args.path),external:true}));}}]});
  const {createSompoRoadDetails}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
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
    let baseline;
    for(const truckX of [0,115,241,2000,0]) {
      details.update(6000,false,false,truckX);
      const bins=Array(12).fill(0);
      for(let i=0;i<near.count;i++) {
        near.getMatrixAt(i,matrix);position.setFromMatrixPosition(matrix);
        const relative=position.x-truckX;
        assert.ok(Math.abs(relative)<=120.001,'plant outside wrapping period');
        bins[Math.min(11,Math.floor((relative+120)/20))]++;
        const scale=new THREE.Vector3().setFromMatrixScale(matrix);
        assert.ok(scale.x/scale.y>.84 && scale.x/scale.y<1.07,'normalized leaves must not be squeezed when plant height doubles');
        assert.ok(Number.isFinite(position.y));
      }
      assert.ok(bins.every(count=>count>60),`bare section of field at ${truckX}: ${bins}`);
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
