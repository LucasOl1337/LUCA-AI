import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const roadScene = readFileSync(new URL('../src/components/sompo/createSompoRoadScene.ts', import.meta.url), 'utf8');
const ruralStage = readFileSync(new URL('../src/components/sompo/createSompoRuralStage.ts', import.meta.url), 'utf8');

function localXForBox(width, center) {
  return { near: center - width / 2, far: center + width / 2 };
}

test('doca e portão começam no plano físico usado pela âncora', () => {
  const dockFace = localXForBox(0.08, 0.04);
  const dockWall = localXForBox(0.34, 0.17);
  const gateBar = localXForBox(0.12, 0.06);

  assert.equal(dockFace.near, 0);
  assert.equal(dockWall.near, 0);
  assert.equal(gateBar.near, 0);
  assert.match(roadScene, /BoxGeometry\(0\.08, 3\.15, 3\.8\)[\s\S]*?\[0\.04, 1\.58, 0\]/);
  assert.match(roadScene, /BoxGeometry\(0\.12, 3\.1, 0\.09\)[\s\S]*?\[0\.06, 1\.58, index \* 0\.9\]/);
});

test('contato traseiro vira a superfície para fora do caminhão', () => {
  assert.match(ruralStage, /outcomeId === 'encosta-na-doca'[\s\S]*?gap: 0\.12[\s\S]*?facing: 'front'/);
  assert.match(ruralStage, /outcomeId === 'toque-no-portao'[\s\S]*?gap: 0[\s\S]*?facing: 'front'/);
  assert.match(ruralStage, /outcomeId === 'toque-na-doca'[\s\S]*?gap: 0[\s\S]*?facing: 'rear'/);
  assert.match(roadScene, /facing === 'rear' \? Math\.PI : 0/);
});

test('toque leve ancora a face da barreira no keyframe de contato', () => {
  assert.match(ruralStage, /scenarioTravelMeters\(settings, 4_900\)[\s\S]*?SOMPO_TRUCK_FRONT_X \+ SOMPO_OBSTACLE_HALF_X/);
  assert.match(ruralStage, /obstacleGroup\.position\.x = obstacleContactAnchor/);
});
