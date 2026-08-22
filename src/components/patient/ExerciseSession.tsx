"use client";

import { useState, useRef, useCallback } from "react";
import { VoiceControls } from "./VoiceControls";
import { CameraPoseView } from "./CameraPoseView";
import type { AIFeedbackEvent } from "@/types/rehabilitation";

export function ExerciseSession() {
  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [isCameraReady, setIsCameraReady] = useState(false);
  const aiEventsRef = useRef<AIFeedbackEvent[]>([]);
  const pendingAICallsRef = useRef<Promise<void>[]>([]);
  const aiCallCountRef = useRef(0);
  const AI_CALL_LIMIT = 5;

  const handleStart = () => {
    aiEventsRef.current = [];
    pendingAICallsRef.current = [];
    aiCallCountRef.current = 0;
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
    formData.append("video", blob, "demo-session.webm");
    formData.append("events", JSON.stringify(aiEventsRef.current));

    try {
      const res = await fetch("/api/sessions/upload", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        setUploadStatus(`✅ Done! ${aiEventsRef.current.length} AI keynotes sent to Doctor Dashboard.`);
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
    <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold">Right Arm Raise</h1>
          <p className="text-gray-600">Please sit upright and follow the voice instructions.</p>
        </div>
        
        <CameraPoseView 
          isRecording={isRecording} 
          onRecordingComplete={handleRecordingComplete}
          onAIEvent={handleAIEvent}
          onAIPromise={handleAIPromise}
          shouldTriggerAI={shouldTriggerAI}
          onLoaded={() => setIsCameraReady(true)}
        />
        
        {isUploading && (
          <div className="p-4 bg-blue-100 text-blue-800 rounded-xl font-bold text-center border-2 border-blue-300">
            {uploadStatus}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-6">
        <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100">
          <h2 className="text-xl font-semibold text-blue-900 mb-4">Controls</h2>
          <VoiceControls 
            isRecording={isRecording}
            isCameraReady={isCameraReady}
            onStart={handleStart}
            onStop={handleStop}
          />
        </div>
        
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
