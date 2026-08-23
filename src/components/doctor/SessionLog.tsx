"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import type { AIFeedbackEvent } from "@/types/rehabilitation";

type FilterType = "ALL" | "WARNINGS" | "BEST";

export function SessionLog({
  events,
  selectedEventId,
  onEventClick,
}: {
  events: AIFeedbackEvent[];
  selectedEventId?: string | null;
  onEventClick: (event: AIFeedbackEvent) => void;
}) {
  const [filter, setFilter] = useState<FilterType>("ALL");
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const filteredEvents = useMemo(() => {
    if (filter === "WARNINGS") {
      return events.filter((e) => e.severity === "warning" || e.severity === "error");
    }
    if (filter === "BEST") {
      return events.filter((e) => e.severity === "info" || e.severity === "success");
    }
    return events;
  }, [events, filter]);

  useEffect(() => {
    if (selectedEventId && scrollContainerRef.current) {
      const el = document.getElementById(`rep-card-${selectedEventId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      }
    }
  }, [selectedEventId]);

  return (
    <div className="w-full bg-white rounded-[40px] p-8 border border-gray-100 shadow-sm font-sans">
      {/* Header & Filters */}
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-[#36332E] font-bold text-xs tracking-widest uppercase">
          Session Log: Repetitions
        </h3>
        
        <div className="flex items-center gap-6">
          <FilterButton 
            active={filter === "ALL"} 
            label="ALL" 
            onClick={() => setFilter("ALL")} 
          />
          <FilterButton 
            active={filter === "WARNINGS"} 
            label="WARNINGS" 
            onClick={() => setFilter("WARNINGS")} 
          />
          <FilterButton 
            active={filter === "BEST"} 
            label="BEST" 
            onClick={() => setFilter("BEST")} 
          />
        </div>
      </div>

      {/* Horizontal Scroll Area */}
      <div 
        ref={scrollContainerRef}
        className="flex items-center gap-4 overflow-x-auto pb-4 pt-2 -mx-2 px-2 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent"
      >
        {filteredEvents.length === 0 ? (
          <div className="text-gray-400 text-sm py-4 w-full text-center">No repetitions match this filter.</div>
        ) : (
          filteredEvents.map((event) => {
            const isWarning = event.severity === "warning" || event.severity === "error";
            const isSelected = event.id === selectedEventId;
            const isBest = event.confidence && event.confidence > 0.95 && !isWarning;
            
            const durationMs = event.evidence?.movementDurationMs || 0;
            const durationSecs = (durationMs / 1000).toFixed(1);
            
            const angle = event.evidence?.rangeOfMotion || event.evidence?.shoulderAngle || event.evidence?.kneeAngle || "--";

            // Status Text
            let statusText = "OPTIMAL";
            let statusColor = "text-gray-400";
            if (isWarning) {
              statusText = event.reasonCodes?.[0] || "TOO FAST";
              // uppercase the status text and replace underscores with spaces
              statusText = statusText.replace(/_/g, " ").toUpperCase();
              statusColor = "text-[#B86F68]";
            } else if (isBest) {
              statusText = "BEST FORM";
              statusColor = "text-[#879783]";
            }

            return (
              <button
                key={event.id}
                id={`rep-card-${event.id}`}
                onClick={() => onEventClick(event)}
                className={`flex-shrink-0 flex flex-col justify-between w-[260px] h-[84px] p-5 rounded-[24px] text-left transition-all duration-200 bg-[#FBF9F6] border border-[#EAE5D9] ${isSelected ? "shadow-md ring-1 ring-gray-300" : "shadow-sm hover:shadow-md hover:-translate-y-0.5"}`}
              >
                <div className="flex justify-between items-start w-full">
                  <div className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${isWarning ? "bg-[#B86F68]" : "bg-[#879783]"}`}></span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                      Rep #{event.repetitionNumber?.toString().padStart(2, '0') || "00"}
                    </span>
                  </div>
                  <span className={`text-[9px] font-bold uppercase tracking-wider ${statusColor} text-right max-w-[130px] truncate`} title={statusText}>
                    {statusText}
                  </span>
                </div>
                
                <div className="flex justify-between items-end w-full">
                  <span className="text-[#36332E] font-bold text-sm">
                    {angle}° Angle
                  </span>
                  <span className="text-[10px] font-medium text-gray-400">
                    {durationSecs}s
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function FilterButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-[10px] font-bold tracking-widest uppercase transition-colors ${
        active 
          ? "text-[#36332E]" 
          : "text-gray-300 hover:text-gray-400"
      }`}
    >
      {label}
    </button>
  );
}
