/**
 * COMPUTER USE - Helper para abrir Paint e desenhar Goblin
 * Cole este código na nova conversa (depois do bootstrap)
 */

const COMPUTER_USE_PLUGIN_PATH = String.raw`C:\Users\user\.codex\plugins\cache\openai-bundled\computer-use\26.527.30818`;

// === BOOTSTRAP (rode uma vez por sessão) ===
export async function initComputerUse() {
  if (!globalThis.sky) {
    const { setupComputerUseRuntime } = await import(`${COMPUTER_USE_PLUGIN_PATH}/scripts/computer-use-client.mjs`);
    await setupComputerUseRuntime({ globals: globalThis });
    console.log("✅ Computer Use inicializado");
  }
  globalThis.apps = await sky.list_apps();
  return globalThis.apps;
}

// === Abrir Paint ===
export async function openPaint() {
  let paint = globalThis.apps.find(a => 
    /paint|mspaint/i.test(a.id) || /paint/i.test(a.displayName || "")
  );

  if (!paint?.windows?.length) {
    console.log("Lançando Paint...");
    await sky.launch_app({ app: String.raw`C:\Windows\System32\mspaint.exe` });
    
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 700));
      globalThis.apps = await sky.list_apps();
      paint = apps.find(a => /paint|mspaint/i.test(a.id) || /paint/i.test(a.displayName || ""));
      if (paint?.windows?.length) break;
    }
  }

  if (!paint?.windows?.length) {
    throw new Error("Paint não encontrado. Abra manualmente e tente novamente.");
  }

  globalThis.targetWindow = await sky.get_window(paint.windows[0]);
  await sky.activate_window({ window: targetWindow });
  globalThis.targetWindow = await sky.get_window({ id: targetWindow.id, app: targetWindow.app });
  
  globalThis.state = await sky.get_window_state({ window: targetWindow, include_screenshot: true });
  
  console.log("✅ Paint pronto");
  return targetWindow;
}

// === Desenhar Goblin simples ===
export async function drawGoblin(options = {}) {
  const {
    canvasLeft = 220,
    canvasTop = 180,
  } = options;

  const W = targetWindow;

  async function dragLine(x1, y1, x2, y2) {
    await sky.drag({
      window: W,
      from_x: x1, from_y: y1,
      to_x: x2, to_y: y2,
      screenshotId: state.screenshots?.[0]?.id
    });
    await new Promise(r => setTimeout(r, 60));
  }

  console.log("🧌 Desenhando goblin...");

  // Cabeça
  await dragLine(canvasLeft + 120, canvasTop + 80,  canvasLeft + 200, canvasTop + 55);
  await dragLine(canvasLeft + 200, canvasTop + 55,  canvasLeft + 265, canvasTop + 85);
  await dragLine(canvasLeft + 265, canvasTop + 85,  canvasLeft + 255, canvasTop + 165);
  await dragLine(canvasLeft + 255, canvasTop + 165, canvasLeft + 125, canvasTop + 160);
  await dragLine(canvasLeft + 125, canvasTop + 160, canvasLeft + 120, canvasTop + 80);

  // Olhos
  await dragLine(canvasLeft + 155, canvasTop + 92,  canvasLeft + 178, canvasTop + 92);
  await dragLine(canvasLeft + 178, canvasTop + 92,  canvasLeft + 178, canvasTop + 108);
  await dragLine(canvasLeft + 178, canvasTop + 108, canvasLeft + 155, canvasTop + 108);
  await dragLine(canvasLeft + 155, canvasTop + 108, canvasLeft + 155, canvasTop + 92);

  await dragLine(canvasLeft + 200, canvasTop + 92,  canvasLeft + 223, canvasTop + 92);
  await dragLine(canvasLeft + 223, canvasTop + 92,  canvasLeft + 223, canvasTop + 108);
  await dragLine(canvasLeft + 223, canvasTop + 108, canvasLeft + 200, canvasTop + 108);
  await dragLine(canvasLeft + 200, canvasTop + 108, canvasLeft + 200, canvasTop + 92);

  // Sorriso malvado
  await dragLine(canvasLeft + 175, canvasTop + 122, canvasLeft + 192, canvasTop + 130);
  await dragLine(canvasLeft + 192, canvasTop + 130, canvasLeft + 210, canvasTop + 122);

  // Corpo
  await dragLine(canvasLeft + 175, canvasTop + 165, canvasLeft + 175, canvasTop + 270);
  await dragLine(canvasLeft + 175, canvasTop + 270, canvasLeft + 140, canvasTop + 340);
  await dragLine(canvasLeft + 175, canvasTop + 270, canvasLeft + 210, canvasTop + 340);

  // Braços
  await dragLine(canvasLeft + 175, canvasTop + 195, canvasLeft + 115, canvasTop + 235);
  await dragLine(canvasLeft + 115, canvasTop + 235, canvasLeft + 80,  canvasTop + 205);

  await dragLine(canvasLeft + 175, canvasTop + 195, canvasLeft + 255, canvasTop + 225);
  await dragLine(canvasLeft + 255, canvasTop + 225, canvasLeft + 295, canvasTop + 175);

  // Chifres
  await dragLine(canvasLeft + 130, canvasTop + 78,  canvasLeft + 105, canvasTop + 35);
  await dragLine(canvasLeft + 105, canvasTop + 35,  canvasLeft + 138, canvasTop + 72);

  await dragLine(canvasLeft + 260, canvasTop + 82,  canvasLeft + 285, canvasTop + 38);
  await dragLine(canvasLeft + 285, canvasTop + 38,  canvasLeft + 258, canvasTop + 75);

  console.log("✅ Goblin finalizado!");
}

console.log("Helpers carregados. Use: await initComputerUse(); await openPaint(); await drawGoblin();");
