"use client";

import { VoiceControls } from "./VoiceControls";
import { CameraPoseView } from "./CameraPoseView";

export function ExerciseSession() {
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold">Right Arm Raise</h1>
          <p className="text-gray-600">Please sit upright and follow the voice instructions.</p>
        </div>
        
        <CameraPoseView />
      </div>

      <div className="flex flex-col gap-6">
        <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100">
          <h2 className="text-xl font-semibold text-blue-900 mb-4">Controls</h2>
          <VoiceControls />
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
