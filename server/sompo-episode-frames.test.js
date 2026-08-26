import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { SOMPO_COLLISION_FRAME_MOMENTS } from '../shared/sompo-telemetry-simulator.js';
import { runAgentWithTools } from './agent-loop.js';
import {
  createSompoTelemetryEpisodeFrameGetHttpHandler,
  createSompoTelemetryEpisodeFramesHttpHandler,
  createSompoTelemetryEpisodeGetHttpHandler,
  createSompoTelemetryHistory,
  SOMPO_TELEMETRY_EPISODE_FRAME_GRACE_MS,
  SOMPO_TELEMETRY_EPISODE_FRAME_MAX_BYTES,
  SOMPO_TELEMETRY_EPISODE_FRAMES_MAX,
} from './sompo-telemetry-history.js';

const BASE_MS = Date.parse('2026-08-26T12:00:00.000Z');

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

/** JPEG sintético mínimo: assinatura FFD8FF + corpo + FFD9, gerado em código. */
function syntheticJpeg(size = 512, fill = 0x42) {
  const buffer = Buffer.alloc(Math.max(size, 6), fill);
  Buffer.from('ffd8ffe0', 'hex').copy(buffer, 0);
  buffer[buffer.length - 2] = 0xff;
  buffer[buffer.length - 1] = 0xd9;
  return buffer;
}

function jpegDataUrl(buffer) {
  return `data:image/jpeg;base64,${buffer.toString('base64')}`;
}

function frameBody(index, buffer = syntheticJpeg(512, 0x40 + index)) {
  const moment = SOMPO_COLLISION_FRAME_MOMENTS[index] || { offsetMs: index * 1_000, fase: 'aproximacao', label: `Frame ${index + 1}` };
  return {
    dataUrl: jpegDataUrl(buffer),
    offsetMs: moment.offsetMs,
    fase: moment.fase,
    label: moment.label,
  };
}

function tempStore() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sompo-frames-'));
  return {
    directory,
    dbPath: path.join(directory, 'sompo-telemetry.db'),
    framesDir: path.join(directory, 'sompo-episodes'),
    cleanup() {
      fs.rmSync(directory, { recursive: true, force: true });
    },
  };
}

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    status(value) {
      this.statusCode = value;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
    },
    json(value) {
      this.body = value;
      return this;
    },
    send(value) {
      this.body = value;
      return this;
    },
  };
}

test('frames de episódio: upload 1-por-request, GET com metadados e leitura binária', async (t) => {
  const { dbPath, framesDir, cleanup } = tempStore();
  let clock = BASE_MS;
  const history = createSompoTelemetryHistory({ dbPath, framesDir, now: () => clock });
  t.after(() => {
    history.close();
    cleanup();
  });
  const framesHandler = createSompoTelemetryEpisodeFramesHttpHandler(history);
  const getHandler = createSompoTelemetryEpisodeGetHttpHandler(history);
  const frameGetHandler = createSompoTelemetryEpisodeFrameGetHttpHandler(history);

  const episode = history.startEpisode({ kind: 'colisao', tractorId: 'SIM-001' });
  const buffers = SOMPO_COLLISION_FRAME_MOMENTS.map((_, index) => syntheticJpeg(512, 0x50 + index));

  // O cliente sobe 1 frame por request (limite de body do Express); o servidor acumula.
  for (let index = 0; index < SOMPO_COLLISION_FRAME_MOMENTS.length; index += 1) {
    const res = mockRes();
    await framesHandler({
      params: { publicId: episode.publicId },
      body: { frames: [frameBody(index, buffers[index])] },
    }, res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.ok, true);
    assert.equal(res.body.added, 1);
    assert.equal(res.body.frames.length, index + 1);
  }

  const fetched = mockRes();
  await getHandler({ params: { publicId: episode.publicId } }, fetched);
  assert.equal(fetched.statusCode, 200);
  assert.equal(fetched.body.frames.length, 5);
  const impactFrame = fetched.body.frames[2];
  assert.equal(impactFrame.seq, 3);
  assert.equal(impactFrame.fase, 'impacto');
  assert.equal(impactFrame.label, 'Impacto — pico de aceleração');
  assert.equal(impactFrame.offsetMs, SOMPO_COLLISION_FRAME_MOMENTS[2].offsetMs);
  assert.equal(impactFrame.mimeType, 'image/jpeg');
  assert.equal(impactFrame.size, buffers[2].length);
  assert.equal(impactFrame.url, `/api/sompo/telemetry/episode/${episode.publicId}/frames/3`);

  const binary = mockRes();
  await frameGetHandler({ params: { publicId: episode.publicId, seq: '3' } }, binary);
  assert.equal(binary.statusCode, 200);
  assert.equal(binary.headers['Content-Type'], 'image/jpeg');
  assert.equal(binary.headers['Cache-Control'], 'private, max-age=3600');
  assert.equal(binary.headers['Content-Length'], String(buffers[2].length));
  assert.ok(Buffer.isBuffer(binary.body) && binary.body.equals(buffers[2]));

  const missingFrame = mockRes();
  await frameGetHandler({ params: { publicId: episode.publicId, seq: '99' } }, missingFrame);
  assert.equal(missingFrame.statusCode, 404);
  assert.equal(missingFrame.body.error, 'sompo_telemetry_episode_frame_not_found');

  // Arquivo real no disco, dentro do diretório do episódio.
  const stored = fs.readFileSync(path.join(framesDir, episode.publicId, 'frame-3.jpg'));
  assert.ok(stored.equals(buffers[2]));
});

