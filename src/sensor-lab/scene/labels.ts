import * as THREE from 'three';

/**
 * Etiquetas em pílula presas às peças 3D. Ficam no DOM (texto nítido, leitor
 * de tela e seleção funcionam) e são reposicionadas a cada quadro pela
 * projeção da âncora. Cada etiqueta declara em que vistas aparece.
 */

export interface LabelSpec {
  id: string;
  title: string;
  object: THREE.Object3D;
  views: readonly string[];
  detail?: () => string;
  when?: () => boolean;
  tone?: 'plus' | 'minus' | 'force' | 'coriolis' | 'danger' | 'neutral';
}

export interface LabelLayer {
  update(camera: THREE.Camera, width: number, height: number, view: string, now: number): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}

export function createLabelLayer(container: HTMLElement, specs: LabelSpec[]): LabelLayer {
  const layer = document.createElement('div');
  layer.className = 'sensor-tags';
  layer.setAttribute('aria-hidden', 'true');
  container.appendChild(layer);
  const world = new THREE.Vector3();
  const entries = specs.map((spec) => {
    const element = document.createElement('div');
    element.className = `sensor-tag tone-${spec.tone ?? 'neutral'}`;
    const dot = document.createElement('i');
    const title = document.createElement('b');
    title.textContent = spec.title;
    const detail = document.createElement('span');
    element.append(dot, title, detail);
    layer.appendChild(element);
    return { spec, element, detail, shown: false, text: '', x: -1, y: -1, width: 0 };
  });
  let lastDetail = 0;
  let visible = true;

  return {
    update(camera, width, height, view, now) {
      const refreshDetail = now - lastDetail > 0.12;
      if (refreshDetail) lastDetail = now;
      for (const entry of entries) {
        const { spec, element } = entry;
        let show = visible && (spec.views.includes(view) || spec.views.includes('*')) && (spec.when?.() ?? true);
        if (show) {
          spec.object.getWorldPosition(world);
          world.project(camera);
          show = world.z > -1 && world.z < 1 && Math.abs(world.x) < 0.96 && Math.abs(world.y) < 0.92;
          if (show) {
            // A pílula cresce para a direita: perto da borda, recua para caber inteira.
            if (!entry.width) entry.width = element.offsetWidth;
            const x = Math.min(Math.round((world.x * 0.5 + 0.5) * width), width - entry.width - 4);
            const y = Math.round((-world.y * 0.5 + 0.5) * height);
            if (x !== entry.x || y !== entry.y) {
              element.style.transform = `translate3d(${x}px, ${y}px, 0)`;
              entry.x = x; entry.y = y;
            }
          }
        }
        if (show !== entry.shown) {
          element.classList.toggle('shown', show);
          entry.shown = show;
        }
        if (show && refreshDetail && spec.detail) {
          const text = spec.detail();
          if (text !== entry.text) { entry.detail.textContent = text; entry.text = text; entry.width = 0; }
        }
      }
    },
    setVisible(value) {
      visible = value;
    },
    dispose() {
      layer.remove();
    },
  };
}
