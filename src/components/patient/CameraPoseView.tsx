"use client";

import { useEffect, useRef, useState } from "react";
import { initializePoseLandmarker } from "@/lib/pose/poseTracker";
import { DrawingUtils, PoseLandmarkerResult, PoseLandmarker } from "@mediapipe/tasks-vision";
import { angle, Point } from "@/lib/pose/geometry";
import { evaluateArmRaise } from "@/lib/pose/exerciseRules";
import { PoseMetrics } from "@/types/rehabilitation";

export function CameraPoseView() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [metrics, setMetrics] = useState<PoseMetrics | null>(null);

  // We use refs to keep track of state across animation frames without triggering re-renders
  const metricsRef = useRef<PoseMetrics>({
    timestamp: 0,
    repetition: 0,
    phase: "idle",
    movementScore: 0,
    rangeOfMotion: 0,
  });

  useEffect(() => {
    let animationFrameId: number;
    let lastVideoTime = -1;
    let poseLandmarker: any;

    async function setupCameraAndMediaPipe() {
      // 1. Initialize MediaPipe
      poseLandmarker = await initializePoseLandmarker();

      // 2. Request Camera
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
          setIsLoaded(true);
          // 3. Start prediction loop
          predictWebcam();
        } catch (err: any) {
          // Ignore AbortError caused by React Strict Mode unmounting
          if (err.name !== "AbortError") {
            console.error("Error playing video:", err);
          }
        }
      }
    }

    async function predictWebcam() {
      if (!videoRef.current || !canvasRef.current || !poseLandmarker) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");

      if (ctx && video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;

        // Match canvas internal resolution to actual video resolution
        if (video.videoWidth > 0 && canvas.width !== video.videoWidth) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }

        // Run MediaPipe Pose Detection
        const result = poseLandmarker.detectForVideo(video, performance.now());
        
        // Draw the results
        ctx.save();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        if (result.landmarks && result.landmarks.length > 0) {
          const drawingUtils = new DrawingUtils(ctx);
          for (const landmark of result.landmarks) {
            drawingUtils.drawLandmarks(landmark, { radius: 3, color: "#FF0000" });
            drawingUtils.drawConnectors(landmark, PoseLandmarker.POSE_CONNECTIONS, {
              color: "#00FF00",
              lineWidth: 2,
            });
          }

          // Extract coordinates for Right Arm
          const landmarks = result.landmarks[0];
          const rightShoulder = landmarks[12];
          const rightElbow = landmarks[14];
          const rightWrist = landmarks[16];
          const rightHip = landmarks[24];

          if (rightShoulder && rightElbow && rightWrist && rightHip) {
            const shoulderAngle = angle(rightElbow, rightShoulder, rightHip);
            const elbowAngle = angle(rightWrist, rightElbow, rightShoulder);

            const newMetrics = evaluateArmRaise({
              shoulderAngle,
              elbowAngle,
              previousPhase: metricsRef.current.phase,
              repetition: metricsRef.current.repetition,
            });

            // If the phase changed from lowering to holding, it's a completed repetition
            if (metricsRef.current.phase === "lowering" && newMetrics.phase === "holding") {
                newMetrics.repetition += 1;
                
                // CALL THE AI ENDPOINT!
                fetch("/api/ai/evaluate", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    sessionId: "session_demo",
                    videoTimeMs: Math.round(video.currentTime * 1000),
                    repetitionNumber: newMetrics.repetition,
                    exerciseId: "right_arm_raise",
                    pose: {
                      shoulderAngle: newMetrics.rightShoulderAngle,
                      elbowAngle: newMetrics.rightElbowAngle,
                      movementDurationMs: 3000, // mock duration for now
                      rangeOfMotion: newMetrics.rangeOfMotion,
                      poseConfidence: 0.95
                    },
                    eeg: { signalQuality: 0.88, motorIntentScore: 0.73 } // simulated EEG
                  })
                })
                .then(res => res.json())
                .then(aiEvent => {
                  if (aiEvent.suggestion) {
                     window.speechSynthesis.cancel();
                     window.speechSynthesis.speak(new SpeechSynthesisUtterance(aiEvent.suggestion));
                  }
                })
                .catch(err => console.error("AI Error:", err));
            }

            metricsRef.current = newMetrics;
            setMetrics(newMetrics);
          }
        }
        ctx.restore();
      }

      // Loop
      animationFrameId = requestAnimationFrame(predictWebcam);
    }

    setupCameraAndMediaPipe();

    return () => {
      cancelAnimationFrame(animationFrameId);
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="relative aspect-video w-full max-w-3xl overflow-hidden rounded-2xl bg-gray-900 border-4 border-gray-200 shadow-lg">
        {!isLoaded && (
          <div className="absolute inset-0 flex items-center justify-center text-white">
            <p className="text-xl">Loading Camera & AI Tracking...</p>
          </div>
        )}
        
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full"
          style={{ objectFit: "contain" }}
          playsInline
          muted
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
          style={{ objectFit: "contain" }}
        />
      </div>

      {/* Demo Dashboard to see metrics live */}
      {metrics && (
        <div className="bg-white p-4 rounded-xl shadow border">
          <h3 className="font-bold text-lg mb-2">Live Telemetry</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><strong>Phase:</strong> {metrics.phase}</div>
            <div><strong>Reps:</strong> {metrics.repetition}</div>
            <div><strong>Shoulder Angle:</strong> {metrics.rightShoulderAngle}°</div>
            <div><strong>Elbow Angle:</strong> {metrics.rightElbowAngle}°</div>
            <div><strong>Feedback:</strong> <span className="text-red-600">{metrics.error || "Good"}</span></div>
          </div>
        </div>
      )}
    </div>
  );
}
