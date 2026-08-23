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
  const [processingStage, setProcessingStage] = useState(1);
  const [uploadStatus, setUploadStatus] = useState("Encoding video capture...");
  const [sessionUrl, setSessionUrl] = useState<string | null>(null);
  const [patientSummary, setPatientSummary] = useState<string | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [liveFeedback, setLiveFeedback] = useState<{ suggestion: string; severity: string } | null>(null);
  const [currentMetrics, setCurrentMetrics] = useState<PoseMetrics | null>(null);

  const liveFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiEventsRef = useRef<AIFeedbackEvent[]>([]);
  const pendingAICallsRef = useRef<Promise<void>[]>([]);
  const aiCallCountRef = useRef(0);
  const sessionIdRef = useRef<string>(`session_${Date.now()}`);
  const AI_CALL_LIMIT = 5;

  // Real-time EEG telemetry stream from physical ESP32
  const { telemetry, isHardwareOnline, startStream, stopStream } = useEegStream({
    deviceId: "esp32-01",
    pollIntervalMs: 150,
  });

  const handleStart = () => {
    aiEventsRef.current = [];
    pendingAICallsRef.current = [];
    aiCallCountRef.current = 0;
    const newSessionId = `session_${Date.now()}`;
    sessionIdRef.current = newSessionId;
    setSessionUrl(null);
    setProcessingStage(1);
    setSessionState("active");
    
    startStream(newSessionId);
    speak("Starting the exercise. Move slowly.");
  };

  const handleStop = () => {
    setSessionState("processing");
    setProcessingStage(1);
    setUploadStatus("Finalizing kinematic tracking...");
    stopStream();
    speak("Exercise finished. Analyzing your movement.");
  };

  const handleRecordingComplete = async (blob: Blob) => {
    try {
      setProcessingStage(2);
      setUploadStatus("Syncing timecodes and uploading video stream...");
      
      // Wait for any inflight AI cues to finish
      if (pendingAICallsRef.current.length > 0) {
        await Promise.allSettled(pendingAICallsRef.current);
      }

      setProcessingStage(3);
      setUploadStatus("Generating clinical report & PT analysis...");

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
        setUploadStatus("Error syncing session with server.");
      }
    } catch (e) {
      console.error(e);
      setUploadStatus("Failed to complete analysis upload.");
    }
  };

  const handleAIEvent = useCallback((event: AIFeedbackEvent) => {
    aiEventsRef.current.push(event);
    setLiveFeedback({ suggestion: event.suggestion, severity: event.severity });
    if (liveFeedbackTimerRef.current) clearTimeout(liveFeedbackTimerRef.current);
    liveFeedbackTimerRef.current = setTimeout(() => setLiveFeedback(null), 8000);
  }, []);

  const handleAIPromise = useCallback((promise: Promise<void>) => {
    pendingAICallsRef.current.push(promise);
  }, []);

  const shouldTriggerAI = useCallback(() => {
    aiCallCountRef.current += 1;
    return aiCallCountRef.current <= AI_CALL_LIMIT;
  }, []);

  const handleLoaded = useCallback(() => {
    setIsCameraReady(true);
  }, []);

  const motorIntentPct = telemetry ? Math.round((telemetry.motorAttemptProbability ?? 0) * 100) : null;

  return (
    <div className="min-h-[100dvh] bg-black text-white overflow-hidden flex flex-col font-sans relative">
      
      {/* Live Camera Layer (Full visibility for patient during setup & workout) */}
      <div className={`absolute inset-0 transition-opacity duration-500 ${sessionState === "processing" ? "opacity-10 pointer-events-none" : "opacity-100"}`}>
        <CameraPoseView 
          isActive={sessionState === "setup" || sessionState === "active"}
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
        <div className="flex justify-between items-start w-full">
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
              <span className="flex items-center gap-1.5 text-white/70">
                <span className={`inline-block w-1.5 h-1.5 ${isHardwareOnline ? "bg-white" : "bg-white/20"}`} />
                {isHardwareOnline ? "ESP32 Linked" : "ESP32 Disconnected"}
              </span>
            </div>
          </div>

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
          
          {/* Setup / Camera Alignment Box (Positioned unobtrusively so user sees camera) */}
          {sessionState === "setup" && isCameraReady && (
            <div className="bg-black/90 border border-white/20 p-8 md:p-10 text-center max-w-md pointer-events-auto backdrop-blur-md shadow-2xl">
              <span className="text-xs font-mono tracking-[0.2em] uppercase text-white/40 block mb-2">
                01 / Camera Alignment
              </span>
              <h2 className="text-2xl md:text-3xl font-serif font-bold mb-3 text-white">
                Position Camera
              </h2>
              <p className="text-white/60 text-xs leading-relaxed mb-6 font-mono">
                {exercise.description} Verify your full body is clearly visible in the preview above. When positioned, begin the exercise.
              </p>
              <button 
                onClick={handleStart}
                className="w-full py-4 bg-white text-black font-bold text-sm tracking-wide hover:bg-white/90 transition-colors"
              >
                START RECORDING →
              </button>
            </div>
          )}

          {/* Processing State: Authentic Clinical Pipeline */}
          {sessionState === "processing" && (
            <div className="bg-black border border-white/20 p-8 md:p-12 text-center max-w-xl w-full pointer-events-auto backdrop-blur-md">
              <span className="text-[10px] font-mono tracking-[0.25em] uppercase text-white/40 block mb-3">
                Telemetry Pipeline
              </span>
              <h2 className="text-3xl font-serif font-bold mb-6 text-white">
                Synthesizing Session
              </h2>

              <div className="space-y-3 text-left mb-8 font-mono text-xs">
                <div className={`p-3 border flex items-center justify-between ${processingStage >= 1 ? "border-white/40 bg-white/5 text-white" : "border-white/10 text-white/30"}`}>
                  <span>01. KINEMATIC EXTRACTION & DSP</span>
                  <span>{processingStage > 1 ? "COMPLETE" : "RUNNING..."}</span>
                </div>
                <div className={`p-3 border flex items-center justify-between ${processingStage >= 2 ? "border-white/40 bg-white/5 text-white" : "border-white/10 text-white/30"}`}>
                  <span>02. VIDEO TIMECODE ENCODING</span>
                  <span>{processingStage > 2 ? "COMPLETE" : processingStage === 2 ? "UPLOADING..." : "PENDING"}</span>
                </div>
                <div className={`p-3 border flex items-center justify-between ${processingStage >= 3 ? "border-white/40 bg-white/5 text-white" : "border-white/10 text-white/30"}`}>
                  <span>03. CLINICAL AI DOCTOR REPORT</span>
                  <span>{processingStage === 3 ? "GENERATING..." : "PENDING"}</span>
                </div>
              </div>

              <div className="h-1 bg-white/10 w-full mb-4 overflow-hidden relative">
                <div 
                  className="h-full bg-white transition-all duration-700" 
                  style={{ width: `${(processingStage / 3) * 100}%` }}
                />
              </div>
              <p className="text-white/40 text-xs font-mono">{uploadStatus}</p>
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
                    Exercise Feedback
                  </span>
                  <p className="text-white text-sm leading-relaxed italic">"{patientSummary}"</p>
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-px bg-white/10 w-full mb-8">
                <div className="bg-black p-5 text-center">
                  <p className="text-[10px] font-mono tracking-[0.15em] uppercase text-white/40 mb-1">Reps Completed</p>
                  <p className="text-3xl font-mono font-bold text-white">{currentMetrics?.repetition || aiEventsRef.current.length || 0}</p>
                </div>
                <div className="bg-black p-5 text-center">
                  <p className="text-[10px] font-mono tracking-[0.15em] uppercase text-white/40 mb-1">AI Events Logged</p>
                  <p className="text-3xl font-mono font-bold text-white">{aiEventsRef.current.length}</p>
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
          {sessionState === "active" ? (
            <>
              {/* Bottom Left: Real Telemetry Strip */}
              <div className="bg-black/90 border border-white/20 p-5 flex gap-8 pointer-events-auto backdrop-blur-md">
                <div className="flex flex-col min-w-[70px]">
                  <span className="text-[10px] font-mono tracking-[0.15em] uppercase text-white/40 mb-1">
                    Phase
                  </span>
                  <span className="text-xl font-mono font-bold uppercase text-white">{currentMetrics?.phase || "Idle"}</span>
                </div>
                <div className="w-px bg-white/10" />
                <div className="flex flex-col min-w-[70px]">
                  <span className="text-[10px] font-mono tracking-[0.15em] uppercase text-white/40 mb-1">
                    ROM
                  </span>
                  <span className="text-xl font-mono font-bold text-white">{Math.round(currentMetrics?.rangeOfMotion || 0)}°</span>
                </div>
                <div className="w-px bg-white/10" />
                <div className="flex flex-col min-w-[70px]">
                  <span className="text-[10px] font-mono tracking-[0.15em] uppercase text-white/40 mb-1">
                    Reps
                  </span>
                  <span className="text-xl font-mono font-bold text-white">{currentMetrics?.repetition || 0}</span>
                </div>
                <div className="w-px bg-white/10" />
                {/* Real EEG Telemetry */}
                <div className="flex flex-col min-w-[70px]">
                  <span className="text-[10px] font-mono tracking-[0.15em] uppercase text-white/40 mb-1">
                    EEG Intent
                  </span>
                  <span className="text-xl font-mono font-bold text-white">
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
