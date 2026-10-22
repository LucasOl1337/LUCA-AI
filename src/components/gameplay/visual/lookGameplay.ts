/**
 * Look do mundo do Gameplay: fim de tarde quente com contraste de filme.
 *
 * No Totem o gameplay roda quase sempre no degrau 1 (sem pós e sem sombras):
 * o grade do pós nunca aparecia e o campo ficava chapado, com céu e lavoura no
 * mesmo meio-tom. Aqui o grade entra dentro do tone mapping (CustomToneMapping:
 * ACES + saturação, curva S, altas quentes, sombras frias), que todo material
 * já executa, então vale em qualquer degrau sem passe extra. Com o pós ligado,
 * o passe de grade dele é desligado para não graduar duas vezes. A vinheta é
 * um gradiente CSS sobre o canvas (custo zero na GPU do quadro 3D).
 *
 * Por quadro, depois da atmosfera: sol mais quente e forte, ambiente menor
 * (a luz rasante desenha volume na lavoura) e névoa dourada mais perto, que
 * separa em camadas o talhão, o quebra-vento e as serras.
 */
import * as THREE from 'three';
import type { SompoLook, SompoLookContexto } from '../../sompo/createSompoAgriStage';

export const LOOK_GAMEPLAY = {
  sol: '#ffbf7a',
  forcaSol: 5.4,
  ambiente: 0.27,
  exposicao: 1.02,
  nevoa: '#d8c39c',
  nevoaPerto: 22,
  nevoaLonge: 330,
  /**
   * Altura relativa do milho (o trator do case usa 0,32: muda recém-emergida).
   * 0,48 dá ~0,75 m: lavoura fechada sem esconder o fardo do desafio (1,44 m).
   */
  alturaLavoura: 0.48,
} as const;

const MARCA = '/*gameplay-look-v1*/';
const ORIGINAL = 'vec3 CustomToneMapping( vec3 color ) { return color; }';

/** Corpo do CustomToneMapping: ACES do three e o grade em espaço perceptual. */
export const GRADE_GLSL = `${MARCA}
vec3 CustomToneMapping( vec3 color ) {
  vec3 c = ACESFilmicToneMapping( color );
  vec3 g = pow( max( c, vec3( 0.0 ) ), vec3( 1.0 / 2.2 ) );
  float l = dot( g, vec3( .2126, .7152, .0722 ) );
  g = mix( vec3( l ), g, 1.24 );
  g = mix( g, g * g * ( 3.0 - 2.0 * g ), .38 );
  g *= mix( vec3( 1.0 ), vec3( 1.09, 1.0, .84 ), smoothstep( .4, 1.0, l ) * .75 );
  g *= mix( vec3( 1.0 ), vec3( .88, .96, 1.08 ), smoothstep( .45, 0.0, l ) * .6 );
  g = max( g, vec3( .018, .02, .028 ) );
  g = g - max( g - .86, 0.0 ) * .5;
  return pow( clamp( g, 0.0, 1.0 ), vec3( 2.2 ) );
}`;

/** Troca o CustomToneMapping vazio do three pelo grade; idempotente. */
export function instalarGradeToneMapping() {
  const chunk = THREE.ShaderChunk.tonemapping_pars_fragment;
  if (chunk.includes(MARCA)) return true;
  if (!chunk.includes(ORIGINAL)) return false;
  THREE.ShaderChunk.tonemapping_pars_fragment = chunk.replace(ORIGINAL, GRADE_GLSL);
  return true;
}

export function criarLookGameplay(ctx: SompoLookContexto): SompoLook {
  const { renderer, scene, sun, mount, night } = ctx;
  const toneAnterior = renderer.toneMapping;
  const instalado = instalarGradeToneMapping();
  if (instalado) {
    renderer.toneMapping = THREE.CustomToneMapping;
    ctx.setPostGrade(false);
  }
  const vinheta = typeof document !== 'undefined' ? document.createElement('div') : null;
  if (vinheta) {
    vinheta.className = 'gameplay-look-vinheta';
    vinheta.setAttribute('aria-hidden', 'true');
    mount.appendChild(vinheta);
  }
  const cor = new THREE.Color(LOOK_GAMEPLAY.sol);
  return {
    quadro() {
      if (night) return;
      sun.color.copy(cor);
      sun.intensity = LOOK_GAMEPLAY.forcaSol;
      scene.environmentIntensity = LOOK_GAMEPLAY.ambiente;
      renderer.toneMappingExposure *= LOOK_GAMEPLAY.exposicao;
      if (scene.fog instanceof THREE.Fog) {
        scene.fog.color.set(LOOK_GAMEPLAY.nevoa);
        scene.fog.near = LOOK_GAMEPLAY.nevoaPerto;
        scene.fog.far = LOOK_GAMEPLAY.nevoaLonge;
      }
    },
    dispose() {
      vinheta?.remove();
      if (instalado) {
        renderer.toneMapping = toneAnterior;
        ctx.setPostGrade(true);
      }
    },
  };
}

/** O que o GameplayComCabine passa ao palco (constante: não remonta). */
export const MUNDO_GAMEPLAY = { look: criarLookGameplay, alturaLavoura: LOOK_GAMEPLAY.alturaLavoura } as const;
