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
    <div className="grid lg:grid-cols-[1fr_350px] gap-8">
      {/* Video Player */}
      <div className="space-y-4">
        <div className="relative aspect-video bg-gray-900 rounded-2xl overflow-hidden shadow-lg border-4 border-gray-100">
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
          <div className="bg-blue-50 border border-blue-200 p-6 rounded-2xl shadow-sm">
            <h3 className="text-xl font-semibold text-blue-900 mb-4">AI Analysis — Rep {selectedEvent.repetitionNumber}</h3>
            <div className="grid grid-cols-2 gap-4 text-sm text-gray-800">
              <div className="col-span-2">
                <p className="font-semibold text-gray-500 mb-1">📋 Clinical Note (Doctor):</p>
                <p className="bg-white border-l-4 border-blue-400 p-3 rounded font-medium text-gray-900">
                  {selectedEvent.clinicalNote || selectedEvent.suggestion}
                </p>
              </div>
              <div className="col-span-2">
                <p className="font-semibold text-gray-500 mb-1">🔊 Spoken to Patient:</p>
                <p className="bg-white border-l-4 border-green-400 p-3 rounded italic text-gray-700">
                  "{selectedEvent.suggestion}"
                </p>
              </div>
              <div>
                <p className="font-semibold text-gray-500">Video Timestamp:</p>
                <p>{formatTime(selectedEvent.videoTimeMs)} (Rep {selectedEvent.repetitionNumber})</p>
              </div>
              <div>
                <p className="font-semibold text-gray-500">Severity:</p>
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                  (selectedEvent.severity || 'info') === "warning" ? "bg-red-100 text-red-700" :
                  (selectedEvent.severity || 'info') === "success" ? "bg-green-100 text-green-700" :
                  "bg-gray-200 text-gray-700"
                }`}>{(selectedEvent.severity || 'info').toUpperCase()}</span>
              </div>
              <div className="col-span-2 mt-2">
                <p className="font-semibold text-gray-500 mb-1">Measurements (Inputs to AI):</p>
                <ul className="list-disc list-inside space-y-1 bg-white p-3 rounded border text-sm text-gray-800">
                  <li>Shoulder Angle: {selectedEvent.evidence?.shoulderAngle || 'N/A'}°</li>
                  <li>Elbow Angle: {selectedEvent.evidence?.elbowAngle || 'N/A'}°</li>
                  <li>Movement Duration: {selectedEvent.evidence?.movementDurationMs || 'N/A'}ms</li>
                  <li>Pose Confidence: {((selectedEvent.evidence?.poseConfidence || 0) * 100).toFixed(0)}%</li>
                </ul>
              </div>
              <div className="col-span-2 mt-2">
                <p className="font-semibold text-gray-500 mb-1">Reason Codes:</p>
                <p className="bg-white p-3 rounded-lg border text-red-600 font-mono text-xs">{(selectedEvent.reasonCodes || []).join(" · ") || "None"}</p>
              </div>
              <div className="col-span-2 text-xs text-gray-400 mt-2 flex justify-between">
                <span>Model: {selectedEvent.modelName}</span>
                <span className="text-orange-500 font-bold">⚠ AI suggestion — therapist review required.</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-gray-50 border border-dashed border-gray-300 p-6 rounded-2xl text-center text-gray-500 h-[300px] flex items-center justify-center">
            Click an event on the timeline to view the AI's explanation.
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className="bg-gray-50 p-6 rounded-2xl border shadow-sm h-[600px] overflow-y-auto">
        <h3 className="font-bold text-lg mb-4 text-gray-900">Event Timeline</h3>
        <div className="space-y-3">
          {events.length === 0 ? (
            <p className="text-sm text-gray-500">No events recorded.</p>
          ) : (
            events.map((event, idx) => (
              <button
                key={event.id || idx}
                onClick={() => jumpToEvent(event)}
                className={`block w-full rounded-xl border p-4 text-left transition-colors ${
                  selectedEvent?.id === event.id ? "bg-blue-100 border-blue-300 shadow-sm" : "bg-white hover:bg-gray-100"
                }`}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold text-blue-900">
                    {formatTime(event.videoTimeMs)}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                    (event.severity || 'info') === "warning" ? "bg-red-100 text-red-700" :
                    (event.severity || 'info') === "success" ? "bg-green-100 text-green-700" :
                    "bg-gray-200 text-gray-700"
                  }`}>
                    {(event.severity || 'info').toUpperCase()}
                  </span>
                </div>
                <div className="text-sm font-medium text-gray-800">
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
