"use client";

import { useEffect, useRef, useState } from "react";
import { initializePoseLandmarker } from "@/lib/pose/poseTracker";
import { DrawingUtils, PoseLandmarkerResult, PoseLandmarker } from "@mediapipe/tasks-vision";
import { angle, Point } from "@/lib/pose/geometry";
import { evaluateArmRaise } from "@/lib/pose/exerciseRules";
import { PoseMetrics, AIFeedbackEvent } from "@/types/rehabilitation";
import { EegTelemetry } from "@/lib/eeg/useEegStream";

export function CameraPoseView({ 
  isRecording, 
  onRecordingComplete,
  onAIEvent,
  onAIPromise,
  shouldTriggerAI,
  onLoaded,
  liveFeedback,
  eegTelemetry,
  sessionId = "session_demo",
}: {
  isRecording: boolean;
  onRecordingComplete: (blob: Blob) => void;
  onAIEvent: (event: AIFeedbackEvent) => void;
  onAIPromise?: (p: Promise<void>) => void;
  shouldTriggerAI?: () => boolean;
  onLoaded?: () => void;
  liveFeedback?: { suggestion: string; severity: string } | null;
  eegTelemetry?: EegTelemetry | null;
  sessionId?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  
  const [isLoaded, setIsLoaded] = useState(false);
  const [metrics, setMetrics] = useState<PoseMetrics | null>(null);

  const metricsRef = useRef<PoseMetrics>({
    timestamp: 0,
    repetition: 0,
    phase: "idle",
    movementScore: 0,
    rangeOfMotion: 0,
  });

  // Handle Start/Stop commands from parent VoiceControls safely
  useEffect(() => {
    if (!mediaRecorderRef.current) return;
    
    if (isRecording && mediaRecorderRef.current.state === "inactive") {
      console.log("Starting MediaRecorder...");
      recordedChunksRef.current = [];
      mediaRecorderRef.current.start();
    } else if (!isRecording && mediaRecorderRef.current.state === "recording") {
      console.log("Stopping MediaRecorder...");
      mediaRecorderRef.current.stop();
    }
  }, [isRecording, isLoaded]); // Added isLoaded to dependencies so it checks again when camera mounts!

  useEffect(() => {
    let animationFrameId: number;
    let lastVideoTime = -1;
    let poseLandmarker: any;
    let localStream: MediaStream | null = null;

    async function setupCameraAndMediaPipe() {
      poseLandmarker = await initializePoseLandmarker();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user" 
        },
      });
      localStream = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        videoRef.current.onloadeddata = () => {
          setIsLoaded(true);
          if (onLoaded) onLoaded();
          predictWebcam();
          
          const recorder = new MediaRecorder(stream);
          
          // Request data every 1 second to ensure chunks are actually collected
          recorder.start = function(timeslice) {
             MediaRecorder.prototype.start.call(this, timeslice || 1000);
          };

          recorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
              recordedChunksRef.current.push(event.data);
            }
          };
          recorder.onstop = () => {
            // Use the actual mimetype recorded by the browser (crucial for Safari vs Chrome compatibility)
            const mimeType = mediaRecorderRef.current?.mimeType || "video/webm";
            const blob = new Blob(recordedChunksRef.current, { type: mimeType });
            onRecordingComplete(blob);
            recordedChunksRef.current = [];
          };
          mediaRecorderRef.current = recorder;
        };

        try {
          await videoRef.current.play();
        } catch (err: any) {
          if (err.name !== "AbortError") console.error("Error playing video:", err);
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

        if (video.videoWidth > 0 && canvas.width !== video.videoWidth) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }

        const result = poseLandmarker.detectForVideo(video, performance.now());
        
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

            // Trigger AI when the patient completes a raise and starts lowering their arm
            if (mediaRecorderRef.current?.state === "recording" && 
                metricsRef.current.phase === "holding" && 
                newMetrics.phase === "lowering") {
                newMetrics.repetition += 1;

                // Call AI but cap at 5 per session so upload doesn't hang
                if (!shouldTriggerAI || shouldTriggerAI()) {
                  const aiPromise = fetch("/api/ai/evaluate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      sessionId: sessionId,
                      videoTimeMs: Math.round(video.currentTime * 1000),
                      repetitionNumber: newMetrics.repetition,
                      exerciseId: "right_arm_raise",
                      pose: {
                        shoulderAngle: newMetrics.rightShoulderAngle,
                        elbowAngle: newMetrics.rightElbowAngle,
                        movementDurationMs: 3000,
                        rangeOfMotion: newMetrics.rangeOfMotion,
                        poseConfidence: 0.95
                      },
                      eeg: {
                        signalQuality: eegTelemetry?.signalQuality ?? 0.9,
                        motorIntentScore: eegTelemetry?.motorAttemptProbability ?? 0.75
                      }
                    })
                  })
                  .then(res => res.json())
                  .then((aiEvent: any) => {
                    if (aiEvent.error || !aiEvent.suggestion) return;
                    window.speechSynthesis.cancel();
                    window.speechSynthesis.speak(new SpeechSynthesisUtterance(aiEvent.suggestion));
                    onAIEvent(aiEvent as AIFeedbackEvent);
                  })
                  .catch(err => console.error("AI Error:", err));

                  if (onAIPromise) onAIPromise(aiPromise as unknown as Promise<void>);
                }
            }
            metricsRef.current = newMetrics;
            setMetrics(newMetrics);
          }
        }
        ctx.restore();
      }
      animationFrameId = requestAnimationFrame(predictWebcam);
    }

    setupCameraAndMediaPipe();

    return () => {
      cancelAnimationFrame(animationFrameId);
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [eegTelemetry, sessionId, onAIEvent, onAIPromise, shouldTriggerAI]);

  const simulateRepetition = () => {
    if (!isRecording) {
      alert("Please click 'Start exercise' before simulating!");
      return;
    }
    
    const newRep = metricsRef.current.repetition + 1;
    
    // Fake the state machine update
    setMetrics(prev => prev ? { ...prev, repetition: newRep, phase: "lowering" } : null);
    metricsRef.current.repetition = newRep;
    metricsRef.current.phase = "lowering";

    fetch("/api/ai/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: sessionId || "session_demo_sim",
        videoTimeMs: 2500, 
        repetitionNumber: newRep,
        exerciseId: "right_arm_raise",
        pose: {
          shoulderAngle: 62, // Intentionally low to trigger the "raise higher" AI feedback!
          elbowAngle: 150,
          movementDurationMs: 3000,
          rangeOfMotion: 62,
          poseConfidence: 0.99
        },
        eeg: {
          signalQuality: eegTelemetry?.signalQuality ?? 0.9,
          motorIntentScore: eegTelemetry?.motorAttemptProbability ?? 0.8
        }
      })
    })
    .then(res => res.json())
    .then((aiEvent: AIFeedbackEvent) => {
      if (aiEvent.suggestion) {
         window.speechSynthesis.cancel();
         window.speechSynthesis.speak(new SpeechSynthesisUtterance(aiEvent.suggestion));
      }
      onAIEvent(aiEvent);
    })
    .catch(err => console.error("AI Error:", err));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="relative aspect-video w-full max-w-3xl overflow-hidden rounded-2xl bg-gray-900 border-4 border-gray-200 shadow-lg">
        {!isLoaded && (
          <div className="absolute inset-0 flex items-center justify-center text-white">
            <p className="text-xl animate-pulse">Loading Camera & AI Tracking...</p>
          </div>
        )}
        
        <video ref={videoRef} className="absolute inset-0 h-full w-full" style={{ objectFit: "contain" }} playsInline muted />
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" style={{ objectFit: "contain" }} />
        
        {/* REC badge */}
        {isRecording && (
          <div className="absolute top-4 right-4 flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-full shadow-lg border-2 border-red-400 z-50">
            <div className="w-4 h-4 bg-white rounded-full animate-pulse"></div>
            <span className="font-bold tracking-wider">REC</span>
          </div>
        )}

        {/* Live AI Feedback overlay — bottom of camera, big and readable */}
        {liveFeedback && (
          <div className={`absolute bottom-0 left-0 right-0 z-50 px-6 py-4 text-center ${
            liveFeedback.severity === "warning"
              ? "bg-orange-500/90"
              : liveFeedback.severity === "success"
              ? "bg-green-600/90"
              : "bg-blue-600/90"
          }`}>
            <p className="text-white text-xl font-bold drop-shadow">
              {liveFeedback.severity === "warning" ? "⚠️" : liveFeedback.severity === "success" ? "✅" : "💬"}
              {" "}{liveFeedback.suggestion}
            </p>
          </div>
        )}
      </div>

      {metrics && (
        <div className="bg-white p-4 rounded-xl shadow border">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-bold text-lg">Live Telemetry</h3>
            <button 
              onClick={simulateRepetition}
              className="text-xs bg-indigo-100 hover:bg-indigo-200 text-indigo-800 font-bold px-3 py-1.5 rounded shadow-sm border border-indigo-200 transition-colors"
            >
              🛠 Simulate Rep
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><strong>Phase:</strong> {metrics.phase}</div>
            <div><strong>Reps:</strong> {metrics.repetition}</div>
            <div><strong>Shoulder Angle:</strong> {Math.round(metrics.rightShoulderAngle ?? 0)}°</div>
            <div><strong>Elbow Angle:</strong> {Math.round(metrics.rightElbowAngle ?? 0)}°</div>
            <div><strong>Feedback:</strong> <span className="text-red-600">{metrics.error || "Good"}</span></div>
          </div>
        </div>
      )}
    </div>
  );
}
