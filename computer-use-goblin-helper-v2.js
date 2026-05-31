/**
 * COMPUTER USE - Helper melhorado para Paint + Goblin
 * Versão 2 - Mais robusto e com melhor desenho
 * 
 * Uso recomendado (nova conversa):
 *   1. Cole o bootstrap do COMPUTER_USE_SETUP.md
 *   2. Cole este arquivo inteiro
 *   3. Rode: await initComputerUse()
 *   4. Rode: await openAndPreparePaint()
 *   5. (Opcional) Rode: await calibrateCanvas() para ver onde vai desenhar
 *   6. Rode: await drawBetterGoblin()
 */

const COMPUTER_USE_PLUGIN_PATH = String.raw`C:\Users\user\.codex\plugins\cache\openai-bundled\computer-use\26.527.30818`;

// === BOOTSTRAP ===
globalThis.initComputerUse = async function initComputerUse() {
  if (!globalThis.sky) {
    const { setupComputerUseRuntime } = await import(`${COMPUTER_USE_PLUGIN_PATH}/scripts/computer-use-client.mjs`);
    await setupComputerUseRuntime({ globals: globalThis });
    console.log("✅ Computer Use runtime inicializado");
  }
  globalThis.apps = await sky.list_apps();
  console.log("Apps carregados:", apps.length);
  return globalThis.apps;
};

// === Abrir Paint e preparar ===
globalThis.openAndPreparePaint = async function openAndPreparePaint() {
  let paint = (globalThis.apps || []).find(a => 
    /paint|mspaint/i.test(a.id) || /paint/i.test(a.displayName || "")
  );

  if (!paint?.windows?.length) {
    console.log("Lançando mspaint.exe...");
    await sky.launch_app({ app: String.raw`C:\Windows\System32\mspaint.exe` });
    
    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 650));
      globalThis.apps = await sky.list_apps();
      paint = apps.find(a => /paint|mspaint/i.test(a.id) || /paint/i.test(a.displayName || ""));
      if (paint?.windows?.length) break;
    }
  }

  if (!paint?.windows?.length) {
    throw new Error("Não consegui abrir o Paint. Abra manualmente e rode novamente.");
  }

  globalThis.targetWindow = await sky.get_window(paint.windows[0]);
  await sky.activate_window({ window: targetWindow });
  globalThis.targetWindow = await sky.get_window({ id: targetWindow.id, app: targetWindow.app });
  
  // Screenshot grande para referência
  globalThis.state = await sky.get_window_state({ 
    window: targetWindow, 
    include_screenshot: true 
  });
  
  console.log("✅ Paint aberto e pronto. Screenshot capturado.");
  console.log("Dica: Use calibrateCanvas() para ver a área de desenho.");
  return targetWindow;
};

// === Calibração visual (desenha um retângulo grande para você ver onde está desenhando) ===
globalThis.calibrateCanvas = async function calibrateCanvas() {
  if (!globalThis.targetWindow) throw new Error("Rode openAndPreparePaint() primeiro");
  
  const W = targetWindow;
  const s = state.screenshots?.[0]?.id;

  console.log("Desenhando retângulo de calibração (área segura do canvas)...");

  // Retângulo grande bem visível
  const left = 200, top = 160, right = 720, bottom = 580;

  // Borda superior
  await sky.drag({ window: W, from_x: left, from_y: top, to_x: right, to_y: top, screenshotId: s });
  // Direita
  await sky.drag({ window: W, from_x: right, from_y: top, to_x: right, to_y: bottom, screenshotId: s });
  // Inferior
  await sky.drag({ window: W, from_x: right, from_y: bottom, to_x: left, to_y: bottom, screenshotId: s });
  // Esquerda
  await sky.drag({ window: W, from_x: left, from_y: bottom, to_x: left, to_y: top, screenshotId: s });

  console.log("✅ Retângulo desenhado. Veja no screenshot se está dentro do canvas branco.");
  console.log("Se estiver muito para a esquerda/direita/cima/baixo, avise que eu ajusto os números.");
};

// === Desenha linha com espessura (múltiplos drags próximos) ===
async function thickDrag(W, x1, y1, x2, y2, thickness = 2, sId) {
  for (let t = 0; t < thickness; t++) {
    const ox = t % 2 === 0 ? t : -t;
    await sky.drag({
      window: W,
      from_x: x1 + ox, from_y: y1 + (t % 3),
      to_x: x2 + ox, to_y: y2 + (t % 3),
      screenshotId: sId
    });
    await new Promise(r => setTimeout(r, 35));
  }
}

