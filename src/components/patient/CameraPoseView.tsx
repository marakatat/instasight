"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { initializePoseLandmarker } from "@/lib/pose/poseTracker";
import { DrawingUtils, PoseLandmarker } from "@mediapipe/tasks-vision";
import { angle } from "@/lib/pose/geometry";
import { EXERCISE_LIBRARY } from "@/lib/pose/exerciseLibrary";
import { PoseMetrics, AIFeedbackEvent } from "@/types/rehabilitation";
import { EegTelemetry } from "@/lib/eeg/useEegStream";
import { speak } from "@/lib/voice/speak";

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
  exerciseId = "right_arm_raise",
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
  exerciseId?: string;
  onMetricsUpdate?: (metrics: PoseMetrics) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const hasAttemptedRecord = useRef(false);
  
  const [isLoaded, setIsLoaded] = useState(false);

  const metricsRef = useRef<PoseMetrics>({
    timestamp: 0,
    repetition: 0,
    phase: "idle",
    movementScore: 0,
    rangeOfMotion: 0,
  });

  const lastErrorRef = useRef<string | null>(null);
  const lastErrorTimeRef = useRef<number>(0);
  const lastRepTimeRef = useRef<number>(0);
  const recordingStartTimeRef = useRef<number>(0);

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
    if (isRecording) {
      hasAttemptedRecord.current = true;
      const stream = mediaStreamRef.current;
      if (!stream) {
        console.warn("No stream available to start recording.");
        return;
      }

      // Check if stream has active video tracks
      const hasLiveTracks = stream.getVideoTracks().some(t => t.readyState === "live");
      if (!hasLiveTracks) {
        console.warn("MediaStream tracks are not live yet, skipping recording start.");
        return;
      }

      recordedChunksRef.current = [];
      try {
        let mimeType = "";
        if (typeof MediaRecorder !== "undefined") {
          if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9")) {
            mimeType = "video/webm;codecs=vp9";
          } else if (MediaRecorder.isTypeSupported("video/webm;codecs=vp8")) {
            mimeType = "video/webm;codecs=vp8";
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

        recordingStartTimeRef.current = performance.now();
        recorder.start(1000);
        mediaRecorderRef.current = recorder;
      } catch (err) {
        console.error("Failed to start MediaRecorder:", err);
        // Fallback: if it fails to start, simulate a recording complete so the UI doesn't hang forever
        callbacksRef.current.onRecordingComplete(new Blob([]));
      }
    } else if (!isRecording && hasAttemptedRecord.current) {
      hasAttemptedRecord.current = false;
      if (mediaRecorderRef.current) {
        try {
          if (mediaRecorderRef.current.state !== "inactive") {
            mediaRecorderRef.current.stop();
          } else {
            // Already inactive, manually trigger completion just in case
            callbacksRef.current.onRecordingComplete(new Blob([]));
          }
        } catch (err) {
          console.error("Failed to stop MediaRecorder:", err);
          callbacksRef.current.onRecordingComplete(new Blob([]));
        }
      } else {
        // We never had a recorder, just proceed
        callbacksRef.current.onRecordingComplete(new Blob([]));
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

            if (result.landmarks[0]) {
              const exerciseDef = EXERCISE_LIBRARY[exerciseId] || EXERCISE_LIBRARY["right_arm_raise"];
              const newMetrics = exerciseDef.evaluator(
                result.landmarks[0],
                metricsRef.current.phase,
                metricsRef.current.repetition
              );

              if (mediaRecorderRef.current?.state === "recording" && 
                  metricsRef.current.phase === "holding" && 
                  newMetrics.phase === "lowering") {
                  
                  const now = performance.now();
                  // Debounce reps: require at least 2500ms between consecutive repetitions
                  if (now - lastRepTimeRef.current > 2500) {
                    lastRepTimeRef.current = now;
                    newMetrics.repetition += 1;

                    const { shouldTriggerAI, eegTelemetry: currentEeg, onAIEvent: handleEvent, onAIPromise: handlePromise } = callbacksRef.current;
                    
                    // Only trigger the heavy AI evaluation if there's an active form error, 
                    // or if it's a milestone repetition (every 5 reps) to offer encouragement.
                    const isImportantRep = !!newMetrics.error || (newMetrics.repetition % 5 === 0);
                    
                    if (isImportantRep && (!shouldTriggerAI || shouldTriggerAI())) {
                      const aiPromise = fetch("/api/ai/evaluate", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          sessionId: sessionId,
                          videoTimeMs: Math.round(performance.now() - recordingStartTimeRef.current),
                          repetitionNumber: newMetrics.repetition,
                          exerciseId: exerciseDef.id,
                          pose: {
                            shoulderAngle: newMetrics.rightShoulderAngle || 0,
                            elbowAngle: newMetrics.rightElbowAngle || 0,
                            movementDurationMs: 3000,
                            rangeOfMotion: newMetrics.rangeOfMotion,
                            poseConfidence: 0.95
                          },
                          eeg: currentEeg ? {
                            signalQuality: currentEeg.signalQuality,
                            attentionState: currentEeg.attentionState,
                            fatigueLevel: currentEeg.fatigueLevel,
                          } : null
                        })
                      })
                      .then(res => res.json())
                      .then((data: any) => {
                        const event = data.event || data;
                        if (event.error || !event.suggestion) return;
                        speak(event.suggestion);
                        if (handleEvent) {
                          handleEvent(event as AIFeedbackEvent);
                        }
                      })
                      .catch(err => console.error("AI processing error:", err));

                      if (handlePromise) {
                        handlePromise(aiPromise);
                      }
                    }
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
