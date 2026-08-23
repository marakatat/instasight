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
      // Mock "BEST" by finding reps with highest confidence or no warnings
      return events.filter((e) => e.severity === "info" || e.severity === "success");
    }
    return events;
  }, [events, filter]);

  // When a new event is selected, we could scroll it into view if we want
  useEffect(() => {
    if (selectedEventId && scrollContainerRef.current) {
      const el = document.getElementById(`rep-card-${selectedEventId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      }
    }
  }, [selectedEventId]);

  return (
    <div className="w-full bg-white border border-[#F7F4EE] rounded-[24px] p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)]">
      {/* Header & Filters */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h3 className="text-[#36332E] font-sans font-bold text-sm tracking-[0.35px] uppercase">
          Session Log: Repetitions
        </h3>
        
        <div className="flex items-center gap-2">
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
        className="flex items-center gap-4 overflow-x-auto pb-4 pt-2 -mx-2 px-2 scrollbar-thin scrollbar-thumb-stone-200 scrollbar-track-transparent"
      >
        {filteredEvents.length === 0 ? (
          <div className="text-stone-400 text-sm py-4">No repetitions match this filter.</div>
        ) : (
          filteredEvents.map((event) => {
            const isWarning = event.severity === "warning" || event.severity === "error";
            const isSelected = event.id === selectedEventId;
            
            // Format duration
            const durationMs = event.evidence?.movementDurationMs || 0;
            const durationSecs = (durationMs / 1000).toFixed(2);
            
            // Format angle
            const angle = event.evidence?.rangeOfMotion || event.evidence?.shoulderAngle || event.evidence?.kneeAngle || "--";

            return (
              <button
                key={event.id}
                id={`rep-card-${event.id}`}
                onClick={() => onEventClick(event)}
                className={`flex-shrink-0 flex items-center justify-between w-[252px] h-[76px] px-4 rounded-[12px] border text-left transition-all duration-200 ${
                  isWarning 
                    ? "bg-[#FCF5F5] border-[#B86F68] shadow-[0_0_0_1px_rgba(254,243,199,0.5)]" 
                    : "bg-[#F7F4EE] border-[#879783]"
                } ${isSelected ? "ring-2 ring-offset-2 ring-[#36332E]" : "hover:-translate-y-1 hover:shadow-md"}`}
              >
                <div className="flex flex-col justify-center h-full">
                  <span className={`text-[10px] font-bold uppercase tracking-[0.1em] mb-1 ${
                    isWarning ? "text-[#B86F68]" : "text-[#879783]"
                  }`}>
                    Rep #{event.repetitionNumber?.toString().padStart(2, '0') || "00"}
                  </span>
                  <span className="text-[#36332E] font-bold text-sm tracking-[-0.1px]">
                    {angle}° Angle
                  </span>
                </div>
                
                <div className="flex flex-col justify-end h-full py-1">
                  <span className={`text-[10px] ${
                    isWarning ? "text-[#B86F68]" : "text-[#879783]"
                  }`}>
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
      className={`px-3 py-1.5 rounded-full text-xs font-bold tracking-[0.2px] transition-colors ${
        active 
          ? "bg-[#36332E] text-[#F7F4EE]" 
          : "text-[#36332E]/60 hover:bg-[#F7F4EE]"
      }`}
    >
      {label}
    </button>
  );
}
