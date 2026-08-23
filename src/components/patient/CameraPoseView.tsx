"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { initializePoseLandmarker } from "@/lib/pose/poseTracker";
import { DrawingUtils, PoseLandmarker } from "@mediapipe/tasks-vision";
import { angle } from "@/lib/pose/geometry";
import { evaluateArmRaise } from "@/lib/pose/exerciseRules";
import { PoseMetrics, AIFeedbackEvent } from "@/types/rehabilitation";
import { EegTelemetry } from "@/lib/eeg/useEegStream";

export function CameraPoseView({ 
  isActive = true,
  isRecording, 
  onRecordingComplete,
  onAIEvent,
  onAIPromise,
  shouldTriggerAI,
  onLoaded,
  liveFeedback,
  eegTelemetry,
  sessionId = "session_live",
  onMetricsUpdate
}: {
  isActive?: boolean;
  isRecording: boolean;
  onRecordingComplete: (blob: Blob) => void;
  onAIEvent: (event: AIFeedbackEvent) => void;
  onAIPromise?: (p: Promise<void>) => void;
  shouldTriggerAI?: () => boolean;
  onLoaded?: () => void;
  liveFeedback?: { suggestion: string; severity: string } | null;
  eegTelemetry?: EegTelemetry | null;
  sessionId?: string;
  onMetricsUpdate?: (metrics: PoseMetrics) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  
  const [isLoaded, setIsLoaded] = useState(false);

  const metricsRef = useRef<PoseMetrics>({
    timestamp: 0,
    repetition: 0,
    phase: "idle",
    movementScore: 0,
    rangeOfMotion: 0,
  });

  const callbacksRef = useRef({
    onLoaded,
    onMetricsUpdate,
    onAIEvent,
    onAIPromise,
    shouldTriggerAI,
    onRecordingComplete,
    eegTelemetry,
  });

  useEffect(() => {
    callbacksRef.current = {
      onLoaded,
      onMetricsUpdate,
      onAIEvent,
      onAIPromise,
      shouldTriggerAI,
      onRecordingComplete,
      eegTelemetry,
    };
  });

  // MediaRecorder management — starts/stops cleanly without tearing down the stream
  useEffect(() => {
    const stream = mediaStreamRef.current;
    if (!stream) return;

    // Check if stream has active video tracks
    const hasLiveTracks = stream.getVideoTracks().some(t => t.readyState === "live");
    if (!hasLiveTracks) {
      console.warn("MediaStream tracks are not live yet, skipping recording start.");
      return;
    }

    if (isRecording) {
      recordedChunksRef.current = [];
      try {
        let mimeType = "";
        if (typeof MediaRecorder !== "undefined") {
          if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")) {
            mimeType = "video/webm;codecs=vp9,opus";
          } else if (MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")) {
            mimeType = "video/webm;codecs=vp8,opus";
          } else if (MediaRecorder.isTypeSupported("video/webm")) {
            mimeType = "video/webm";
          } else if (MediaRecorder.isTypeSupported("video/mp4")) {
            mimeType = "video/mp4";
          }
        }

        const options = mimeType ? { mimeType } : undefined;
        const recorder = new MediaRecorder(stream, options);

        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            recordedChunksRef.current.push(event.data);
          }
        };

        recorder.onstop = () => {
          const type = recorder.mimeType || mimeType || "video/webm";
          const blob = new Blob(recordedChunksRef.current, { type });
          callbacksRef.current.onRecordingComplete(blob);
          recordedChunksRef.current = [];
        };

        recorder.start(1000);
        mediaRecorderRef.current = recorder;
      } catch (err) {
        console.error("Failed to start MediaRecorder:", err);
      }
    } else if (!isRecording && mediaRecorderRef.current) {
      try {
        if (mediaRecorderRef.current.state !== "inactive") {
          mediaRecorderRef.current.stop();
        }
      } catch (err) {
        console.error("Failed to stop MediaRecorder:", err);
      }
    }
  }, [isRecording]);

  // Primary Camera & Pose Tracking Setup — ONLY runs on mount / isActive toggle
  useEffect(() => {
    if (!isActive) return;

    let animationFrameId: number;
    let lastVideoTime = -1;
    let poseLandmarker: any;
    let localStream: MediaStream | null = null;
    let isSubscribed = true;

    async function setupCameraAndMediaPipe() {
      try {
        poseLandmarker = await initializePoseLandmarker();

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: "user" 
          },
          audio: false,
        });
        
        if (!isSubscribed) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        
        localStream = stream;
        mediaStreamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          
          videoRef.current.onloadeddata = () => {
            if (!isSubscribed) return;
            setIsLoaded(true);
            if (callbacksRef.current.onLoaded) {
              callbacksRef.current.onLoaded();
            }
            predictWebcam();
          };

          try {
            await videoRef.current.play();
          } catch (err: any) {
            if (err.name !== "AbortError") console.error("Error playing video:", err);
          }
        }
      } catch (err) {
        console.error("Error setting up camera:", err);
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
              drawingUtils.drawLandmarks(landmark, { radius: 2.5, color: "#FFFFFF" });
              drawingUtils.drawConnectors(landmark, PoseLandmarker.POSE_CONNECTIONS, {
                color: "rgba(255, 255, 255, 0.6)",
                lineWidth: 1.5,
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

              if (mediaRecorderRef.current?.state === "recording" && 
                  metricsRef.current.phase === "holding" && 
                  newMetrics.phase === "lowering") {
                  newMetrics.repetition += 1;

                  const { shouldTriggerAI, eegTelemetry: currentEeg, onAIEvent: handleEvent, onAIPromise: handlePromise } = callbacksRef.current;
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
                        eeg: currentEeg ? {
                          signalQuality: currentEeg.signalQuality,
                          motorIntentScore: currentEeg.motorAttemptProbability
                        } : undefined
                      })
                    })
                    .then(res => res.json())
                    .then((aiEvent: any) => {
                      if (aiEvent.error || !aiEvent.suggestion) return;
                      if (typeof window !== "undefined" && window.speechSynthesis) {
                        window.speechSynthesis.cancel();
                        window.speechSynthesis.speak(new SpeechSynthesisUtterance(aiEvent.suggestion));
                      }
                      if (handleEvent) handleEvent(aiEvent as AIFeedbackEvent);
                    })
                    .catch(err => console.error("AI Evaluation Error:", err));

                    if (handlePromise) handlePromise(aiPromise as unknown as Promise<void>);
                  }
              }
              metricsRef.current = newMetrics;
              if (callbacksRef.current.onMetricsUpdate) {
                callbacksRef.current.onMetricsUpdate(newMetrics);
              }
            }
          }
          ctx.restore();
        } catch (e) {
          // Frame skip
        }
      }
      animationFrameId = requestAnimationFrame(predictWebcam);
    }

    setupCameraAndMediaPipe();

    return () => {
      isSubscribed = false;
      cancelAnimationFrame(animationFrameId);
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [isActive]); // Strictly depends on isActive only

  return (
    <div className="relative w-full h-full flex flex-col bg-black">
      <div className="relative flex-1 bg-black overflow-hidden group min-h-[460px]">
        {!isLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-black z-10">
            <div className="w-6 h-6 border-2 border-white border-t-transparent animate-spin" />
          </div>
        )}
        
        <video 
          ref={videoRef} 
          className="absolute inset-0 h-full w-full object-cover opacity-90" 
          playsInline 
          muted 
        />
        <canvas 
          ref={canvasRef} 
          className="absolute inset-0 h-full w-full object-cover pointer-events-none" 
        />
        
        {isRecording && (
          <div className="absolute top-6 right-8 flex items-center gap-2 bg-white text-black px-3 py-1.5 text-xs font-mono tracking-widest uppercase z-50">
            <div className="w-2 h-2 bg-red-600 animate-pulse" />
            <span>RECORDING</span>
          </div>
        )}

        {liveFeedback && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 min-w-[320px] max-w-md animate-in fade-in duration-200">
            <div className="px-5 py-3 border border-white/20 bg-black/95 text-white backdrop-blur-md">
              <span className="text-[10px] font-mono tracking-[0.2em] uppercase text-white/50 block mb-1">
                Clinical AI Feedback
              </span>
              <p className="text-sm font-medium leading-snug">
                {liveFeedback.suggestion}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
