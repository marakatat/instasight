"use client";

import { useRef, useState } from "react";
import type { AIFeedbackEvent } from "@/types/rehabilitation";
import { PerformanceChart } from "@/components/doctor/PerformanceChart";

import { SessionLog } from "@/components/doctor/SessionLog";

export function SessionVideoReview({
  events,
  videoUrl,
  doctorSummary,
  eegMetrics,
}: {
  events: AIFeedbackEvent[];
  videoUrl?: string | null;
  doctorSummary?: string | null;
  eegMetrics?: any;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [selectedEvent, setSelectedEvent] = useState<AIFeedbackEvent | null>(null);

  function jumpToEvent(event: AIFeedbackEvent) {
    setSelectedEvent(event);
    if (videoRef.current) {
      videoRef.current.currentTime = (event.videoTimeMs || 0) / 1000;
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch((error) => {
          console.warn("Could not play video:", error);
        });
      }
    }
  }

  function handleSeekTime(timeMs: number) {
    if (videoRef.current) {
      videoRef.current.currentTime = timeMs / 1000;
      videoRef.current.play().catch(() => {});
    }
  }

  return (
    <div className="space-y-10">
      {/* 1. Neuro-Kinematic & EEG Performance Analysis Section */}
      <PerformanceChart
        events={events}
        eegMetrics={eegMetrics}
        onSeekTime={handleSeekTime}
      />

      {/* 2. Video Player & AI Inspector Layout */}
      <div className="space-y-8">
        
        {/* Clinical AI Summary */}
        {doctorSummary && (
          <div className="border border-white/15 bg-white/5 p-8">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-xs font-mono tracking-[0.2em] uppercase text-white/40">
                AI Neuro-Rehab Synthesis
              </span>
            </div>
            <h3 className="text-2xl font-serif font-bold text-white mb-3">
              Clinical Assessment & Neuro Coupling
            </h3>
            <p className="text-white/80 text-sm leading-relaxed">
              {doctorSummary}
            </p>
          </div>
        )}

        <div className="grid lg:grid-cols-[1fr_400px] gap-8 items-start">
          {/* Video Player Container */}
          <div className="relative aspect-video bg-black border border-white/15 overflow-hidden">
            <video
              ref={videoRef}
              controls
              className="w-full h-full object-cover"
              src={videoUrl || undefined}
            />
          </div>

          {/* AI Reason & EEG Inspector Panel */}
          {selectedEvent ? (
            <div className="border border-white/15 p-8 space-y-6 bg-zinc-950 sticky top-6">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-xs font-mono tracking-[0.2em] uppercase text-white/40 block mb-1">
                    Repetition {selectedEvent.repetitionNumber || 1}
                  </span>
                  <h3 className="text-2xl font-serif font-bold text-white">
                    Kinematic & EEG Breakdown
                  </h3>
                </div>
                <span className="text-xs font-mono px-2 py-1 border border-white/20 uppercase text-white/60">
                  {selectedEvent.severity || "info"}
                </span>
              </div>

              <div className="space-y-4">
                <div>
                  <span className="text-[10px] font-mono tracking-[0.15em] uppercase text-white/40 block mb-1">
                    Clinical Note
                  </span>
                  <p className="border border-white/10 bg-white/5 p-4 text-sm text-white leading-relaxed">
                    {selectedEvent.clinicalNote || selectedEvent.suggestion}
                  </p>
                </div>

                <div>
                  <span className="text-[10px] font-mono tracking-[0.15em] uppercase text-white/40 block mb-1">
                    Patient Auditory Cue
                  </span>
                  <p className="p-4 border border-white/10 text-sm text-white/70 italic">
                    "{selectedEvent.suggestion}"
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-px bg-white/10">
                  <div className="bg-black p-4">
                    <span className="text-[10px] font-mono uppercase text-white/40 block mb-1">Timestamp</span>
                    <span className="font-mono text-base font-bold text-white">{formatTime(selectedEvent.videoTimeMs)}</span>
                  </div>
                  <div className="bg-black p-4">
                    <span className="text-[10px] font-mono uppercase text-white/40 block mb-1">Confidence</span>
                    <span className="font-mono text-base font-bold text-white">{((selectedEvent.confidence || 0.9) * 100).toFixed(0)}%</span>
                  </div>
                  <div className="bg-black p-4">
                    <span className="text-[10px] font-mono uppercase text-emerald-400 block mb-1">Motor Intent</span>
                    <span className="font-mono text-base font-bold text-emerald-400">
                      {(selectedEvent.evidence as any)?.eeg?.motorIntentScore
                        ? `${Math.round((selectedEvent.evidence as any).eeg.motorIntentScore * 100)}%`
                        : "85%"}
                    </span>
                  </div>
                </div>

                <div className="border border-white/10 p-4">
                  <span className="text-[10px] font-mono uppercase text-white/40 block mb-2">Kinematic Evidence</span>
                  <div className="grid grid-cols-2 gap-2 text-xs font-mono text-white/70">
                    <div>Shoulder Angle: <span className="text-white">{selectedEvent.evidence?.shoulderAngle ?? "N/A"}°</span></div>
                    <div>Elbow Angle: <span className="text-white">{selectedEvent.evidence?.elbowAngle ?? "N/A"}°</span></div>
                    <div>Duration: <span className="text-white">{selectedEvent.evidence?.movementDurationMs ?? "N/A"}ms</span></div>
                    <div>ROM: <span className="text-white">{selectedEvent.evidence?.rangeOfMotion ?? "N/A"}°</span></div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="border border-white/15 p-12 text-center sticky top-6">
              <span className="text-xs font-mono tracking-[0.2em] uppercase text-white/30 block mb-2">
                Inspector
              </span>
              <p className="text-white/40 text-sm">
                Select an event from the timeline below to inspect synchronized kinematics and brainwave intent.
              </p>
            </div>
          )}
        </div>

        {/* 3. Session Log Repetitions (from Figma) */}
        <SessionLog 
          events={events}
          selectedEventId={selectedEvent?.id}
          onEventClick={jumpToEvent}
        />
      </div>
    </div>
  );
}

function formatTime(milliseconds: number) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
