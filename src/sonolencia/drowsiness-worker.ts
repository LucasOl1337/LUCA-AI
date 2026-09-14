import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

let detector: FaceLandmarker | undefined;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      const files = await FilesetResolver.forVisionTasks('/sonolencia-assets/wasm');
      detector = await FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: '/sonolencia-assets/face_landmarker.task', delegate: 'CPU' },
        runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true,
        minFaceDetectionConfidence: 0.6, minFacePresenceConfidence: 0.6, minTrackingConfidence: 0.6,
      });
      self.postMessage({ type: 'ready' });
    } else if (data.type === 'frame') {
      const bitmap: ImageBitmap = data.bitmap;
      try {
        if (!detector) throw new Error('Detector indisponível');
        const result = detector.detectForVideo(bitmap, data.at);
        const categories = result.faceBlendshapes[0]?.categories;
        const left = categories?.find(c => c.categoryName === 'eyeBlinkLeft')?.score;
        const right = categories?.find(c => c.categoryName === 'eyeBlinkRight')?.score;
        const sample = left !== undefined && right !== undefined ? { left, right } : null;
        self.postMessage({ type: 'result', sample, at: data.at });
      } finally { bitmap.close(); }
    }
  } catch {
    self.postMessage({ type: 'error' });
  }
};