// === Goblin melhorado (mais detalhado e proporcional) ===
globalThis.drawBetterGoblin = async function drawBetterGoblin(options = {}) {
  if (!globalThis.targetWindow) throw new Error("Rode openAndPreparePaint() primeiro");

  const {
    cx = 420,   // centro horizontal do goblin (ajuste aqui se necessário)
    cy = 320,   // centro vertical
    scale = 1.0
  } = options;

  const W = targetWindow;
  const s = state.screenshots?.[0]?.id;

  const sX = (n) => Math.round(cx + n * scale);
  const sY = (n) => Math.round(cy + n * scale);

  console.log("🧌 Desenhando goblin melhorado...");

  // === CABEÇA (oval mais arredondado) ===
  await thickDrag(W, sX(-55), sY(-70), sX(55), sY(-70), 2, s);   // topo
  await thickDrag(W, sX(55), sY(-70), sX(70), sY(-30), 2, s);
  await thickDrag(W, sX(70), sY(-30), sX(55), sY(25), 2, s);
  await thickDrag(W, sX(55), sY(25), sX(-55), sY(25), 2, s);
  await thickDrag(W, sX(-55), sY(25), sX(-70), sY(-30), 2, s);
  await thickDrag(W, sX(-70), sY(-30), sX(-55), sY(-70), 2, s);

  // === ORELHAS / CHIFRES ===
  // Esquerda
  await thickDrag(W, sX(-55), sY(-55), sX(-95), sY(-95), 2, s);
  await thickDrag(W, sX(-95), sY(-95), sX(-70), sY(-45), 2, s);
  // Direita
  await thickDrag(W, sX(55), sY(-55), sX(95), sY(-95), 2, s);
  await thickDrag(W, sX(95), sY(-95), sX(70), sY(-45), 2, s);

  // === OLHOS ===
  // Olho esquerdo (contorno + pupila)
  await thickDrag(W, sX(-35), sY(-25), sX(-5), sY(-25), 2, s);
  await thickDrag(W, sX(-5), sY(-25), sX(-5), sY(5), 2, s);
  await thickDrag(W, sX(-5), sY(5), sX(-35), sY(5), 2, s);
  await thickDrag(W, sX(-35), sY(5), sX(-35), sY(-25), 2, s);
  await thickDrag(W, sX(-28), sY(-15), sX(-12), sY(-15), 2, s); // pupila

  // Olho direito
  await thickDrag(W, sX(5), sY(-25), sX(35), sY(-25), 2, s);
  await thickDrag(W, sX(35), sY(-25), sX(35), sY(5), 2, s);
  await thickDrag(W, sX(35), sY(5), sX(5), sY(5), 2, s);
  await thickDrag(W, sX(5), sY(5), sX(5), sY(-25), 2, s);
  await thickDrag(W, sX(12), sY(-15), sX(28), sY(-15), 2, s); // pupila

  // === SOBRANCELHAS MALVADAS ===
  await thickDrag(W, sX(-38), sY(-35), sX(-2), sY(-40), 2, s);
  await thickDrag(W, sX(2), sY(-40), sX(38), sY(-35), 2, s);

  // === BOCA (sorriso com presas) ===
  await thickDrag(W, sX(-25), sY(15), sX(25), sY(15), 2, s);
  await thickDrag(W, sX(-25), sY(15), sX(-15), sY(30), 2, s);
  await thickDrag(W, sX(-15), sY(30), sX(15), sY(30), 2, s);
  await thickDrag(W, sX(15), sY(30), sX(25), sY(15), 2, s);

  // Presas
  await thickDrag(W, sX(-12), sY(18), sX(-8), sY(28), 2, s);
  await thickDrag(W, sX(8), sY(18), sX(12), sY(28), 2, s);

  // === CORPO ===
  await thickDrag(W, sX(-20), sY(28), sX(-20), sY(95), 2, s);
  await thickDrag(W, sX(20), sY(28), sX(20), sY(95), 2, s);
  await thickDrag(W, sX(-20), sY(95), sX(20), sY(95), 2, s);

  // === BRAÇOS ===
  // Esquerdo (levantado)
  await thickDrag(W, sX(-20), sY(45), sX(-70), sY(20), 2, s);
  await thickDrag(W, sX(-70), sY(20), sX(-85), sY(55), 2, s);
  // Garra
  await thickDrag(W, sX(-85), sY(55), sX(-95), sY(40), 2, s);
  await thickDrag(W, sX(-85), sY(55), sX(-75), sY(68), 2, s);

  // Direito (segurando algo ou acenando)
  await thickDrag(W, sX(20), sY(45), sX(65), sY(25), 2, s);
  await thickDrag(W, sX(65), sY(25), sX(80), sY(60), 2, s);
  // Garra
  await thickDrag(W, sX(80), sY(60), sX(92), sY(48), 2, s);
  await thickDrag(W, sX(80), sY(60), sX(70), sY(72), 2, s);

  // === PERNAS ===
  await thickDrag(W, sX(-12), sY(95), sX(-25), sY(140), 2, s);
  await thickDrag(W, sX(12), sY(95), sX(25), sY(140), 2, s);

  // Pés
  await thickDrag(W, sX(-25), sY(140), sX(-45), sY(138), 2, s);
  await thickDrag(W, sX(25), sY(140), sX(45), sY(138), 2, s);

  console.log("✅ Goblin melhorado desenhado com sucesso!");
  console.log("Se quiser mover ou aumentar, chame drawBetterGoblin({ cx: 380, cy: 300, scale: 1.2 })");
};

console.log("\n✅ Helper carregado com sucesso!");
console.log("Comandos disponíveis:");
console.log("  await initComputerUse()");
console.log("  await openAndPreparePaint()");
console.log("  await calibrateCanvas()");
console.log("  await drawBetterGoblin({ cx: 420, cy: 320, scale: 1.0 })");
