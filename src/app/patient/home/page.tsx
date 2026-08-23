"use client";

import Link from "next/link";
import { EXERCISE_LIBRARY } from "@/lib/pose/exerciseLibrary";
import { useState } from "react";

const categoryLabel: Record<string, string> = {
  upper: "Upper Body",
  lower: "Lower Body",
  full: "Full Body",
};

const difficultyColor: Record<string, string> = {
  beginner: "text-emerald-500",
  intermediate: "text-blue-500",
  advanced: "text-orange-500",
};

const categoryOrder = ["upper", "lower", "full"];

export default function PatientHomePage() {
  const [selected, setSelected] = useState<string | null>(null);
  const exercises = Object.values(EXERCISE_LIBRARY);

  const grouped = categoryOrder.reduce((acc, cat) => {
    acc[cat] = exercises.filter((e) => e.category === cat);
    return acc;
  }, {} as Record<string, typeof exercises>);

  return (
    <main className="min-h-[100dvh] bg-[#F7F4EE] p-6 md:p-12 font-sans">
      <div className="max-w-[1440px] mx-auto bg-white rounded-[48px] shadow-sm border border-gray-100 p-8 md:p-12 relative pb-24">

        {/* Header */}
        <header className="mb-10">
          <div className="flex items-center justify-between mb-6">
            <Link
              href="/"
              className="text-[10px] font-bold tracking-widest uppercase text-gray-400 hover:text-[#36332E] transition-colors"
            >
              ← Instasight
            </Link>
            <Link
              href="/patient/dashboard"
              className="text-[10px] font-bold tracking-widest uppercase text-gray-400 hover:text-[#36332E] transition-colors"
            >
              My Progress →
            </Link>
          </div>
          <h1 className="text-3xl md:text-5xl font-serif font-bold text-[#36332E]">
            Exercise Library
          </h1>
          <p className="text-gray-500 text-sm mt-3 max-w-lg">
            Select an exercise to begin your AI-guided rehabilitation session. Your form will be tracked in real time.
          </p>
        </header>

        <div className="border-t border-gray-100 mb-10" />

        {/* Exercise Groups */}
        {categoryOrder.map((cat) => {
          const group = grouped[cat];
          if (!group || group.length === 0) return null;
          return (
            <section key={cat} className="mb-12">
              <span className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-4">
                {categoryLabel[cat]}
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {group.map((exercise) => {
                  const isSelected = selected === exercise.id;
                  return (
                    <button
                      key={exercise.id}
                      onClick={() => setSelected(isSelected ? null : exercise.id)}
                      className={`
                        text-left p-8 transition-all duration-300 group flex flex-col justify-between min-h-[220px] rounded-[32px]
                        ${isSelected
                          ? "border-2 border-[#36332E] bg-gray-50 shadow-md"
                          : "border border-gray-200 bg-[#F7F4EE] hover:border-gray-300 hover:shadow-md hover:-translate-y-1"}
                      `}
                    >
                      <div>
                        {/* Difficulty dot */}
                        <div className="flex items-center justify-between mb-4">
                          <span className={`text-[10px] font-bold tracking-widest uppercase ${difficultyColor[exercise.difficulty]}`}>
                            {exercise.difficulty}
                          </span>
                          {isSelected && (
                            <span className="text-[10px] font-bold tracking-widest uppercase text-white bg-[#36332E] px-3 py-1 rounded-full">
                              Selected
                            </span>
                          )}
                        </div>

                        {/* Name */}
                        <h2 className="text-xl font-serif font-bold text-[#36332E] mb-2 group-hover:text-black transition-colors">
                          {exercise.name}
                        </h2>

                        {/* Description */}
                        <p className="text-gray-500 text-sm leading-relaxed mb-4">
                          {exercise.description}
                        </p>
                      </div>

                      {/* Instructions (visible when selected) */}
                      {isSelected && (
                        <p className="text-gray-600 text-xs leading-relaxed border-t border-gray-200 pt-4 mt-2">
                          {exercise.instructions}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}

        {/* CTA */}
        <div
          className={`
            fixed bottom-8 left-1/2 -translate-x-1/2 w-[calc(100%-3rem)] max-w-[800px] transition-all duration-500 z-50
            ${selected ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10 pointer-events-none"}
          `}
        >
          <div className="bg-white/95 backdrop-blur-md rounded-[32px] shadow-2xl border border-gray-200 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div>
              <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-1">Selected Exercise</p>
              <p className="font-serif font-bold text-[#36332E] text-xl">
                {selected ? EXERCISE_LIBRARY[selected]?.name : ""}
              </p>
            </div>
            {selected && (
              <Link
                href={`/patient/session/${selected}`}
                className="bg-[#36332E] text-white rounded-[24px] font-bold text-[11px] tracking-widest uppercase px-8 py-4 hover:bg-black transition-colors whitespace-nowrap text-center"
              >
                Start Session →
              </Link>
            )}
          </div>
        </div>

      </div>
    </main>
  );
}
