"use client";

import { useRef, useState } from "react";
import type { AIFeedbackEvent } from "@/types/rehabilitation";

export function SessionVideoReview({ events, videoUrl }: { events: AIFeedbackEvent[]; videoUrl?: string | null }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [selectedEvent, setSelectedEvent] = useState<AIFeedbackEvent | null>(null);

  function jumpToEvent(event: AIFeedbackEvent) {
    setSelectedEvent(event);
    if (videoRef.current) {
      // jump to timestamp, fallback to 0 if missing
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
    <div className="grid lg:grid-cols-[1fr_400px] gap-8">
      {/* Video Player & Analytics */}
      <div className="space-y-6">
        <div className="relative aspect-video bg-black rounded-[2.5rem] overflow-hidden shadow-2xl border border-white/10 group">
           {/* Video from Supabase Storage */}
          <video
            ref={videoRef}
            controls
            className="w-full h-full object-cover"
            src={videoUrl || undefined}
          />
        </div>

        {/* AI Reason Panel (Traceable Explanation) */}
        {selectedEvent ? (
          <div className="bg-white border border-slate-200/50 p-8 rounded-[2.5rem] shadow-[0_20px_40px_-15px_rgba(0,0,0,0.03)] relative overflow-hidden">
            {/* Background Blurs depending on severity */}
            <div className={`absolute top-0 right-0 w-64 h-64 rounded-full -translate-y-1/2 translate-x-1/3 opacity-20 pointer-events-none ${
               "bg-figma-vibrant"
            }`} />

            <h3 className="text-2xl font-bold text-zinc-900 mb-6 tracking-tight z-10 relative">AI Analysis — Rep {selectedEvent.repetitionNumber}</h3>
            
            <div className="grid grid-cols-2 gap-6 text-sm text-zinc-800 z-10 relative">
              <div className="col-span-2">
                <p className="font-semibold text-zinc-400 mb-2 text-xs">📋 Clinical Note</p>
                <p className="bg-zinc-50 p-4 rounded-xl font-medium text-zinc-900 shadow-sm">
                  {selectedEvent.clinicalNote || selectedEvent.suggestion}
                </p>
              </div>
              <div className="col-span-2">
                <p className="font-semibold text-zinc-400 mb-2 text-xs">🔊 Spoken to Patient</p>
                <p className="bg-figma-teal/5 p-4 rounded-xl italic text-zinc-700 shadow-sm">
                  "{selectedEvent.suggestion}"
                </p>
              </div>
              
              <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-100">
                <p className="font-semibold text-zinc-400 text-xs mb-1">Timestamp</p>
                <p className="font-mono text-lg font-bold text-zinc-900">{formatTime(selectedEvent.videoTimeMs)}</p>
              </div>
              
              <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-100">
                <p className="font-semibold text-zinc-400 text-xs mb-1">Severity</p>
                <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${
                  (selectedEvent.severity || 'info') === "warning" ? "bg-figma-mustard/20 text-figma-mustard" :
                  (selectedEvent.severity || 'info') === "success" ? "bg-figma-teal/20 text-figma-teal" :
                  "bg-zinc-200 text-zinc-700"
                }`}>{(selectedEvent.severity || 'info')}</span>
              </div>

              <div className="col-span-2 mt-2">
                <p className="font-semibold text-zinc-400 mb-2 text-xs">Measurements (Telemetry)</p>
                <ul className="grid grid-cols-2 gap-2 bg-zinc-50 p-4 rounded-xl border border-zinc-100 font-mono text-sm text-zinc-800">
                  <li><span className="text-zinc-400 font-sans text-xs">Shoulder:</span> {selectedEvent.evidence?.shoulderAngle || 'N/A'}°</li>
                  <li><span className="text-zinc-400 font-sans text-xs">Elbow:</span> {selectedEvent.evidence?.elbowAngle || 'N/A'}°</li>
                  <li><span className="text-zinc-400 font-sans text-xs">Duration:</span> {selectedEvent.evidence?.movementDurationMs || 'N/A'}ms</li>
                  <li><span className="text-zinc-400 font-sans text-xs">Confidence:</span> {((selectedEvent.evidence?.poseConfidence || 0) * 100).toFixed(0)}%</li>
                </ul>
              </div>

              <div className="col-span-2 text-xs text-zinc-400 mt-4 flex justify-between items-center border-t border-slate-100 pt-4">
                <span>Model: {selectedEvent.modelName}</span>
                <span className="text-figma-mustard font-bold flex items-center gap-1">
                  ⚠ AI suggestion — review required
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white border border-slate-200/50 p-12 rounded-[2.5rem] text-center shadow-[0_20px_40px_-15px_rgba(0,0,0,0.03)] flex flex-col items-center justify-center min-h-[300px]">
            <div className="w-16 h-16 bg-zinc-50 rounded-full flex items-center justify-center mb-4">
              <span className="text-2xl">✨</span>
            </div>
            <h3 className="text-xl font-bold text-zinc-900 tracking-tight">Select an event</h3>
            <p className="text-zinc-500 font-medium mt-2 max-w-[200px]">Click an event on the timeline to view the AI's explanation.</p>
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200/50 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.03)] h-[calc(100vh-12rem)] overflow-y-auto sticky top-6">
        <div className="flex items-center justify-between mb-8 sticky top-0 bg-white/80 backdrop-blur-md pb-4 z-10 border-b border-slate-100">
          <h3 className="font-bold text-2xl text-zinc-900 tracking-tight">Timeline</h3>
          <span className="px-3 py-1 bg-zinc-100 rounded-full text-xs font-bold text-zinc-500">{events.length} Events</span>
        </div>

        <div className="space-y-4">
          {events.length === 0 ? (
            <p className="text-sm font-medium text-zinc-500 text-center py-8">No events recorded.</p>
          ) : (
            events.map((event, idx) => (
              <button
                key={event.id || idx}
                onClick={() => jumpToEvent(event)}
                className={`block w-full rounded-2xl border p-5 text-left transition-all duration-300 group ${
                  selectedEvent?.id === event.id 
                    ? "bg-figma-vibrant/5 border-figma-vibrant/30 shadow-md ring-1 ring-figma-vibrant/20" 
                    : "bg-zinc-50 border-zinc-200 hover:border-zinc-300 hover:shadow-sm"
                }`}
              >
                <div className="flex justify-between items-center mb-3">
                  <span className={`font-mono font-bold ${selectedEvent?.id === event.id ? 'text-figma-vibrant' : 'text-zinc-900'}`}>
                    {formatTime(event.videoTimeMs)}
                  </span>
                  <span className={`px-2 py-1 rounded-md text-[10px] font-bold ${
                    (event.severity || 'info') === "warning" ? "bg-figma-mustard/20 text-figma-mustard" :
                    (event.severity || 'info') === "success" ? "bg-figma-teal/20 text-figma-teal" :
                    "bg-zinc-200 text-zinc-700"
                  }`}>
                    {(event.severity || 'info')}
                  </span>
                </div>
                <div className={`text-sm font-medium leading-relaxed ${selectedEvent?.id === event.id ? 'text-zinc-900' : 'text-zinc-600'}`}>
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
