// =====================================================
// COMPUTER USE - TUDO EM UM (v4.1 - Pronto para testar)
// Cole este arquivo INTEIRO em uma NOVA conversa
// =====================================================

const COMPUTER_USE_PLUGIN_PATH = String.raw`C:\Users\user\.codex\plugins\cache\openai-bundled\computer-use\26.527.30818`;

// BOOTSTRAP
if (!globalThis.sky) {
  const { setupComputerUseRuntime } = await import(`${COMPUTER_USE_PLUGIN_PATH}/scripts/computer-use-client.mjs`);
  await setupComputerUseRuntime({ globals: globalThis });
}
globalThis.apps = await sky.list_apps();

// Abrir Paint
globalThis.openAndPreparePaint = async function() {
  let paint = apps.find(a => /paint|mspaint/i.test(a.id) || /paint/i.test(a.displayName || ""));
  if (!paint?.windows?.length) {
    await sky.launch_app({ app: String.raw`C:\Windows\System32\mspaint.exe` });
    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 650));
      globalThis.apps = await sky.list_apps();
      paint = apps.find(a => /paint|mspaint/i.test(a.id) || /paint/i.test(a.displayName || ""));
      if (paint?.windows?.length) break;
    }
  }
  if (!paint?.windows?.length) throw new Error("Abra o Paint manualmente e rode de novo.");
  globalThis.targetWindow = await sky.get_window(paint.windows[0]);
  await sky.activate_window({ window: targetWindow });
  globalThis.targetWindow = await sky.get_window({ id: targetWindow.id, app: targetWindow.app });
  globalThis.state = await sky.get_window_state({ window: targetWindow, include_screenshot: true });
  console.log("✅ Paint pronto");
  return targetWindow;
};

async function thickDrag(W, x1, y1, x2, y2, thickness = 2, sId) {
  for (let t = 0; t < thickness; t++) {
    const ox = (t % 2 === 0) ? t : -t;
    await sky.drag({ window: W, from_x: x1 + ox, from_y: y1 + (t % 3), to_x: x2 + ox, to_y: y2 + (t % 3), screenshotId: sId });
    await new Promise(r => setTimeout(r, 22));
  }
}

// Calibração com marcadores
globalThis.drawCalibrationGrid = async function() {
  if (!globalThis.targetWindow) await openAndPreparePaint();
  const W = targetWindow;
  const s = state.screenshots?.[0]?.id;
  const positions = [
    {name:"Centro", cx:430, cy:340}, {name:"Esq", cx:320, cy:340},
    {name:"Dir", cx:540, cy:340}, {name:"Cima", cx:430, cy:220}, {name:"Baixo", cx:430, cy:460}
  ];
  for (const p of positions) {
    const cx = p.cx, cy = p.cy;
    await thickDrag(W, cx-25, cy-25, cx+25, cy-25, 1, s);
    await thickDrag(W, cx+25, cy-25, cx+25, cy+25, 1, s);
    await thickDrag(W, cx+25, cy+25, cx-25, cy+25, 1, s);
    await thickDrag(W, cx-25, cy+25, cx-25, cy-25, 1, s);
    await thickDrag(W, cx-15, cy, cx+15, cy, 1, s);
    await thickDrag(W, cx, cy-15, cx, cy+15, 1, s);
  }
  console.log("✅ Grade desenhada. Escolha a melhor posição.");
};

