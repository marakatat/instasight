"use client";

import { useRef, useState } from "react";
import type { AIFeedbackEvent } from "@/types/rehabilitation";

export function SessionVideoReview({
  events,
  videoUrl,
  doctorSummary,
}: {
  events: AIFeedbackEvent[];
  videoUrl?: string | null;
  doctorSummary?: string | null;
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

  return (
    <div className="grid lg:grid-cols-[1fr_380px] gap-8">
      {/* Video Player & Analytics */}
      <div className="space-y-8">
        
        {/* Clinical AI Summary */}
        {doctorSummary && (
          <div className="border border-white/15 bg-white/5 p-8">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-xs font-mono tracking-[0.2em] uppercase text-white/40">
                AI Synthesis
              </span>
            </div>
            <h3 className="text-2xl font-serif font-bold text-white mb-3">
              Clinical Assessment
            </h3>
            <p className="text-white/70 text-sm leading-relaxed">
              {doctorSummary}
            </p>
          </div>
        )}

        {/* Video Player Container */}
        <div className="relative aspect-video bg-black border border-white/15 overflow-hidden">
          <video
            ref={videoRef}
            controls
            className="w-full h-full object-cover"
            src={videoUrl || undefined}
          />
        </div>

        {/* AI Reason Panel */}
        {selectedEvent ? (
          <div className="border border-white/15 p-8 space-y-6">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs font-mono tracking-[0.2em] uppercase text-white/40 block mb-1">
                  Repetition {selectedEvent.repetitionNumber || 1}
                </span>
                <h3 className="text-2xl font-serif font-bold text-white">
                  Kinematic Analysis
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

              <div className="grid grid-cols-2 gap-px bg-white/10">
                <div className="bg-black p-4">
                  <span className="text-[10px] font-mono uppercase text-white/40 block mb-1">Timestamp</span>
                  <span className="font-mono text-base font-bold text-white">{formatTime(selectedEvent.videoTimeMs)}</span>
                </div>
                <div className="bg-black p-4">
                  <span className="text-[10px] font-mono uppercase text-white/40 block mb-1">Confidence</span>
                  <span className="font-mono text-base font-bold text-white">{((selectedEvent.confidence || 0.9) * 100).toFixed(0)}%</span>
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
          <div className="border border-white/15 p-12 text-center">
            <span className="text-xs font-mono tracking-[0.2em] uppercase text-white/30 block mb-2">
              Inspector
            </span>
            <p className="text-white/40 text-sm">
              Select an event from the timeline to view detailed kinematics and notes.
            </p>
          </div>
        )}
      </div>

      {/* Timeline List */}
      <div className="border border-white/15 p-6 h-[calc(100vh-10rem)] overflow-y-auto sticky top-6">
        <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-6 sticky top-0 bg-black z-10">
          <h3 className="font-serif font-bold text-xl text-white">Timeline</h3>
          <span className="text-xs font-mono text-white/40">{events.length} Events</span>
        </div>

        <div className="space-y-2">
          {events.length === 0 ? (
            <p className="text-sm font-mono text-white/30 text-center py-8">No events recorded.</p>
          ) : (
            events.map((event, idx) => (
              <button
                key={event.id || idx}
                onClick={() => jumpToEvent(event)}
                className={`block w-full border p-4 text-left transition-colors duration-200 ${
                  selectedEvent?.id === event.id 
                    ? "bg-white text-black border-white" 
                    : "bg-black text-white border-white/10 hover:border-white/40"
                }`}
              >
                <div className="flex justify-between items-center mb-2">
                  <span className={`font-mono text-xs font-bold ${selectedEvent?.id === event.id ? "text-black" : "text-white"}`}>
                    {formatTime(event.videoTimeMs)}
                  </span>
                  <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 border ${
                    selectedEvent?.id === event.id 
                      ? "border-black text-black" 
                      : "border-white/20 text-white/50"
                  }`}>
                    {event.severity || "info"}
                  </span>
                </div>
                <div className={`text-xs leading-relaxed line-clamp-2 ${selectedEvent?.id === event.id ? "text-black/80 font-medium" : "text-white/60"}`}>
                  {event.clinicalNote || event.suggestion}
                </div>
              </button>
            ))
          )}
        </div>
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
