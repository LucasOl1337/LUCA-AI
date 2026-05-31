// ========================================================
// ULTRA SIMPLE - PASTE THIS ENTIRE FILE IN A NEW CONVERSATION
// Then run ONLY: await startHere()
// ========================================================

const PLUGIN_PATH = String.raw`C:\Users\user\.codex\plugins\cache\openai-bundled\computer-use\26.527.30818`;

if (!globalThis.sky) {
  const { setupComputerUseRuntime } = await import(`${PLUGIN_PATH}/scripts/computer-use-client.mjs`);
  await setupComputerUseRuntime({ globals: globalThis });
}
globalThis.apps = await sky.list_apps();

async function preparePaint() {
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
  if (!paint?.windows?.length) throw new Error("Open Paint manually and try again.");
  globalThis.targetWindow = await sky.get_window(paint.windows[0]);
  await sky.activate_window({ window: targetWindow });
  globalThis.targetWindow = await sky.get_window({ id: targetWindow.id, app: targetWindow.app });
  globalThis.state = await sky.get_window_state({ window: targetWindow, include_screenshot: true });
}

async function drawLine(x1, y1, x2, y2, thick = 2) {
  const sId = state.screenshots?.[0]?.id;
  const W = targetWindow;
  for (let t = 0; t < thick; t++) {
    const ox = (t % 2 === 0) ? t : -t;
    await sky.drag({ window: W, from_x: x1 + ox, from_y: y1 + (t % 3), to_x: x2 + ox, to_y: y2 + (t % 3), screenshotId: sId });
    await new Promise(r => setTimeout(r, 15));
  }
}

async function drawTestRect() {
  const cx = 430, cy = 340, w = 100, h = 70;
  await drawLine(cx-w, cy-h, cx+w, cy-h, 2);
  await drawLine(cx+w, cy-h, cx+w, cy+h, 2);
  await drawLine(cx+w, cy+h, cx-w, cy+h, 2);
  await drawLine(cx-w, cy+h, cx-w, cy-h, 2);
}

async function drawGoblinDemo() {
  const cx = 430, cy = 340; // good default for most screens
  const sX = n => Math.round(cx + n);
  const sY = n => Math.round(cy + n);

  // Head
  await drawLine(sX(-42), sY(-65), sX(42), sY(-65), 2);
  await drawLine(sX(42), sY(-65), sX(58), sY(-25), 2);
  await drawLine(sX(58), sY(-25), sX(46), sY(24), 2);
  await drawLine(sX(46), sY(24), sX(-46), sY(24), 2);
  await drawLine(sX(-46), sY(24), sX(-58), sY(-25), 2);
  await drawLine(sX(-58), sY(-25), sX(-42), sY(-65), 2);

  // Horns
  await drawLine(sX(-42), sY(-50), sX(-75), sY(-88), 2);
  await drawLine(sX(-75), sY(-88), sX(-54), sY(-42), 2);
  await drawLine(sX(42), sY(-50), sX(75), sY(-88), 2);
  await drawLine(sX(75), sY(-88), sX(54), sY(-42), 2);

  // Eyes
  await drawLine(sX(-28), sY(-18), sX(-8), sY(-18), 2);
  await drawLine(sX(-8), sY(-18), sX(-8), sY(0), 2);
  await drawLine(sX(-8), sY(0), sX(-28), sY(0), 2);
  await drawLine(sX(-28), sY(0), sX(-28), sY(-18), 2);
  await drawLine(sX(-22), sY(-10), sX(-14), sY(-10), 2);

  await drawLine(sX(8), sY(-18), sX(28), sY(-18), 2);
  await drawLine(sX(28), sY(-18), sX(28), sY(0), 2);
  await drawLine(sX(28), sY(0), sX(8), sY(0), 2);
  await drawLine(sX(8), sY(0), sX(8), sY(-18), 2);
  await drawLine(sX(14), sY(-10), sX(22), sY(-10), 2);

  // Eyebrows
  await drawLine(sX(-32), sY(-28), sX(-6), sY(-34), 2);
  await drawLine(sX(6), sY(-34), sX(32), sY(-28), 2);

  // Mouth + fangs
  await drawLine(sX(-24), sY(8), sX(24), sY(8), 2);
  await drawLine(sX(-24), sY(8), sX(-14), sY(24), 2);
  await drawLine(sX(-14), sY(24), sX(14), sY(24), 2);
  await drawLine(sX(14), sY(24), sX(24), sY(8), 2);

  // Body
  await drawLine(sX(-14), sY(26), sX(-16), sY(85), 2);
  await drawLine(sX(14), sY(26), sX(16), sY(85), 2);
  await drawLine(sX(-16), sY(85), sX(16), sY(85), 2);

  // Arms + claws
  await drawLine(sX(-14), sY(42), sX(-60), sY(18), 2);
  await drawLine(sX(-60), sY(18), sX(-74), sY(44), 2);
  await drawLine(sX(-74), sY(44), sX(-86), sY(32), 2);
  await drawLine(sX(-74), sY(44), sX(-64), sY(56), 2);

  await drawLine(sX(14), sY(42), sX(56), sY(20), 2);
  await drawLine(sX(56), sY(20), sX(70), sY(54), 2);
  await drawLine(sX(70), sY(54), sX(82), sY(40), 2);
  await drawLine(sX(70), sY(54), sX(60), sY(66), 2);

  // Club
  await drawLine(sX(64), sY(42), sX(64), sY(95), 2);
  await drawLine(sX(54), sY(95), sX(74), sY(95), 2);

  // Legs
  await drawLine(sX(-9), sY(85), sX(-14), sY(128), 2);
  await drawLine(sX(9), sY(85), sX(14), sY(128), 2);
  await drawLine(sX(-14), sY(128), sX(-36), sY(126), 2);
  await drawLine(sX(14), sY(128), sX(36), sY(126), 2);
}

globalThis.startHere = async function() {
  console.log("=== Starting Goblin Demo (safest possible first run) ===");
  await preparePaint();

  console.log("Step 1/3: Drawing a test rectangle so you can see if it's working...");
  await drawTestRect();

  console.log("\nStep 2/3: Drawing calibration markers in different positions...");
  // quick markers
  const marks = [[430,340],[320,340],[540,340],[430,220],[430,460]];
  for (const [cx,cy] of marks) {
    await drawLine(cx-18, cy-18, cx+18, cy-18, 1);
    await drawLine(cx+18, cy-18, cx+18, cy+18, 1);
    await drawLine(cx+18, cy+18, cx-18, cy+18, 1);
    await drawLine(cx-18, cy+18, cx-18, cy-18, 1);
  }

  console.log("\nStep 3/3: Drawing the goblin using the most common default position...");
  await drawGoblinDemo();

  console.log("\n✅ Done! You should see a goblin in Paint now.");
  console.log("If it's in a good spot: great!");
  console.log("If it's off-center or too small/big: tell me and I'll give you adjusted numbers instantly.");
  console.log("Example adjustment: await drawGoblinDemo() but with different center if needed (I can provide).");
};

console.log("✅ Script ready for new conversation.");
console.log("Run this:");
console.log("await startHere()");