// Goblin v4.1
globalThis.drawBetterGoblin = async function(opts = {}) {
  if (!globalThis.targetWindow) await openAndPreparePaint();
  const { cx = 430, cy = 340, scale = 1.0 } = opts;
  const W = targetWindow;
  const s = state.screenshots?.[0]?.id;
  const sX = n => Math.round(cx + n * scale);
  const sY = n => Math.round(cy + n * scale);

  // (todo o código do goblin detalhado - mantido igual da v4)
  await thickDrag(W, sX(-48), sY(-78), sX(48), sY(-78), 2, s);
  await thickDrag(W, sX(48), sY(-78), sX(68), sY(-35), 2, s);
  await thickDrag(W, sX(68), sY(-35), sX(55), sY(32), 2, s);
  await thickDrag(W, sX(55), sY(32), sX(-55), sY(32), 2, s);
  await thickDrag(W, sX(-55), sY(32), sX(-68), sY(-35), 2, s);
  await thickDrag(W, sX(-68), sY(-35), sX(-48), sY(-78), 2, s);

  await thickDrag(W, sX(-48), sY(-60), sX(-88), sY(-105), 2, s);
  await thickDrag(W, sX(-88), sY(-105), sX(-62), sY(-52), 2, s);
  await thickDrag(W, sX(48), sY(-60), sX(88), sY(-105), 2, s);
  await thickDrag(W, sX(88), sY(-105), sX(62), sY(-52), 2, s);

  await thickDrag(W, sX(-38), sY(-28), sX(-8), sY(-28), 2, s);
  await thickDrag(W, sX(-8), sY(-28), sX(-8), sY(6), 2, s);
  await thickDrag(W, sX(-8), sY(6), sX(-38), sY(6), 2, s);
  await thickDrag(W, sX(-38), sY(6), sX(-38), sY(-28), 2, s);
  await thickDrag(W, sX(-30), sY(-18), sX(-16), sY(-18), 2, s);

  await thickDrag(W, sX(8), sY(-28), sX(38), sY(-28), 2, s);
  await thickDrag(W, sX(38), sY(-28), sX(38), sY(6), 2, s);
  await thickDrag(W, sX(38), sY(6), sX(8), sY(6), 2, s);
  await thickDrag(W, sX(8), sY(6), sX(8), sY(-28), 2, s);
  await thickDrag(W, sX(16), sY(-18), sX(30), sY(-18), 2, s);

  await thickDrag(W, sX(-42), sY(-38), sX(-5), sY(-46), 2, s);
  await thickDrag(W, sX(5), sY(-46), sX(42), sY(-38), 2, s);

  await thickDrag(W, sX(-8), sY(-5), sX(8), sY(-5), 2, s);
  await thickDrag(W, sX(-8), sY(-5), sX(-5), sY(8), 2, s);
  await thickDrag(W, sX(8), sY(-5), sX(5), sY(8), 2, s);

  await thickDrag(W, sX(-32), sY(18), sX(32), sY(18), 2, s);
  await thickDrag(W, sX(-32), sY(18), sX(-22), sY(38), 2, s);
  await thickDrag(W, sX(-22), sY(38), sX(22), sY(38), 2, s);
  await thickDrag(W, sX(22), sY(38), sX(32), sY(18), 2, s);
  await thickDrag(W, sX(-18), sY(20), sX(-18), sY(35), 2, s);
  await thickDrag(W, sX(0), sY(20), sX(0), sY(35), 2, s);
  await thickDrag(W, sX(18), sY(20), sX(18), sY(35), 2, s);
  await thickDrag(W, sX(-26), sY(20), sX(-20), sY(42), 2, s);
  await thickDrag(W, sX(26), sY(20), sX(20), sY(42), 2, s);

  await thickDrag(W, sX(-22), sY(35), sX(-25), sY(105), 2, s);
  await thickDrag(W, sX(22), sY(35), sX(25), sY(105), 2, s);
  await thickDrag(W, sX(-25), sY(105), sX(25), sY(105), 2, s);

  await thickDrag(W, sX(-22), sY(52), sX(-78), sY(25), 2, s);
  await thickDrag(W, sX(-78), sY(25), sX(-95), sY(58), 2, s);
  await thickDrag(W, sX(-95), sY(58), sX(-108), sY(42), 2, s);
  await thickDrag(W, sX(-95), sY(58), sX(-82), sY(72), 2, s);
  await thickDrag(W, sX(-95), sY(58), sX(-100), sY(68), 2, s);

  await thickDrag(W, sX(22), sY(52), sX(72), sY(30), 2, s);
  await thickDrag(W, sX(72), sY(30), sX(88), sY(68), 2, s);
  await thickDrag(W, sX(88), sY(68), sX(102), sY(52), 2, s);
  await thickDrag(W, sX(88), sY(68), sX(78), sY(82), 2, s);

  await thickDrag(W, sX(78), sY(55), sX(78), sY(115), 2, s);
  await thickDrag(W, sX(68), sY(115), sX(88), sY(115), 2, s);
  await thickDrag(W, sX(68), sY(108), sX(88), sY(108), 2, s);
  await thickDrag(W, sX(68), sY(122), sX(88), sY(122), 2, s);

  await thickDrag(W, sX(-14), sY(105), sX(-22), sY(155), 2, s);
  await thickDrag(W, sX(14), sY(105), sX(22), sY(155), 2, s);
  await thickDrag(W, sX(-22), sY(155), sX(-48), sY(152), 2, s);
  await thickDrag(W, sX(22), sY(155), sX(48), sY(152), 2, s);

  console.log("✅ Goblin desenhado!");
};

// === ATALHO MAIS FÁCIL: Rode só isso ===
globalThis.runGoblin = async function() {
  console.log("=== Iniciando fluxo completo do Goblin ===");
  await openAndPreparePaint();
  console.log("Desenhando grade de calibração para você escolher a posição...");
  await drawCalibrationGrid();
  console.log("\n⏸️  OLHE O SCREENSHOT agora.");
  console.log("Escolha a posição que ficou melhor (ex: cx=430, cy=340) e rode:");
  console.log("await drawBetterGoblin({ cx: 430, cy: 340, scale: 1.0 })");
  console.log("Ou use um dos exemplos acima.");
};

console.log("\n✅ Pronto! Opções:");
console.log("1. await runGoblin()           ← mais fácil (recomendado)");
console.log("2. await openAndPreparePaint() + await drawCalibrationGrid() + drawBetterGoblin(...)");
