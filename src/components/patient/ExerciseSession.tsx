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
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Right Arm Raise</h1>
          <p className="text-slate-600">Please sit upright and follow the voice instructions.</p>
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
          <div className="p-4 bg-blue-100 text-blue-800 rounded-xl font-bold text-center border-2 border-blue-300 animate-pulse">
            {uploadStatus}
          </div>
        )}

        {sessionUrl && !isUploading && (
          <a
            href={sessionUrl}
            target="_blank"
            className="block p-4 bg-green-600 text-white rounded-xl font-bold text-center text-lg hover:bg-green-700 transition-colors shadow-md"
          >
            🩺 Open Doctor Dashboard →
          </a>
        )}
      </div>

      <div className="flex flex-col gap-6">
        {/* Voice & Session Controls */}
        <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100 shadow-sm">
          <h2 className="text-xl font-semibold text-blue-900 mb-4">Controls</h2>
          <VoiceControls
            isRecording={isRecording}
            isCameraReady={isCameraReady}
            onStart={handleStart}
            onStop={handleStop}
          />
        </div>

        {/* Real-time EEG Telemetry HUD */}
        <div className="bg-slate-900 text-white p-5 rounded-2xl border border-slate-800 shadow-lg flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">🧠</span>
              <h3 className="font-bold text-base text-slate-100">EEG Biofeedback</h3>
            </div>
            <span
              className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${
                isHardwareOnline
                  ? "bg-emerald-950 text-emerald-300 border-emerald-500/40"
                  : "bg-indigo-950 text-indigo-300 border-indigo-500/40"
              }`}
            >
              {isHardwareOnline ? "● ESP32 Hardware Live" : "● Simulation Mode"}
            </span>
          </div>

          {/* Motor Attempt Gauge */}
          <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700/60">
            <div className="flex justify-between items-center text-xs mb-1.5">
              <span className="text-slate-300 font-medium">Motor Intent Attempt</span>
              <span
                className={`font-bold font-mono text-sm ${
                  motorIntentPct >= 65 ? "text-emerald-400" : "text-amber-400"
                }`}
              >
                {motorIntentPct}%
              </span>
            </div>
            <div className="w-full bg-slate-700 h-2.5 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  motorIntentPct >= 65
                    ? "bg-gradient-to-r from-teal-400 to-emerald-500"
                    : "bg-gradient-to-r from-sky-400 to-amber-400"
                }`}
                style={{ width: `${motorIntentPct}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-400 mt-1">
              <span>Mu ERD: {telemetry?.erdPercentage ?? 0}%</span>
              <span>{telemetry?.isAttemptDetected ? "⚡ Intent Active" : "Resting"}</span>
            </div>
          </div>

          {/* Signal Quality */}
          <div className="flex items-center justify-between text-xs bg-slate-800/50 p-2.5 rounded-lg">
            <span className="text-slate-300">Signal Quality:</span>
            <span className="font-mono text-emerald-400 font-bold">{signalQualityPct}%</span>
          </div>

          {/* Mini Real-time Waveform Preview */}
          {telemetry?.filteredPreview && telemetry.filteredPreview.length > 0 && (
            <div>
              <div className="text-[11px] text-slate-400 mb-1">Live Waveform (uV):</div>
              <div className="h-10 bg-slate-950 rounded-lg p-1.5 flex items-center gap-0.5 border border-slate-800 overflow-hidden">
                {telemetry.filteredPreview.map((val, idx) => {
                  const height = Math.min(100, Math.max(10, 50 + val * 1.5));
                  return (
                    <div
                      key={idx}
                      className="flex-1 bg-sky-400/80 rounded-sm transition-all duration-150"
                      style={{ height: `${height}%` }}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Doctor's Prescription Note */}
        <div className="bg-gray-50 p-6 rounded-2xl border">
          <h3 className="font-semibold mb-2">Doctor's Note:</h3>
          <p className="text-sm text-gray-700">
            "Remember to lift slowly and keep your elbow as straight as comfortable. Do 5 repetitions."
          </p>
        </div>
      </div>
    </div>
  );
}
