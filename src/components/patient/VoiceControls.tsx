"use client";

import { speak } from "@/lib/voice/speak";

export function VoiceControls({ 
  isRecording,
  isCameraReady,
  onStart, 
  onStop 
}: { 
  isRecording: boolean;
  isCameraReady: boolean;
  onStart: () => void; 
  onStop: () => void; 
}) {
  return (
    <div className="grid gap-4">
      <button
        disabled={isRecording || !isCameraReady}
        className="min-h-16 rounded-2xl bg-green-700 px-6 text-2xl text-white transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        onClick={() => {
          onStart();
          speak("Starting the exercise. Move slowly.");
        }}
      >
        {!isCameraReady ? (
          "Waiting for camera..."
        ) : isRecording ? (
          <>
             <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
             Recording...
          </>
        ) : (
          "Start exercise"
        )}
      </button>

      <button
        className="min-h-14 rounded-2xl border-2 px-6 text-xl hover:bg-gray-50 transition-colors"
        onClick={() => speak("Lift your arm slowly until it is comfortable.")}
      >
        Repeat instruction
      </button>

      <button
        disabled={!isRecording}
        className="min-h-14 rounded-2xl bg-red-700 px-6 text-xl text-white transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        onClick={() => {
          onStop();
          speak("Exercise stopped. Uploading to doctor.");
        }}
      >
        Stop & Send to Doctor
      </button>
    </div>
  );
}