test('frames de episódio: teto de 6, teto de 300KB e assinatura de bytes — 400 com código claro', async (t) => {
  const { dbPath, framesDir, cleanup } = tempStore();
  let clock = BASE_MS;
  const history = createSompoTelemetryHistory({ dbPath, framesDir, now: () => clock });
  t.after(() => {
    history.close();
    cleanup();
  });
  const framesHandler = createSompoTelemetryEpisodeFramesHttpHandler(history);
  const episode = history.startEpisode({ kind: 'colisao' });

  const sixBatch = mockRes();
  await framesHandler({
    params: { publicId: episode.publicId },
    body: { frames: Array.from({ length: SOMPO_TELEMETRY_EPISODE_FRAMES_MAX }, (_, index) => frameBody(index)) },
  }, sixBatch);
  assert.equal(sixBatch.statusCode, 200);
  assert.equal(sixBatch.body.frames.length, 6);

  const seventh = mockRes();
  await framesHandler({
    params: { publicId: episode.publicId },
    body: { frames: [frameBody(0)] },
  }, seventh);
  assert.equal(seventh.statusCode, 400);
  assert.equal(seventh.body.error, 'sompo_telemetry_episode_frames_limit');
  assert.match(seventh.body.message, /teto é 6 por episódio/);

  const fresh = history.startEpisode({ kind: 'colisao' });
  const tooLarge = mockRes();
  await framesHandler({
    params: { publicId: fresh.publicId },
    body: { frames: [frameBody(0, syntheticJpeg(SOMPO_TELEMETRY_EPISODE_FRAME_MAX_BYTES + 1))] },
  }, tooLarge);
  assert.equal(tooLarge.statusCode, 400);
  assert.equal(tooLarge.body.error, 'sompo_telemetry_episode_frame_too_large');
  assert.match(tooLarge.body.message, new RegExp(`teto de ${SOMPO_TELEMETRY_EPISODE_FRAME_MAX_BYTES} bytes`));

  // Rótulo mente sobre os bytes: PNG declarado como jpeg é recusado pela assinatura.
  const spoofed = mockRes();
  await framesHandler({
    params: { publicId: fresh.publicId },
    body: { frames: [{ ...frameBody(0), dataUrl: `data:image/jpeg;base64,${PNG_1X1.toString('base64')}` }] },
  }, spoofed);
  assert.equal(spoofed.statusCode, 400);
  assert.equal(spoofed.body.error, 'sompo_telemetry_episode_frame_invalid');
  assert.match(spoofed.body.message, /os bytes não correspondem a image\/jpeg/);

  const garbage = mockRes();
  await framesHandler({
    params: { publicId: fresh.publicId },
    body: { frames: [{ dataUrl: 'data:image/jpeg;base64,' }] },
  }, garbage);
  assert.equal(garbage.statusCode, 400);
  assert.equal(garbage.body.error, 'sompo_telemetry_episode_frame_invalid');

  const empty = mockRes();
  await framesHandler({ params: { publicId: fresh.publicId }, body: { frames: [] } }, empty);
  assert.equal(empty.statusCode, 400);
  assert.equal(empty.body.error, 'sompo_telemetry_episode_frames_required');

  const unknown = mockRes();
  await framesHandler({ params: { publicId: 'nao-existe' }, body: { frames: [frameBody(0)] } }, unknown);
  assert.equal(unknown.statusCode, 404);
  assert.equal(unknown.body.error, 'sompo_telemetry_episode_not_found');

  // Rejeição em lote não grava nada pela metade: um frame ruim derruba o lote inteiro.
  const halfBad = mockRes();
  await framesHandler({
    params: { publicId: fresh.publicId },
    body: { frames: [frameBody(0), { ...frameBody(1), dataUrl: 'data:image/jpeg;base64,%%%' }] },
  }, halfBad);
  assert.equal(halfBad.statusCode, 400);
  assert.equal(history.getEpisode(fresh.publicId).frames.length, 0);
});

