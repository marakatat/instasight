"use client";

import { useRef, useState } from "react";
import type { AIFeedbackEvent } from "@/types/rehabilitation";
import { SessionLog } from "@/components/doctor/SessionLog";
import { PerformanceChart } from "@/components/doctor/PerformanceChart";

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
  const [videoDurationMs, setVideoDurationMs] = useState<number>(0);

  function jumpToEvent(event: AIFeedbackEvent) {
    setSelectedEvent(event);
    if (videoRef.current) {
      videoRef.current.currentTime = (event.videoTimeMs || 0) / 1000;
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {});
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
    <div className="w-full flex flex-col gap-10 font-sans text-[#36332E]">
        


      {/* Clinical AI Summary */}
      {doctorSummary && (
        <div className="bg-white rounded-[40px] p-8 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-[10px] font-bold tracking-widest uppercase text-gray-400">
              AI Neuro-Rehab Synthesis
            </span>
          </div>
          <h3 className="text-2xl font-serif font-bold text-[#36332E] mb-3">
            Clinical Assessment & Neuro Coupling
          </h3>
          <p className="text-gray-600 text-sm leading-relaxed">
            {doctorSummary}
          </p>
        </div>
      )}
      
      {/* Top Split: Video & Evidence Panel */}
      <div className="grid lg:grid-cols-[1fr_400px] gap-8 items-start">
        
        {/* Left Side: Video + Timeline */}
        <div className="flex flex-col gap-6">
          {/* Video Player Container */}
          <div className="relative aspect-video bg-black rounded-[40px] overflow-hidden shadow-sm">
            <video
              ref={videoRef}
              controls
              className="w-full h-full object-cover"
              src={videoUrl || undefined}
              onLoadedMetadata={(e) => setVideoDurationMs(e.currentTarget.duration * 1000)}
            />
          </div>

          {/* Event Timeline */}
          <div className="bg-white rounded-[40px] p-8 shadow-sm border border-gray-100">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xs font-bold text-[#36332E] tracking-widest uppercase">Event Timeline</h3>
              <div className="flex gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#879783]"></span>
                  <span className="text-gray-500 font-medium">Optimal</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#B86F68]"></span>
                  <span className="text-gray-500 font-medium">Warning</span>
                </div>
              </div>
            </div>
            
            {/* Custom Timeline Bar */}
            <div className="relative h-12 flex items-center px-4 mb-2">
              <div className="absolute left-4 right-4 h-1.5 bg-[#EAE5D9] rounded-full"></div>
              {(() => {
                const maxEventTime = events.length > 0 ? Math.max(...events.map(e => e.videoTimeMs || 0)) : 0;
                const totalSessionMs = videoDurationMs > 0 
                  ? videoDurationMs 
                  : (maxEventTime > 0 ? maxEventTime * 1.1 : 15 * 60 * 1000);
                
                return events.map((event) => {
                  const leftPercent = Math.min(100, Math.max(0, ((event.videoTimeMs || 0) / totalSessionMs) * 100));
                  const isWarning = event.severity === "warning" || event.severity === "error";
                  const isSelected = selectedEvent?.id === event.id;
                  
                  return (
                    <button 
                      key={event.id}
                      onClick={() => jumpToEvent(event)}
                      className="absolute group z-10"
                      style={{ left: `calc(${leftPercent}% + 16px)` }}
                    >
                      <div className={`w-3.5 h-3.5 rounded-full border-2 border-white -ml-[7px] transition-transform ${isWarning ? 'bg-[#B86F68]' : 'bg-[#879783]'} ${isSelected ? 'scale-150 shadow-md ring-2 ring-offset-1 ring-gray-400' : 'hover:scale-125'}`} />
                      <div className="absolute top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-[#36332E] text-white text-[10px] px-2 py-1 rounded whitespace-nowrap pointer-events-none">
                        {formatTime(event.videoTimeMs)} - {isWarning ? "Warning" : "Optimal"}
                      </div>
                    </button>
                  );
                });
              })()}
            </div>
          </div>
        </div>

        {/* Right Side: Evidence Panel (Real Data) */}
        <div className="flex flex-col gap-6 h-full">
          {selectedEvent ? (
            <div className="bg-white rounded-[40px] p-8 shadow-sm border border-gray-100 flex-1 flex flex-col gap-6">
              
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-xs font-bold text-[#36332E] tracking-widest uppercase mb-1">Evidence Panel</h3>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    Repetition {selectedEvent.repetitionNumber || 1}
                  </span>
                </div>
                <span className={`text-[10px] font-bold px-3 py-1.5 rounded-[16px] uppercase tracking-wider ${
                  selectedEvent.severity === 'warning' || selectedEvent.severity === 'error'
                    ? 'bg-red-50 text-[#B86F68]' 
                    : 'bg-[#879783]/10 text-[#879783]'
                }`}>
                  {selectedEvent.severity || "info"}
                </span>
              </div>

              <div className="space-y-4">
                {/* Clinical Note */}
                <div>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-2">Clinical Note</p>
                  <div className="bg-[#F7F4EE] rounded-[32px] p-6 text-sm text-gray-700 leading-relaxed">
                    {selectedEvent.clinicalNote || selectedEvent.suggestion}
                  </div>
                </div>

                {/* Patient Auditory Cue */}
                <div>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-2">Patient Auditory Cue</p>
                  <div className="border border-[#EAE5D9] rounded-[32px] p-6 text-sm text-gray-600 italic">
                    "{selectedEvent.suggestion}"
                  </div>
                </div>

                {/* Real Metrics Grid */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-[#F7F4EE] rounded-[32px] p-5">
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">Timestamp</p>
                    <span className="text-xl font-bold text-[#36332E]">{formatTime(selectedEvent.videoTimeMs)}</span>
                  </div>
                  <div className="bg-[#F7F4EE] rounded-[32px] p-5">
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">Confidence</p>
                    <span className="text-xl font-bold text-[#36332E]">{((selectedEvent.confidence || 0.9) * 100).toFixed(0)}%</span>
                  </div>
                  
                  <div className="bg-[#F7F4EE] rounded-[32px] p-5">
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">Max Angle</p>
                    <span className="text-xl font-bold text-[#36332E]">{selectedEvent.evidence?.shoulderAngle ?? "N/A"}°</span>
                  </div>
                  <div className="bg-[#F7F4EE] rounded-[32px] p-5">
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">Rep Duration</p>
                    <span className="text-xl font-bold text-[#36332E]">
                      {selectedEvent.evidence?.movementDurationMs ? (selectedEvent.evidence.movementDurationMs / 1000).toFixed(1) : "N/A"}s
                    </span>
                  </div>
                </div>

                {/* Real Kinematic Evidence */}
                <div className="border border-[#EAE5D9] rounded-[32px] p-6">
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-3">Kinematic Evidence</p>
                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 font-medium">
                    <div>Elbow Angle: <span className="text-[#36332E]">{selectedEvent.evidence?.elbowAngle ?? "N/A"}°</span></div>
                    <div>ROM: <span className="text-[#36332E]">{selectedEvent.evidence?.rangeOfMotion ?? "N/A"}°</span></div>
                  </div>
                </div>
              </div>

            </div>
          ) : (
            <div className="bg-white rounded-[40px] p-12 shadow-sm border border-gray-100 flex-1 flex flex-col items-center justify-center text-center sticky top-6">
              <span className="text-xs font-bold text-gray-300 tracking-widest uppercase mb-3">
                Evidence Panel
              </span>
              <p className="text-gray-400 text-sm max-w-[200px]">
                Select an event from the timeline or log below to inspect synchronized kinematics.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Full-Width: Session Log Repetitions */}
      <SessionLog 
        events={events}
        selectedEventId={selectedEvent?.id}
        onEventClick={jumpToEvent}
      />

      {/* 1. Neuro-Kinematic & EEG Performance Analysis Section */}
      <PerformanceChart
        events={events}
        eegMetrics={eegMetrics}
        onSeekTime={handleSeekTime}
      />
    </div>
  );
}

function formatTime(milliseconds: number | undefined) {
  if (!milliseconds) return "00:00";
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}
