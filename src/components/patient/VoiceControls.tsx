"use client";

import { speak } from "@/lib/voice/speak";

export function VoiceControls() {
  return (
    <div className="grid gap-4">
      <button
        className="min-h-16 rounded-2xl bg-green-700 px-6 text-2xl text-white"
        onClick={() => speak("Starting the exercise. Move slowly.")}
      >
        Start exercise
      </button>

      <button
        className="min-h-14 rounded-2xl border-2 px-6 text-xl"
        onClick={() => speak("Lift your arm slowly until it is comfortable.")}
      >
        Repeat instruction
      </button>

      <button
        className="min-h-14 rounded-2xl bg-red-700 px-6 text-xl text-white"
        onClick={() => speak("Exercise stopped. Please rest.")}
      >
        Stop
      </button>
    </div>
  );
}