test('frames de episódio: janela de graça pós-finish e episódio antigo sem frames segue válido', async (t) => {
  const { dbPath, framesDir, cleanup } = tempStore();
  let clock = BASE_MS;
  const history = createSompoTelemetryHistory({ dbPath, framesDir, now: () => clock });
  t.after(() => {
    history.close();
    cleanup();
  });
  const framesHandler = createSompoTelemetryEpisodeFramesHttpHandler(history);
  const getHandler = createSompoTelemetryEpisodeGetHttpHandler(history);

  const episode = history.startEpisode({ kind: 'colisao' });
  clock = BASE_MS + 20_000;
  history.finishEpisode(episode.publicId, { status: 'complete' });

  // Recém-complete: dentro da janela de graça o upload ainda entra.
  clock = BASE_MS + 20_000 + SOMPO_TELEMETRY_EPISODE_FRAME_GRACE_MS - 1_000;
  const inGrace = mockRes();
  await framesHandler({ params: { publicId: episode.publicId }, body: { frames: [frameBody(0)] } }, inGrace);
  assert.equal(inGrace.statusCode, 200);

  clock = BASE_MS + 20_000 + SOMPO_TELEMETRY_EPISODE_FRAME_GRACE_MS + 1_000;
  const late = mockRes();
  await framesHandler({ params: { publicId: episode.publicId }, body: { frames: [frameBody(1)] } }, late);
  assert.equal(late.statusCode, 400);
  assert.equal(late.body.error, 'sompo_telemetry_episode_frames_closed');

  const aborted = history.startEpisode({ kind: 'colisao' });
  history.finishEpisode(aborted.publicId, { status: 'aborted' });
  const ontoAborted = mockRes();
  await framesHandler({ params: { publicId: aborted.publicId }, body: { frames: [frameBody(0)] } }, ontoAborted);
  assert.equal(ontoAborted.statusCode, 400);
  assert.equal(ontoAborted.body.error, 'sompo_telemetry_episode_frames_closed');

  // Compatibilidade: episódio sem nenhum frame devolve frames: [] no GET.
  const bare = history.startEpisode({ kind: 'colisao' });
  const bareGet = mockRes();
  await getHandler({ params: { publicId: bare.publicId } }, bareGet);
  assert.equal(bareGet.statusCode, 200);
  assert.deepEqual(bareGet.body.frames, []);
});

test('frame do episódio vira anexo de chat e chega ao modelo como image_url', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sompo-frame-attach-'));
  process.env.LUCA_DATA_DIR = dataDir;
  const bust = `${Date.now()}-${Math.random()}`;
  const workspace = await import(pathToFileURL(path.resolve('server/workspace-context.js')).href);
  // chat-library precisa ser a instância CANÔNICA: chat-attachments a importa estaticamente.
  const chatLibrary = await import(pathToFileURL(path.resolve('server/chat-library.js')).href);
  const attachments = await import(
    `${pathToFileURL(path.resolve('server/chat-attachments.js')).href}?frames=${bust}`
  );

  const frameJpeg = syntheticJpeg(512, 0x55);
  let resolved;
  workspace.runWithWorkspaceUser('owner-frames', () => {
    const session = chatLibrary.createChatSession({ title: 'Episódio SOMPO' });
    const stored = attachments.storeChatAttachment({
      sessionId: session.id,
      name: 'frame-3-impacto.jpg',
      mimeType: 'image/jpeg',
      buffer: frameJpeg,
    });
    assert.equal(stored.kind, 'image');
    resolved = attachments.resolveChatAttachmentsForModel(session.id, [stored.id]);
  });
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].part.type, 'image_url');
  assert.equal(resolved[0].part.image_url.url, jpegDataUrl(frameJpeg));

  // Mesmo caminho da bancada: as parts resolvidas entram na mensagem final do agente.
  const requests = [];
  await runAgentWithTools({
    system: 'Persona de risco agro.',
    user: 'Cruze o Anexo 1 com a telemetria do impacto.',
    attachments: resolved.map((item) => item.part),
    model: 'cc/claude-fable-5',
    agentId: 'sompo-frame',
    maxRounds: 1,
    tools: [],
    callChat: async (request) => {
      requests.push(request);
      return { content: 'O Anexo 1 confere com a distância registrada.', toolCalls: [], finishReason: 'stop' };
    },
  });
  const userMessage = requests[0].messages.find((message) => message.role === 'user');
  const imageParts = userMessage.content.filter((part) => part.type === 'image_url');
  assert.equal(imageParts.length, 1);
  assert.equal(imageParts[0].image_url.url, jpegDataUrl(frameJpeg));
});
