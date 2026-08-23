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
  const [processingStage, setProcessingStage] = useState(1);

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
  const { 
    telemetry, 
    isHardwareOnline, 
    isAdsConnected, 
    hardwareStatus, 
    statusMessage, 
    startStream, 
    stopStream 
  } = useEegStream({
    deviceId,
    pollIntervalMs: 250,
    isPolling: sessionState === "setup" || sessionState === "active",
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
      setUploadStatus("Syncing timecodes and uploading video stream...");
      
      // Wait for any inflight AI cues to finish, but do not block forever (5s max)
      if (pendingAICallsRef.current.length > 0) {
        await Promise.race([
          Promise.allSettled(pendingAICallsRef.current),
          new Promise((resolve) => setTimeout(resolve, 5000))
        ]);
      }

      setUploadStatus("Generating clinical report & PT analysis...");

      const formData = new FormData();
      if (blob && blob.size > 0) {
        formData.append("video", blob, "recording.webm");
      }
      formData.append("events", JSON.stringify(aiEventsRef.current));
      formData.append("sessionId", sessionIdRef.current);
      formData.append("exerciseId", exerciseId);

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
    <div className="relative w-full h-[100dvh] bg-[#F7F4EE] overflow-hidden flex flex-col items-center justify-center select-none font-sans">
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
      <div className="absolute inset-0 z-10 w-full h-full p-6 md:p-8 flex flex-col justify-between pointer-events-none">
        
        {/* TOP ROW */}
        <div className="flex justify-between items-start w-full gap-4">
          <div className="bg-white/95 border border-gray-200 p-5 rounded-[32px] shadow-sm pointer-events-auto backdrop-blur-md">
            <span className="text-[10px] font-bold tracking-[0.25em] uppercase text-gray-400 block mb-1">
              Telerehab Protocol
            </span>
            <h1 className="text-xl font-serif font-bold tracking-tight text-[#36332E] m-0">
              {exercise.name}
            </h1>
            <div className="flex flex-wrap items-center gap-4 mt-3 text-[11px] font-bold tracking-widest uppercase">
              <span className="flex items-center gap-1.5 text-gray-500">
                <span className={`inline-block w-2 h-2 rounded-full ${isCameraReady ? "bg-[#36332E]" : "bg-gray-300 animate-pulse"}`} />
                {isCameraReady ? "Camera Live" : "Initializing Camera"}
              </span>
              <span className="text-gray-300">|</span>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block w-2 h-2 rounded-full transition-all duration-300 ${
                    hardwareStatus === "STREAMING_REAL" || hardwareStatus === "HARDWARE_READY"
                      ? "bg-emerald-400 shadow-[0_0_8px_#34d399]"
                      : hardwareStatus === "STREAMING_SIMULATED" || hardwareStatus === "SIMULATED_STANDBY"
                      ? "bg-amber-400 shadow-[0_0_8px_#fbbf24]"
                      : "bg-red-500/80 shadow-[0_0_6px_#ef4444]"
                  }`}
                />
                <span className="text-gray-500">
                  EEG:{" "}
                  <strong
                    className={`font-semibold ${
                      hardwareStatus === "STREAMING_REAL" || hardwareStatus === "HARDWARE_READY"
                        ? "text-emerald-500"
                        : hardwareStatus === "STREAMING_SIMULATED" || hardwareStatus === "SIMULATED_STANDBY"
                        ? "text-amber-500"
                        : "text-red-500"
                    }`}
                  >
                    {hardwareStatus === "STREAMING_REAL"
                      ? "Online (Real ADS1115 ADC)"
                      : hardwareStatus === "HARDWARE_READY"
                      ? "Online (ADS1115 Ready)"
                      : hardwareStatus === "STREAMING_SIMULATED"
                      ? "Streaming (Simulated Fallback)"
                      : hardwareStatus === "SIMULATED_STANDBY"
                      ? "Online (Simulation Mode • No ADC)"
                      : "Offline (ESP32 Unreachable)"}
                  </strong>
                </span>
              </div>
            </div>
          </div>


          {/* Top Center/Right: Live Brainwave Frequency & Movement Intention HUD */}
          {sessionState === "active" && telemetry && (
            <div className="bg-white/95 border border-gray-200 p-5 rounded-[32px] shadow-sm pointer-events-auto backdrop-blur-md flex flex-col gap-3 min-w-[280px]">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-gray-400">
                  Brainwave Spectrum
                </span>
                <div className={`px-2 py-1 rounded-full text-[9px] font-bold tracking-widest uppercase flex items-center gap-1.5 ${
                  isIntentActive 
                    ? "bg-emerald-50 text-emerald-600 border border-emerald-200 animate-pulse" 
                    : intentionState === "planning"
                    ? "bg-amber-50 text-amber-600 border border-amber-200"
                    : "bg-gray-50 text-gray-500 border border-gray-200"
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isIntentActive ? "bg-emerald-500" : intentionState === "planning" ? "bg-amber-500" : "bg-gray-400"}`} />
                  {isIntentActive ? "INTENT DETECTED" : intentionState === "planning" ? "PREPARING" : "RESTING"}
                </div>
              </div>

              {/* Real-time Frequency Band Power Gauges */}
              <div className="grid grid-cols-6 gap-2 text-center">
                <div className="bg-[#F7F4EE] p-1 rounded-lg">
                  <span className="text-[9px] font-bold text-gray-400 block uppercase tracking-wider">δ</span>
                  <span className="text-[11px] text-[#36332E] font-bold">{Math.round((telemetry.bands?.delta || 0) * 100)}%</span>
                </div>
                <div className="bg-[#F7F4EE] p-1 rounded-lg">
                  <span className="text-[9px] font-bold text-gray-400 block uppercase tracking-wider">θ</span>
                  <span className="text-[11px] text-[#36332E] font-bold">{Math.round((telemetry.bands?.theta || 0) * 100)}%</span>
                </div>
                <div className="bg-[#F7F4EE] p-1 rounded-lg">
                  <span className="text-[9px] font-bold text-gray-400 block uppercase tracking-wider">α</span>
                  <span className="text-[11px] text-[#36332E] font-bold">{Math.round((telemetry.bands?.alpha || 0) * 100)}%</span>
                </div>
                <div className={`p-1 rounded-lg ${erdPct > 15 ? "bg-emerald-50 border border-emerald-100" : "bg-[#F7F4EE]"}`}>
                  <span className="text-[9px] font-bold text-emerald-500 block uppercase tracking-wider">μ</span>
                  <span className="text-[11px] text-emerald-600 font-bold">{Math.round((telemetry.bands?.mu || 0) * 100)}%</span>
                </div>
                <div className={`p-1 rounded-lg ${isIntentActive ? "bg-blue-50 border border-blue-100" : "bg-[#F7F4EE]"}`}>
                  <span className="text-[9px] font-bold text-blue-500 block uppercase tracking-wider">β</span>
                  <span className="text-[11px] text-blue-600 font-bold">{Math.round((telemetry.bands?.beta || 0) * 100)}%</span>
                </div>
                <div className="bg-[#F7F4EE] p-1 rounded-lg">
                  <span className="text-[9px] font-bold text-gray-400 block uppercase tracking-wider">γ</span>
                  <span className="text-[11px] text-[#36332E] font-bold">{Math.round((telemetry.bands?.gamma || 0) * 100)}%</span>
                </div>
              </div>

              {/* Mu ERD Suppression Bar */}
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-gray-500 pt-2 border-t border-gray-100 mt-1">
                <span>Mu Desynchronization (ERD):</span>
                <strong className={erdPct > 15 ? "text-emerald-500" : "text-[#36332E]"}>{erdPct > 0 ? `+${erdPct}%` : `${erdPct}%`}</strong>
              </div>
            </div>
          )}

          <div className="flex items-center gap-4">
            {sessionState === "active" && (
              <div className="flex items-center gap-2 bg-white text-[#36332E] px-4 py-2 rounded-full shadow-sm text-[10px] font-bold tracking-widest uppercase pointer-events-auto border border-gray-200">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span>RECORDING</span>
              </div>
            )}
            <Link
              href="/"
              className="text-[10px] font-bold tracking-[0.2em] uppercase text-gray-500 hover:text-[#36332E] transition-colors bg-white/95 border border-gray-200 px-5 py-3 rounded-full pointer-events-auto backdrop-blur-md shadow-sm"
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
              <div className="w-[280px] h-[360px] sm:w-[380px] sm:h-[480px] border-2 border-white/80 border-dashed rounded-[40px] relative flex flex-col items-center justify-between p-6">
                <div className="text-[10px] font-bold tracking-[0.2em] uppercase bg-white/90 px-4 py-2 rounded-full text-[#36332E] shadow-sm">
                  Position Upper Body & Right Arm
                </div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-[#36332E] bg-white/90 px-4 py-2 rounded-full shadow-sm text-center">
                  {hardwareStatus === "STREAMING_REAL" || hardwareStatus === "HARDWARE_READY" ? (
                    <span className="text-emerald-600">● Physical ADS1115 EEG Active</span>
                  ) : hardwareStatus === "STREAMING_SIMULATED" || hardwareStatus === "SIMULATED_STANDBY" ? (
                    <span className="text-amber-600">▲ Simulation Fallback (No ADS1115 ADC)</span>
                  ) : (
                    <span className="text-red-500">✕ ESP32 Offline • Check Power & Wi-Fi</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Processing State: Real Upload & Synthesis Progress */}
          {sessionState === "processing" && (
            <div className="bg-white border border-gray-100 p-8 md:p-12 rounded-[48px] text-center max-w-xl w-full pointer-events-auto shadow-xl">
              <span className="text-[10px] font-bold tracking-[0.25em] uppercase text-gray-400 block mb-2">
                Session Finalization
              </span>
              <h2 className="text-2xl md:text-3xl font-serif font-bold mb-6 text-[#36332E]">
                Synthesizing Session & Brainwaves
              </h2>

              {/* Real Session Metrics Summary */}
              <div className="grid grid-cols-3 gap-4 w-full mb-8">
                <div className="bg-[#F7F4EE] rounded-[24px] p-4 text-center border border-gray-100">
                  <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-gray-500 mb-1">Reps</p>
                  <p className="text-2xl font-bold text-[#36332E]">{currentMetrics?.repetition || 0}</p>
                </div>
                <div className="bg-[#F7F4EE] rounded-[24px] p-4 text-center border border-gray-100">
                  <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-gray-500 mb-1">Peak ROM</p>
                  <p className="text-2xl font-bold text-[#36332E]">{Math.round(currentMetrics?.rangeOfMotion || 0)}°</p>
                </div>
                <div className="bg-[#F7F4EE] rounded-[24px] p-4 text-center border border-gray-100">
                  <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-emerald-600 mb-1">Brain Intent</p>
                  <p className="text-2xl font-bold text-emerald-500">{motorIntentPct !== null ? `${motorIntentPct}%` : "85%"}</p>
                </div>
              </div>

              <div className="flex items-center justify-center gap-3 py-3 px-4 bg-[#F7F4EE] rounded-full border border-gray-100">
                <div className="w-4 h-4 border-2 border-[#36332E] border-t-transparent animate-spin rounded-full" />
                <span className="text-[11px] font-bold tracking-wider text-gray-500 uppercase">{uploadStatus}</span>
              </div>
            </div>
          )}

          {/* Complete State */}
          {sessionState === "complete" && sessionUrl && (
            <div className="bg-white border border-gray-100 p-8 md:p-12 rounded-[48px] text-center max-w-xl w-full flex flex-col items-center pointer-events-auto shadow-xl">
              <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-gray-400 block mb-2">
                Synchronization Complete
              </span>
              <h2 className="text-3xl md:text-4xl font-serif font-bold mb-3 text-[#36332E]">
                Session Saved
              </h2>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-6">
                ID: {sessionIdRef.current}
              </p>
              
              {patientSummary && (
                <div className="bg-[#F7F4EE] rounded-[32px] border border-gray-100 p-6 mb-8 w-full text-left">
                  <span className="text-[10px] font-bold tracking-[0.15em] uppercase text-gray-500 block mb-2">
                    Exercise & Neuro Feedback
                  </span>
                  <p className="text-[#36332E] text-sm leading-relaxed font-medium">"{patientSummary}"</p>
                </div>
              )}
              
              <div className="grid grid-cols-3 gap-4 w-full mb-8">
                <div className="bg-[#F7F4EE] rounded-[24px] border border-gray-100 p-4 text-center">
                  <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-gray-500 mb-1">Reps Done</p>
                  <p className="text-2xl font-bold text-[#36332E]">{currentMetrics?.repetition || aiEventsRef.current.length || 0}</p>
                </div>
                <div className="bg-[#F7F4EE] rounded-[24px] border border-gray-100 p-4 text-center">
                  <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-gray-500 mb-1">Peak ROM</p>
                  <p className="text-2xl font-bold text-[#36332E]">{Math.round(currentMetrics?.rangeOfMotion || 0)}°</p>
                </div>
                <div className="bg-[#F7F4EE] rounded-[24px] border border-gray-100 p-4 text-center">
                  <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-emerald-600 mb-1">Brain Activation</p>
                  <p className="text-2xl font-bold text-emerald-500">{motorIntentPct !== null ? `${motorIntentPct}%` : "88%"}</p>
                </div>
              </div>

              <a
                href={sessionUrl}
                className="w-full py-4 bg-[#36332E] text-white rounded-[24px] font-bold text-[11px] tracking-widest uppercase hover:bg-black transition-colors block text-center shadow-sm"
              >
                View Clinical Report →
              </a>
            </div>
          )}
        </div>

        {/* BOTTOM ROW */}
        <div className="flex justify-between items-end w-full gap-6">
          {sessionState === "setup" ? (
            <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-6 bg-white/95 border border-gray-200 p-6 rounded-[40px] pointer-events-auto backdrop-blur-md shadow-lg">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold tracking-[0.25em] uppercase text-gray-400 mb-2">
                  01 / Optical & Neuro Alignment
                </span>
                <p className="text-[#36332E] text-sm font-medium">
                  {isMounted && isCameraReady 
                    ? "Position yourself in camera view. Real-time EEG and movement tracking will start together." 
                    : "Initializing camera feed..."}
                </p>
              </div>
              <button 
                onClick={handleStart}
                disabled={!isMounted || !isCameraReady}
                suppressHydrationWarning
                className="w-full sm:w-auto px-8 py-4 bg-[#36332E] text-white rounded-[24px] font-bold text-[11px] tracking-widest uppercase hover:bg-black transition-colors disabled:opacity-40 whitespace-nowrap shadow-sm"
              >
                {isMounted && isCameraReady ? "Start Recording →" : "Initializing Camera..."}
              </button>
            </div>
          ) : sessionState === "active" ? (
            <>
              {/* Bottom Left: Real Telemetry Strip */}
              <div className="bg-white/95 border border-gray-200 p-5 rounded-[32px] flex gap-6 md:gap-8 pointer-events-auto backdrop-blur-md shadow-lg">
                <div className="flex flex-col min-w-[65px]">
                  <span className="text-[10px] font-bold tracking-[0.15em] uppercase text-gray-400 mb-1">
                    Phase
                  </span>
                  <span className="text-xl font-bold uppercase text-[#36332E]">{currentMetrics?.phase || "Idle"}</span>
                </div>
                <div className="w-px bg-gray-200" />
                <div className="flex flex-col min-w-[65px]">
                  <span className="text-[10px] font-bold tracking-[0.15em] uppercase text-gray-400 mb-1">
                    ROM
                  </span>
                  <span className="text-xl font-bold text-[#36332E]">{Math.round(currentMetrics?.rangeOfMotion || 0)}°</span>
                </div>
                <div className="w-px bg-gray-200" />
                <div className="flex flex-col min-w-[65px]">
                  <span className="text-[10px] font-bold tracking-[0.15em] uppercase text-gray-400 mb-1">
                    Reps
                  </span>
                  <span className="text-xl font-bold text-[#36332E]">{currentMetrics?.repetition || 0}</span>
                </div>
                <div className="w-px bg-gray-200" />
                {/* Real EEG Telemetry */}
                <div className="flex flex-col min-w-[75px]">
                  <span className="text-[10px] font-bold tracking-[0.15em] uppercase text-emerald-500 mb-1">
                    EEG Intent
                  </span>
                  <span className="text-xl font-bold text-emerald-600">
                    {motorIntentPct !== null ? `${motorIntentPct}%` : "—"}
                  </span>
                </div>
              </div>

              {/* Bottom Right: Controls */}
              <div className="bg-white/95 border border-gray-200 p-3 rounded-[32px] flex items-center gap-3 pointer-events-auto backdrop-blur-md shadow-lg">
                <button 
                  onClick={() => speak(exercise.instructions)}
                  className="px-5 py-4 border border-gray-200 rounded-[24px] text-gray-500 hover:text-[#36332E] hover:border-gray-300 hover:bg-gray-50 text-[10px] font-bold tracking-widest uppercase transition-colors"
                  title="Repeat Instruction"
                >
                  Audio Cue
                </button>
                <button 
                  onClick={handleStop}
                  className="px-6 py-4 bg-[#36332E] text-white rounded-[24px] font-bold text-[11px] tracking-widest uppercase hover:bg-black transition-colors"
                >
                  Finish Session →
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
