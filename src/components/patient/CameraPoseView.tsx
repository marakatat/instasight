"use client";

import { useEffect, useRef, useState } from "react";
import { initializePoseLandmarker } from "@/lib/pose/poseTracker";
import { DrawingUtils, PoseLandmarker } from "@mediapipe/tasks-vision";
import { angle } from "@/lib/pose/geometry";
import { evaluateArmRaise } from "@/lib/pose/exerciseRules";
import { PoseMetrics, AIFeedbackEvent } from "@/types/rehabilitation";
import { motion, AnimatePresence } from "framer-motion";
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
  }, [isRecording, isLoaded]);

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
      if (
        !videoRef.current ||
        !canvasRef.current ||
        !poseLandmarker ||
        videoRef.current.readyState < 2 ||
        videoRef.current.videoWidth <= 0 ||
        videoRef.current.videoHeight <= 0
      ) {
        animationFrameId = requestAnimationFrame(predictWebcam);
        return;
      }

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");

      if (ctx && video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;

        if (video.videoWidth > 0 && canvas.width !== video.videoWidth) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }

        try {
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
        } catch (e) {
          // Ignore transient frame skips
        }
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
          shoulderAngle: 62,
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
    <div className="relative w-full h-full flex flex-col">
      <div className="relative flex-1 bg-black overflow-hidden group rounded-b-[2.5rem] min-h-[460px]">
        {!isLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-900 z-10">
            <div className="w-8 h-8 border-4 border-teal-400 border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}
        
        <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover opacity-80" playsInline muted />
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full object-cover" />
        
        {/* REC badge */}
        {isRecording && (
          <div className="absolute top-6 right-8 flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-full shadow-lg border border-red-500 z-50">
            <div className="w-3 h-3 bg-white rounded-full animate-pulse"></div>
            <span className="font-bold tracking-widest text-sm">REC</span>
          </div>
        )}

        {/* Live AI Feedback overlay — fluid framer motion slide up */}
        <AnimatePresence>
          {liveFeedback && (
            <motion.div 
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              transition={{ type: "spring", stiffness: 200, damping: 25 }}
              className="absolute bottom-6 left-6 right-6 z-50"
            >
              <div className={`px-6 py-5 rounded-2xl border backdrop-blur-xl shadow-2xl flex items-center gap-4 ${
                liveFeedback.severity === "warning"
                  ? "bg-amber-500/20 border-amber-500/40 text-amber-200"
                  : liveFeedback.severity === "success"
                  ? "bg-teal-500/20 border-teal-500/40 text-teal-200"
                  : "bg-blue-500/20 border-blue-500/40 text-white"
              }`}>
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-2xl bg-black/40 backdrop-blur-md shrink-0">
                  {liveFeedback.severity === "warning" ? "⚠️" : liveFeedback.severity === "success" ? "✅" : "💬"}
                </div>
                <p className="text-xl font-semibold leading-tight text-white drop-shadow-sm">
                  {liveFeedback.suggestion}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex justify-between items-center absolute bottom-6 right-6 z-40">
        <button 
          onClick={simulateRepetition}
          className="text-xs bg-black/40 backdrop-blur-md hover:bg-black/60 text-white font-bold px-4 py-2 rounded-xl shadow-sm border border-white/10 transition-colors"
        >
          🛠 Simulate Rep
        </button>
      </div>

      {metrics && (
        <div className="absolute bottom-6 left-6 z-40 bg-black/60 backdrop-blur-xl border border-white/10 p-4 rounded-2xl grid grid-cols-4 gap-4 text-white">
          <div>
            <p className="text-xs text-zinc-400 font-semibold mb-1">State</p>
            <p className="font-mono text-white text-base capitalize">{metrics.phase}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-400 font-semibold mb-1">Shoulder</p>
            <p className="font-mono text-white text-base">{Math.round(metrics.rightShoulderAngle || 0)}°</p>
          </div>
          <div>
            <p className="text-xs text-zinc-400 font-semibold mb-1">Elbow</p>
            <p className="font-mono text-white text-base">{Math.round(metrics.rightElbowAngle || 0)}°</p>
          </div>
          <div>
            <p className="text-xs text-zinc-400 font-semibold mb-1">Reps</p>
            <p className="font-mono text-teal-400 text-base font-bold">{metrics.repetition}</p>
          </div>
        </div>
      )}
    </div>
  );
}
