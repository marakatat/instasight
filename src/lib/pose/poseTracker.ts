import { PoseLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

let poseLandmarker: PoseLandmarker | null = null;

export async function initializePoseLandmarker() {
  if (poseLandmarker) return poseLandmarker;

  // Use jsdelivr to load the WebAssembly backend for MediaPipe
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
  );

  poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      // Points to the model we downloaded into the public/ folder
      modelAssetPath: "/pose_landmarker_lite.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numPoses: 1,
  });

  return poseLandmarker;
}
