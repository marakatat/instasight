"use client";

import { useState, useRef, useCallback } from "react";
import { VoiceControls } from "./VoiceControls";
import { CameraPoseView } from "./CameraPoseView";
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

  const handleStart = () => {
    aiEventsRef.current = [];
    pendingAICallsRef.current = [];
    aiCallCountRef.current = 0;
    sessionIdRef.current = `session_${Date.now()}`;
    setSessionUrl(null);
    setIsRecording(true);
  };

  const handleStop = () => {
    setIsRecording(false);
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

  return (
    <div className="min-h-[100dvh] bg-black p-4 md:p-8 selection:bg-figma-teal selection:text-white">
      <div className="max-w-[1600px] mx-auto grid gap-6 lg:grid-cols-[1fr_400px]">
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
        />
        
        {isUploading && (
          <div className="p-4 bg-blue-100 text-blue-800 rounded-xl font-bold text-center border-2 border-blue-300">
            {uploadStatus}
          </div>
        )}

        {sessionUrl && !isUploading && (
          <a
            href={sessionUrl}
            target="_blank"
            className="block m-4 p-4 bg-figma-teal text-white rounded-xl font-bold text-center text-lg hover:bg-teal-500 transition-colors shadow-md"
          >
            🩺 Open Doctor Dashboard →
          </a>
        )}
        </div>

        {/* Sidebar Controls */}
        <div className="flex flex-col gap-6 h-full">
          <div className="bg-zinc-950 p-8 rounded-[2.5rem] border border-white/10 h-full flex flex-col relative overflow-hidden">
             {/* Decorative blur */}

             
            <h2 className="text-xl font-semibold text-white mb-6">Session Controls</h2>
            
            <div className="flex-1">
              <VoiceControls 
                isRecording={isRecording}
                isCameraReady={isCameraReady}
                onStart={handleStart}
                onStop={handleStop}
              />
            </div>

            <div className="mt-auto pt-8 border-t border-white/10">
              <h3 className="text-sm font-semibold text-zinc-400 mb-2">Doctor's Note</h3>
              <p className="text-sm text-zinc-300 font-medium leading-relaxed bg-white/5 p-4 rounded-2xl">
                "Remember to lift slowly and keep your elbow as straight as comfortable. Do 5 repetitions."
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
