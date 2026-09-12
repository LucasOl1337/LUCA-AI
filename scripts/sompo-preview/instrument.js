// Test-only clock and WebGL counters; excluded from the application bundle.
const realNow = performance.now.bind(performance);
// In an invisible QA workspace Chromium can suspend compositor rAF entirely.
// An explicit fixture-only timer keeps identical moving renders measurable there.
// Presentation FPS from this mode is not a product FPS measurement.
const offscreen = new URLSearchParams(location.search).has('offscreen');
const rawRaf = offscreen ? callback => window.setTimeout(callback, 16) : window.requestAnimationFrame.bind(window);
if (offscreen) {
  window.cancelAnimationFrame = id => window.clearTimeout(id);
  Object.defineProperty(document, 'hidden', { get: () => false });
  Object.defineProperty(document, 'visibilityState', { get: () => 'visible' });
}
const fixture = window.__sompoPreview = { controlled: new URLSearchParams(location.search).has('benchmark'), time: 1000, until: 1000, samples: [], frames: [], metrics: [], draws: 0, triangles: 0, resources: { textures: 0, buffers: 0 }, snapshot: null };
performance.now = () => fixture.controlled ? fixture.time : realNow();
window.requestAnimationFrame = callback => rawRaf(() => {
  const start = realNow();
  fixture.time = fixture.controlled ? Math.min(fixture.until, fixture.time + (fixture.stepMs || 1000 / 60)) : realNow();
  fixture.draws = 0; fixture.triangles = 0;
  callback(fixture.time);
  if (fixture.draws) {
    fixture.metrics.push({ logicalTime: fixture.time, at: start, cpuMs: realNow() - start, calls: fixture.draws, triangles: fixture.triangles });
    if (fixture.metrics.length > 2400) fixture.metrics.shift();
  }
});
const proto = WebGL2RenderingContext.prototype;
for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
  const original = proto[name];
  proto[name] = function(...args) { fixture.draws++; if (args[0] === this.TRIANGLES) fixture.triangles += args[name.startsWith('drawElements') ? 1 : 2] / 3 * (name.endsWith('Instanced') ? args[name === 'drawElementsInstanced' ? 4 : 3] : 1); return original.apply(this, args); };
}
for (const [kind, singular] of [['textures','Texture'],['buffers','Buffer']]) {
  const live = new Map();
  const watched = new WeakSet();
  const ids = new WeakMap();
  let nextId = 0;
  for (const action of ['create', 'delete']) {
    const name = action + singular; const original = proto[name];
    proto[name] = function(...args) {
      if (!watched.has(this)) {
        watched.add(this);
        this.canvas.addEventListener('webglcontextlost', () => {
          for (const [id, refs] of live) if (!refs.resource.deref() || refs.context.deref() === this) live.delete(id);
          fixture.resources[kind] = live.size;
        });
      }
      const result = original.apply(this,args);
      if (action === 'create' && result) { const id = ++nextId; ids.set(result,id); live.set(id,{resource:new WeakRef(result),context:new WeakRef(this)}); }
      else live.delete(ids.get(args[0]));
      for (const [id, refs] of live) if (!refs.resource.deref() || !refs.context.deref()) live.delete(id);
      fixture.resources[kind] = live.size;
      return result;
    };
  }
}
fixture.advance = ms => { fixture.controlled = true; fixture.until = fixture.time + ms; };
fixture.measure = () => {
  const frames = fixture.metrics.slice(-300);
  const stats = values => { const s = values.sort((a,b)=>a-b); return { median: s[Math.floor(s.length*.5)], p95: s[Math.floor(s.length*.95)] }; };
  const gl = document.querySelector('canvas').getContext('webgl2'); const debug = gl.getExtension('WEBGL_debug_renderer_info');
  return { scheduler: offscreen ? 'fixture timer 16ms; no presentation FPS claim' : 'native rAF', logicalRange: [frames[0]?.logicalTime, frames.at(-1)?.logicalTime], viewport: [innerWidth,innerHeight], dpr: devicePixelRatio, canvas: [gl.canvas.width,gl.canvas.height], renderer: debug && gl.getParameter(debug.UNMASKED_RENDERER_WEBGL), count: frames.length, intervalMs: stats(frames.slice(1).map((x,i)=>x.at-frames[i].at)), cpuMs: stats(frames.map(x=>x.cpuMs)), calls: stats(frames.map(x=>x.calls)), triangles: stats(frames.map(x=>x.triangles)), resources: fixture.resources, heap: performance.memory?.usedJSHeapSize, transferBytes: performance.getEntriesByType('resource').reduce((s,r)=>s+r.transferSize,0), loadedBytes: performance.getEntriesByType('resource').reduce((s,r)=>s+r.encodedBodySize,0), network: performance.getEntriesByType('resource').map(r=>({name:r.name,bytes:r.encodedBodySize,transferBytes:r.transferSize})), time: fixture.time, snapshot: fixture.snapshot };
};
