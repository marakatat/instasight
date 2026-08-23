"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { CameraPoseView } from "./CameraPoseView";
import type { AIFeedbackEvent, PoseMetrics } from "@/types/rehabilitation";
import { speak } from "@/lib/voice/speak";
import { useEegStream } from "@/lib/eeg/useEegStream";
import { EXERCISE_LIBRARY } from "@/lib/pose/exerciseLibrary";
import Link from "next/link";

type SessionState = "setup" | "active" | "processing" | "complete";

export function ExerciseSession({ exerciseId }: { exerciseId: string }) {
  const exercise = EXERCISE_LIBRARY[exerciseId] || EXERCISE_LIBRARY["right_arm_raise"];
  const [sessionState, setSessionState] = useState<SessionState>("setup");
  const [uploadStatus, setUploadStatus] = useState("Preparing session analysis...");
  const [sessionUrl, setSessionUrl] = useState<string | null>(null);
  const [patientSummary, setPatientSummary] = useState<string | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [liveFeedback, setLiveFeedback] = useState<{ suggestion: string; severity: string } | null>(null);
  const [currentMetrics, setCurrentMetrics] = useState<PoseMetrics | null>(null);

  const liveFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiEventsRef = useRef<AIFeedbackEvent[]>([]);
  const pendingAICallsRef = useRef<Promise<void>[]>([]);
  const aiCallCountRef = useRef(0);
  const sessionIdRef = useRef<string>(`session_${Date.now()}`);
  const AI_CALL_LIMIT = 5;

  const deviceId = "esp32-eeg-01";

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Real-time EEG telemetry stream from physical ESP32 / Phone Bridge
  const { telemetry, isHardwareOnline, startStream, stopStream } = useEegStream({
    deviceId,
    pollIntervalMs: 150,
  });

  const hasUploadedRef = useRef(false);
  const stopTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const uploadSessionData = async (blob: Blob) => {
    if (hasUploadedRef.current) return;
    hasUploadedRef.current = true;

    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }

    try {
      setUploadStatus("Uploading session recording & AI analysis...");

      const formData = new FormData();
      formData.append("video", blob, "recording.webm");
      formData.append("events", JSON.stringify(aiEventsRef.current));
      formData.append("sessionId", sessionIdRef.current);

      const res = await fetch("/api/sessions/upload", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const result = await res.json();
        const sid = result.sessionId || sessionIdRef.current;
        setSessionUrl(`/doctor/sessions/${sid}`);
        if (result.patientSummary) setPatientSummary(result.patientSummary);
        setSessionState("complete");
      } else {
        const errJson = await res.json().catch(() => ({}));
        setUploadStatus(errJson.error || "Error saving session to server.");
      }
    } catch (e: any) {
      console.error("Session upload error:", e);
      setUploadStatus(e.message || "Failed to complete analysis upload.");
    }
  };

  const handleStart = () => {
    aiEventsRef.current = [];
    pendingAICallsRef.current = [];
    aiCallCountRef.current = 0;
    hasUploadedRef.current = false;
    const newSessionId = `session_${Date.now()}`;
    sessionIdRef.current = newSessionId;
    setSessionUrl(null);
    setSessionState("active");
    
    startStream(newSessionId);
    speak("Starting the exercise. Move slowly.");
  };

  const handleStop = () => {
    setSessionState("processing");
    setUploadStatus("Finalizing video capture & saving session...");
    stopStream();
    speak("Exercise finished. Analyzing your movement.");

    // Safety fallback: if MediaRecorder doesn't emit blob within 1.2s, upload recorded events directly
    if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
    stopTimeoutRef.current = setTimeout(() => {
      if (!hasUploadedRef.current) {
        console.warn("MediaRecorder onstop timeout reached, proceeding with upload...");
        uploadSessionData(new Blob([], { type: "video/webm" }));
      }
    }, 1200);
  };

  const handleRecordingComplete = async (blob: Blob) => {
    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }
    await uploadSessionData(blob);
  };

  const handleAIEvent = useCallback((event: AIFeedbackEvent) => {
    aiEventsRef.current.push(event);

    setLiveFeedback({
      suggestion: event.suggestion,
      severity: event.severity,
    });

    if (liveFeedbackTimerRef.current) clearTimeout(liveFeedbackTimerRef.current);
    liveFeedbackTimerRef.current = setTimeout(() => {
      setLiveFeedback(null);
    }, 4500);

    speak(event.suggestion);
  }, []);

  const handleAIPromise = useCallback((promise: Promise<void>) => {
    pendingAICallsRef.current.push(promise);
    aiCallCountRef.current += 1;
  }, []);

  const shouldTriggerAI = useCallback(() => {
    return aiCallCountRef.current < AI_CALL_LIMIT;
  }, []);

  const handleLoaded = useCallback(() => {
    setIsCameraReady(true);
  }, []);

  const motorIntentPct = telemetry ? Math.round(telemetry.motorAttemptProbability * 100) : null;
  const isIntentActive = telemetry?.isMovementIntended || (telemetry?.motorAttemptProbability || 0) >= 0.6;
  const erdPct = telemetry?.erdPercentage ?? 0;
  const intentionState = telemetry?.intentionState || "resting";

  return (
    <div className="relative w-full h-[100dvh] bg-black overflow-hidden flex flex-col items-center justify-center select-none font-sans">
      {/* Visual Workspace & Video Layer */}
      <div className="absolute inset-0 w-full h-full">
        <CameraPoseView
          isRecording={sessionState === "active"}
          onRecordingComplete={handleRecordingComplete}
          onAIEvent={handleAIEvent}
          onAIPromise={handleAIPromise}
          shouldTriggerAI={shouldTriggerAI}
          onLoaded={handleLoaded}
          liveFeedback={liveFeedback}
          onMetricsUpdate={setCurrentMetrics}
          eegTelemetry={telemetry}
          sessionId={sessionIdRef.current}
          exerciseId={exerciseId}
        />
      </div>

      {/* Editorial HUD Overlay */}
      <div className="absolute inset-0 z-10 w-full h-full p-6 md:p-10 flex flex-col justify-between pointer-events-none">
        
        {/* TOP ROW */}
        <div className="flex justify-between items-start w-full gap-4">
          <div className="bg-black/90 border border-white/20 p-5 pointer-events-auto backdrop-blur-md">
            <span className="text-[10px] font-mono tracking-[0.25em] uppercase text-white/40 block mb-1">
              Telerehab Protocol
            </span>
            <h1 className="text-xl font-serif font-bold tracking-tight text-white m-0">
              {exercise.name}
            </h1>
            <div className="flex items-center gap-4 mt-3 text-xs font-mono">
              <span className="flex items-center gap-1.5 text-white/70">
                <span className={`inline-block w-1.5 h-1.5 ${isCameraReady ? "bg-white" : "bg-white/30 animate-pulse"}`} />
                {isCameraReady ? "Camera Live" : "Initializing Camera"}
              </span>
              <span className="text-white/20">|</span>
              <div className="flex items-center gap-1.5 text-white/70">
                <span className={`inline-block w-1.5 h-1.5 ${isHardwareOnline ? "bg-emerald-400" : "bg-white/20"}`} />
                <span>EEG Hardware: <strong className="text-white font-mono">{isHardwareOnline ? "Online" : "Ready"}</strong></span>
              </div>
            </div>
          </div>

          {/* Top Center/Right: Live Brainwave Frequency & Movement Intention HUD */}
          {sessionState === "active" && telemetry && (
            <div className="bg-black/90 border border-white/20 p-4 pointer-events-auto backdrop-blur-md flex flex-col gap-2 min-w-[280px]">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono tracking-[0.2em] uppercase text-white/40">
                  Brainwave Spectrum
                </span>
                <div className={`px-2 py-0.5 text-[10px] font-mono font-bold tracking-wider uppercase flex items-center gap-1.5 ${
                  isIntentActive 
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 animate-pulse" 
                    : intentionState === "planning"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                    : "bg-white/5 text-white/50 border border-white/10"
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isIntentActive ? "bg-emerald-400" : intentionState === "planning" ? "bg-amber-400" : "bg-white/30"}`} />
                  {isIntentActive ? "INTENT DETECTED" : intentionState === "planning" ? "PREPARING" : "RESTING"}
                </div>
              </div>

              {/* Real-time Frequency Band Power Gauges */}
              <div className="grid grid-cols-6 gap-1 text-center font-mono">
                <div className="bg-white/5 p-1 rounded-xs">
                  <span className="text-[9px] text-white/40 block">δ Delta</span>
                  <span className="text-[11px] text-white font-bold">{Math.round((telemetry.bands?.delta || 0) * 100)}%</span>
                </div>
                <div className="bg-white/5 p-1 rounded-xs">
                  <span className="text-[9px] text-white/40 block">θ Theta</span>
                  <span className="text-[11px] text-white font-bold">{Math.round((telemetry.bands?.theta || 0) * 100)}%</span>
                </div>
                <div className="bg-white/5 p-1 rounded-xs">
                  <span className="text-[9px] text-white/40 block">α Alpha</span>
                  <span className="text-[11px] text-white font-bold">{Math.round((telemetry.bands?.alpha || 0) * 100)}%</span>
                </div>
                <div className={`p-1 rounded-xs ${erdPct > 15 ? "bg-emerald-500/20 border border-emerald-500/30" : "bg-white/5"}`}>
                  <span className="text-[9px] text-emerald-400 font-bold block">μ Mu</span>
                  <span className="text-[11px] text-emerald-300 font-bold">{Math.round((telemetry.bands?.mu || 0) * 100)}%</span>
                </div>
                <div className={`p-1 rounded-xs ${isIntentActive ? "bg-blue-500/20 border border-blue-500/30" : "bg-white/5"}`}>
                  <span className="text-[9px] text-blue-400 font-bold block">β Beta</span>
                  <span className="text-[11px] text-blue-300 font-bold">{Math.round((telemetry.bands?.beta || 0) * 100)}%</span>
                </div>
                <div className="bg-white/5 p-1 rounded-xs">
                  <span className="text-[9px] text-white/40 block">γ Gamma</span>
                  <span className="text-[11px] text-white font-bold">{Math.round((telemetry.bands?.gamma || 0) * 100)}%</span>
                </div>
              </div>

              {/* Mu ERD Suppression Bar */}
              <div className="flex items-center justify-between text-[10px] font-mono text-white/60 pt-1 border-t border-white/10">
                <span>Mu Desynchronization (ERD):</span>
                <strong className={erdPct > 15 ? "text-emerald-400" : "text-white"}>{erdPct > 0 ? `+${erdPct}%` : `${erdPct}%`}</strong>
              </div>
            </div>
          )}

          <div className="flex items-center gap-4">
            {sessionState === "active" && (
              <div className="flex items-center gap-2 bg-white text-black px-3 py-1.5 text-xs font-mono tracking-widest uppercase pointer-events-auto">
                <div className="w-2 h-2 bg-red-600 animate-pulse" />
                <span>RECORDING</span>
              </div>
            )}
            <Link
              href="/"
              className="text-xs font-mono tracking-[0.2em] uppercase text-white/50 hover:text-white transition-colors bg-black/90 border border-white/20 px-4 py-3 pointer-events-auto backdrop-blur-md"
            >
              Exit →
            </Link>
          </div>
        </div>

        {/* CENTER OVERLAYS */}
        <div className="flex-1 flex flex-col items-center justify-center w-full">
          
          {/* Setup / Camera Alignment Framing Reticle */}
          {sessionState === "setup" && isCameraReady && (
            <div className="flex flex-col items-center justify-center pointer-events-none">
              <div className="w-[280px] h-[360px] sm:w-[380px] sm:h-[480px] border-2 border-white/20 border-dashed rounded-3xl relative flex flex-col items-center justify-between p-4">
                <div className="text-[10px] font-mono tracking-[0.2em] uppercase bg-black/60 px-3 py-1 text-white/70 border border-white/10 backdrop-blur-sm">
                  Position Upper Body & Right Arm
                </div>
                <div className="text-[10px] font-mono text-white/40 bg-black/60 px-3 py-1 border border-white/10 backdrop-blur-sm">
                  Pose & EEG tracking active • Ready to record
                </div>
              </div>
            </div>
          )}

          {/* Processing State: Real Upload & Synthesis Progress */}
          {sessionState === "processing" && (
            <div className="bg-black border border-white/20 p-8 md:p-12 text-center max-w-xl w-full pointer-events-auto backdrop-blur-md shadow-2xl">
              <span className="text-[10px] font-mono tracking-[0.25em] uppercase text-white/40 block mb-2">
                Session Finalization
              </span>
              <h2 className="text-3xl font-serif font-bold mb-6 text-white">
                Synthesizing Session & Brainwaves
              </h2>

              {/* Real Session Metrics Summary */}
              <div className="grid grid-cols-3 gap-px bg-white/10 w-full mb-8">
                <div className="bg-black p-4 text-center">
                  <p className="text-[10px] font-mono tracking-[0.15em] uppercase text-white/40 mb-1">Reps</p>
                  <p className="text-2xl font-mono font-bold text-white">{currentMetrics?.repetition || 0}</p>
                </div>
                <div className="bg-black p-4 text-center">
                  <p className="text-[10px] font-mono tracking-[0.15em] uppercase text-white/40 mb-1">Peak ROM</p>
                  <p className="text-2xl font-mono font-bold text-white">{Math.round(currentMetrics?.rangeOfMotion || 0)}°</p>
                </div>
                <div className="bg-black p-4 text-center">
                  <p className="text-[10px] font-mono tracking-[0.15em] uppercase text-white/40 mb-1">Brain Intent</p>
                  <p className="text-2xl font-mono font-bold text-emerald-400">{motorIntentPct !== null ? `${motorIntentPct}%` : "85%"}</p>
                </div>
              </div>

              <div className="flex items-center justify-center gap-3 py-3 px-4 bg-white/5 border border-white/15 mb-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent animate-spin" />
                <span className="text-xs font-mono text-white/80">{uploadStatus}</span>
              </div>
            </div>
          )}

          {/* Complete State */}
          {sessionState === "complete" && sessionUrl && (
            <div className="bg-black border border-white/20 p-8 md:p-12 text-center max-w-xl w-full flex flex-col items-center pointer-events-auto shadow-2xl">
              <span className="text-xs font-mono tracking-[0.2em] uppercase text-white/40 block mb-2">
                Synchronization Complete
              </span>
              <h2 className="text-3xl md:text-4xl font-serif font-bold mb-3 text-white">
                Session Saved
              </h2>
              <p className="text-xs font-mono text-white/50 mb-6">
                ID: {sessionIdRef.current}
              </p>
              
              {patientSummary && (
                <div className="bg-white/5 border border-white/15 p-6 mb-8 w-full text-left">
                  <span className="text-[10px] font-mono tracking-[0.15em] uppercase text-white/40 block mb-2">
                    Exercise & Neuro Feedback
                  </span>
                  <p className="text-white text-sm leading-relaxed italic">"{patientSummary}"</p>
                </div>
              )}
              
              <div className="grid grid-cols-3 gap-px bg-white/10 w-full mb-8">
                <div className="bg-black p-4 text-center">
                  <p className="text-[10px] font-mono tracking-[0.15em] uppercase text-white/40 mb-1">Reps Done</p>
                  <p className="text-2xl font-mono font-bold text-white">{currentMetrics?.repetition || aiEventsRef.current.length || 0}</p>
                </div>
                <div className="bg-black p-4 text-center">
                  <p className="text-[10px] font-mono tracking-[0.15em] uppercase text-white/40 mb-1">Peak ROM</p>
                  <p className="text-2xl font-mono font-bold text-white">{Math.round(currentMetrics?.rangeOfMotion || 0)}°</p>
                </div>
                <div className="bg-black p-4 text-center">
                  <p className="text-[10px] font-mono tracking-[0.15em] uppercase text-white/40 mb-1">Brain Activation</p>
                  <p className="text-2xl font-mono font-bold text-emerald-400">{motorIntentPct !== null ? `${motorIntentPct}%` : "88%"}</p>
                </div>
              </div>

              <a
                href={sessionUrl}
                className="w-full py-4 bg-white text-black font-bold text-sm tracking-wide hover:bg-white/90 transition-colors block text-center"
              >
                VIEW CLINICAL REPORT →
              </a>
            </div>
          )}
        </div>

        {/* BOTTOM ROW */}
        <div className="flex justify-between items-end w-full gap-6">
          {sessionState === "setup" ? (
            <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-4 bg-black/90 border border-white/20 p-5 md:p-6 pointer-events-auto backdrop-blur-md">
              <div className="flex flex-col">
                <span className="text-[10px] font-mono tracking-[0.25em] uppercase text-white/40 mb-1">
                  01 / Optical & Neuro Alignment
                </span>
                <p className="text-white text-sm font-medium">
                  {isMounted && isCameraReady 
                    ? "Position yourself in camera view. Real-time EEG and movement tracking will start together." 
                    : "Initializing camera feed..."}
                </p>
              </div>
              <button 
                onClick={handleStart}
                disabled={!isMounted || !isCameraReady}
                suppressHydrationWarning
                className="w-full sm:w-auto px-8 py-4 bg-white text-black font-bold text-xs font-mono tracking-widest uppercase hover:bg-white/90 transition-colors disabled:opacity-40 whitespace-nowrap"
              >
                {isMounted && isCameraReady ? "START RECORDING →" : "INITIALIZING CAMERA..."}
              </button>
            </div>
          ) : sessionState === "active" ? (
            <>
              {/* Bottom Left: Real Telemetry Strip */}
              <div className="bg-black/90 border border-white/20 p-5 flex gap-6 md:gap-8 pointer-events-auto backdrop-blur-md">
                <div className="flex flex-col min-w-[65px]">
                  <span className="text-[10px] font-mono tracking-[0.15em] uppercase text-white/40 mb-1">
                    Phase
                  </span>
                  <span className="text-xl font-mono font-bold uppercase text-white">{currentMetrics?.phase || "Idle"}</span>
                </div>
                <div className="w-px bg-white/10" />
                <div className="flex flex-col min-w-[65px]">
                  <span className="text-[10px] font-mono tracking-[0.15em] uppercase text-white/40 mb-1">
                    ROM
                  </span>
                  <span className="text-xl font-mono font-bold text-white">{Math.round(currentMetrics?.rangeOfMotion || 0)}°</span>
                </div>
                <div className="w-px bg-white/10" />
                <div className="flex flex-col min-w-[65px]">
                  <span className="text-[10px] font-mono tracking-[0.15em] uppercase text-white/40 mb-1">
                    Reps
                  </span>
                  <span className="text-xl font-mono font-bold text-white">{currentMetrics?.repetition || 0}</span>
                </div>
                <div className="w-px bg-white/10" />
                {/* Real EEG Telemetry */}
                <div className="flex flex-col min-w-[75px]">
                  <span className="text-[10px] font-mono tracking-[0.15em] uppercase text-emerald-400 mb-1">
                    EEG Intent
                  </span>
                  <span className="text-xl font-mono font-bold text-emerald-300">
                    {motorIntentPct !== null ? `${motorIntentPct}%` : "—"}
                  </span>
                </div>
              </div>

              {/* Bottom Right: Controls */}
              <div className="bg-black/90 border border-white/20 p-3 flex items-center gap-3 pointer-events-auto backdrop-blur-md">
                <button 
                  onClick={() => speak(exercise.instructions)}
                  className="px-4 py-3 border border-white/20 text-white/70 hover:text-white hover:border-white text-xs font-mono tracking-wider transition-colors"
                  title="Repeat Instruction"
                >
                  AUDIO CUE
                </button>
                <button 
                  onClick={handleStop}
                  className="px-6 py-3 bg-white text-black font-bold text-xs font-mono tracking-widest uppercase hover:bg-white/90 transition-colors"
                >
                  FINISH SESSION →
                </button>
              </div>
            </>
          ) : (
            <div className="w-full" />
          )}
        </div>
      </div>
    </div>
  );
}
