"use client";

import { useState, useRef, useCallback } from "react";
import { VoiceControls } from "./VoiceControls";
import { CameraPoseView } from "./CameraPoseView";
import { useEegStream } from "@/lib/eeg/useEegStream";
import type { AIFeedbackEvent } from "@/types/rehabilitation";

export function ExerciseSession() {
  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [sessionUrl, setSessionUrl] = useState<string | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [liveFeedback, setLiveFeedback] = useState<{ suggestion: string; severity: string } | null>(null);
  const liveFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiEventsRef = useRef<AIFeedbackEvent[]>([]);
  const pendingAICallsRef = useRef<Promise<void>[]>([]);
  const aiCallCountRef = useRef(0);
  const sessionIdRef = useRef<string>(`session_${Date.now()}`);
  const AI_CALL_LIMIT = 5;

  // Real-time EEG telemetry stream via Next.js HTTP API polling & fallback simulator
  const { telemetry, isHardwareOnline, startStream, stopStream } = useEegStream({
    deviceId: "esp32-demo-01",
    pollIntervalMs: 150,
  });

  const handleStart = () => {
    aiEventsRef.current = [];
    pendingAICallsRef.current = [];
    aiCallCountRef.current = 0;
    const newSessionId = `session_${Date.now()}`;
    sessionIdRef.current = newSessionId;
    setSessionUrl(null);
    setIsRecording(true);

    // Command the ESP32 to start streaming raw EEG telemetry
    startStream(newSessionId);
  };

  const handleStop = () => {
    setIsRecording(false);
    // Command the ESP32 to stop streaming
    stopStream();

    // Don't upload yet — wait for CameraPoseView's recorder.onstop to fire
    // which calls handleRecordingComplete with the blob
    setIsUploading(true);
    setUploadStatus("Waiting for AI analysis to finish...");
  };

  const handleRecordingComplete = async (blob: Blob) => {
    // Wait for ALL pending AI calls to resolve before uploading
    setUploadStatus(`Waiting for ${pendingAICallsRef.current.length} AI notes to finish...`);
    await Promise.allSettled(pendingAICallsRef.current);

    setUploadStatus("Uploading session to Doctor Dashboard...");

    const formData = new FormData();
    formData.append("video", blob, "recording.webm");
    formData.append("events", JSON.stringify(aiEventsRef.current));
    formData.append("sessionId", sessionIdRef.current);

    try {
      const res = await fetch("/api/sessions/upload", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const result = await res.json();
        const sid = result.sessionId || sessionIdRef.current;
        setUploadStatus(`✅ Session uploaded! ${aiEventsRef.current.length} AI keynotes saved.`);
        setSessionUrl(`/doctor/sessions/${sid}`);
      } else {
        setUploadStatus("❌ Failed to upload session.");
      }
    } catch (e) {
      console.error(e);
      setUploadStatus("❌ Error uploading session.");
    } finally {
      setTimeout(() => setIsUploading(false), 3000);
    }
  };

  const handleAIEvent = useCallback((event: AIFeedbackEvent) => {
    aiEventsRef.current.push(event);
    // Show live feedback banner to the patient!
    setLiveFeedback({ suggestion: event.suggestion, severity: event.severity });
    // Auto-dismiss after 8 seconds
    if (liveFeedbackTimerRef.current) clearTimeout(liveFeedbackTimerRef.current);
    liveFeedbackTimerRef.current = setTimeout(() => setLiveFeedback(null), 8000);
  }, []);

  // Called from CameraPoseView when a rep is detected — we track the promise here
  const handleAIPromise = useCallback((promise: Promise<void>) => {
    pendingAICallsRef.current.push(promise);
  }, []);

  // Only call AI on notable reps (every 5th rep, or always pass through - parent decides via shouldTriggerAI)
  const shouldTriggerAI = useCallback(() => {
    aiCallCountRef.current += 1;
    return aiCallCountRef.current <= AI_CALL_LIMIT;
  }, []);

  const motorIntentPct = Math.round((telemetry?.motorAttemptProbability ?? 0.5) * 100);
  const signalQualityPct = Math.round((telemetry?.signalQuality ?? 0.9) * 100);

  return (
    <div className="min-h-[100dvh] bg-black p-4 md:p-8 selection:bg-teal-500 selection:text-white">
      <div className="max-w-[1600px] mx-auto grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* Main Camera Area */}
        <div className="flex flex-col h-full bg-zinc-950 rounded-[2.5rem] border border-white/10 overflow-hidden relative shadow-2xl">
          <div className="absolute top-6 left-8 z-10">
            <h1 className="text-2xl font-bold text-white tracking-tight">Right Arm Raise</h1>
            <p className="text-zinc-400 font-medium text-sm mt-1">Please sit upright and follow the voice instructions.</p>
          </div>

          <CameraPoseView
            isRecording={isRecording}
            onRecordingComplete={handleRecordingComplete}
            onAIEvent={handleAIEvent}
            onAIPromise={handleAIPromise}
            shouldTriggerAI={shouldTriggerAI}
            onLoaded={() => setIsCameraReady(true)}
            liveFeedback={liveFeedback}
            eegTelemetry={telemetry}
            sessionId={sessionIdRef.current}
          />

          {isUploading && (
            <div className="m-4 p-4 bg-blue-950/80 text-blue-300 rounded-2xl font-bold text-center border border-blue-500/40 animate-pulse backdrop-blur-md">
              {uploadStatus}
            </div>
          )}

          {sessionUrl && !isUploading && (
            <a
              href={sessionUrl}
              target="_blank"
              className="block m-4 p-4 bg-teal-600 text-white rounded-2xl font-bold text-center text-lg hover:bg-teal-500 transition-colors shadow-lg"
            >
              🩺 Open Doctor Dashboard →
            </a>
          )}
        </div>

        {/* Sidebar Controls & Real-time EEG Biofeedback */}
        <div className="flex flex-col gap-6 h-full">
          <div className="bg-zinc-950 p-6 rounded-[2.5rem] border border-white/10 flex flex-col gap-6 relative overflow-hidden shadow-2xl">
            <h2 className="text-xl font-semibold text-white">Session Controls</h2>

            <div>
              <VoiceControls
                isRecording={isRecording}
                isCameraReady={isCameraReady}
                onStart={handleStart}
                onStop={handleStop}
              />
            </div>

            {/* Real-time EEG Telemetry HUD */}
            <div className="bg-black/60 backdrop-blur-xl p-4 rounded-2xl border border-white/10 flex flex-col gap-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🧠</span>
                  <h3 className="font-bold text-sm text-zinc-100">EEG Biofeedback</h3>
                </div>
                <span
                  className={`text-[11px] px-2.5 py-0.5 rounded-full font-semibold border ${
                    isHardwareOnline
                      ? "bg-emerald-950 text-emerald-300 border-emerald-500/40"
                      : "bg-indigo-950 text-indigo-300 border-indigo-500/40"
                  }`}
                >
                  {isHardwareOnline ? "● ESP32 Hardware" : "● Simulation Mode"}
                </span>
              </div>

              {/* Motor Attempt Gauge */}
              <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                <div className="flex justify-between items-center text-xs mb-1.5">
                  <span className="text-zinc-300 font-medium">Motor Intent Attempt</span>
                  <span
                    className={`font-bold font-mono text-sm ${
                      motorIntentPct >= 65 ? "text-teal-400" : "text-amber-400"
                    }`}
                  >
                    {motorIntentPct}%
                  </span>
                </div>
                <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      motorIntentPct >= 65
                        ? "bg-gradient-to-r from-teal-400 to-emerald-500"
                        : "bg-gradient-to-r from-sky-400 to-amber-400"
                    }`}
                    style={{ width: `${motorIntentPct}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-zinc-400 mt-1">
                  <span>Mu ERD: {telemetry?.erdPercentage ?? 0}%</span>
                  <span>{telemetry?.isAttemptDetected ? "⚡ Intent Active" : "Resting"}</span>
                </div>
              </div>

              {/* Signal Quality */}
              <div className="flex items-center justify-between text-xs bg-white/5 p-2.5 rounded-xl border border-white/5">
                <span className="text-zinc-300">Signal Quality:</span>
                <span className="font-mono text-teal-400 font-bold">{signalQualityPct}%</span>
              </div>

              {/* Mini Real-time Waveform Preview */}
              {telemetry?.filteredPreview && telemetry.filteredPreview.length > 0 && (
                <div>
                  <div className="text-[10px] text-zinc-400 mb-1 font-medium">Live Waveform (uV):</div>
                  <div className="h-9 bg-black/80 rounded-lg p-1 flex items-center gap-0.5 border border-white/5 overflow-hidden">
                    {telemetry.filteredPreview.map((val, idx) => {
                      const height = Math.min(100, Math.max(12, 50 + val * 1.5));
                      return (
                        <div
                          key={idx}
                          className="flex-1 bg-teal-400/80 rounded-xs transition-all duration-150"
                          style={{ height: `${height}%` }}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Doctor's Prescription Note */}
            <div className="mt-auto pt-4 border-t border-white/10">
              <h3 className="text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">Doctor's Note</h3>
              <p className="text-sm text-zinc-300 font-medium leading-relaxed bg-white/5 p-4 rounded-2xl border border-white/5">
                "Remember to lift slowly and keep your elbow as straight as comfortable. Do 5 repetitions."
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
