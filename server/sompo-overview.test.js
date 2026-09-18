import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

test('overview keeps the complete vehicle within the frame at desktop and phone aspect ratios', async () => {
  const result = await build({entryPoints:[new URL('../src/components/sompo/fitSompoOverview.ts',import.meta.url).pathname], bundle:true,write:false,format:'esm',platform:'node'});
  const {sompoOverviewOffset,SOMPO_OVERVIEW_BOUNDS:bounds,SOMPO_OVERVIEW_TARGET:target} = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
  const THREE = await import('three');
  for (const aspect of [0.45,0.75,1.05,16/9,2.4]) {
    const fov=Math.min(58,THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(16))*Math.max(1,1.18/aspect))));
    const camera=new THREE.PerspectiveCamera(fov,aspect,.1,360);
    camera.position.copy(target).add(sompoOverviewOffset(aspect,fov));
    camera.lookAt(target);camera.updateMatrixWorld();
    assert.ok(camera.position.distanceTo(target)<48,'must remain inside orbit limits');
    for(const x of [bounds.min.x,bounds.max.x]) for(const y of [bounds.min.y,bounds.max.y]) for(const z of [bounds.min.z,bounds.max.z]) {
      const p=new THREE.Vector3(x,y,z).project(camera);
      assert.ok(Math.abs(p.x)<=.821 && Math.abs(p.y)<=.721 && p.z<1,`clipped corner at aspect ${aspect}: ${p.toArray()}`);
    }
  }
});
