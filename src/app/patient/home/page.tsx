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
  beginner: "text-white/40",
  intermediate: "text-white/60",
  advanced: "text-white",
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
    <main className="min-h-[100dvh] bg-black text-white">
      <div className="max-w-[1200px] mx-auto px-6 md:px-12 py-12">

        {/* Header */}
        <header className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <Link
              href="/"
              className="text-xs font-mono tracking-[0.2em] uppercase text-white/40 hover:text-white transition-colors"
            >
              ← Instasight
            </Link>
            <Link
              href="/patient/dashboard"
              className="text-xs font-mono tracking-[0.2em] uppercase text-white/40 hover:text-white transition-colors"
            >
              My Progress →
            </Link>
          </div>
          <h1 className="text-4xl md:text-5xl font-serif font-bold text-white">
            Exercise Library
          </h1>
          <p className="text-white/40 text-sm mt-2 max-w-lg">
            Select an exercise to begin your AI-guided rehabilitation session. Your form will be tracked in real time.
          </p>
        </header>

        <hr className="border-white/10 mb-12" />

        {/* Exercise Groups */}
        {categoryOrder.map((cat) => {
          const group = grouped[cat];
          if (!group || group.length === 0) return null;
          return (
            <section key={cat} className="mb-12">
              <span className="text-xs font-mono tracking-[0.2em] uppercase text-white/30 block mb-4">
                {categoryLabel[cat]}
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {group.map((exercise) => {
                  const isSelected = selected === exercise.id;
                  return (
                    <button
                      key={exercise.id}
                      onClick={() => setSelected(isSelected ? null : exercise.id)}
                      className={`
                        text-left border p-6 transition-all duration-200 group
                        ${isSelected
                          ? "border-white bg-white/5"
                          : "border-white/15 hover:border-white/40 hover:bg-white/[0.02]"}
                      `}
                    >
                      {/* Difficulty dot */}
                      <div className="flex items-center justify-between mb-4">
                        <span className={`text-[10px] font-mono tracking-widest uppercase ${difficultyColor[exercise.difficulty]}`}>
                          {exercise.difficulty}
                        </span>
                        {isSelected && (
                          <span className="text-[10px] font-mono tracking-widest uppercase text-white bg-white/15 px-2 py-1">
                            Selected
                          </span>
                        )}
                      </div>

                      {/* Name */}
                      <h2 className="text-xl font-serif font-bold text-white mb-2 group-hover:text-white transition-colors">
                        {exercise.name}
                      </h2>

                      {/* Description */}
                      <p className="text-white/40 text-sm leading-relaxed mb-4">
                        {exercise.description}
                      </p>

                      {/* Instructions (visible when selected) */}
                      {isSelected && (
                        <p className="text-white/60 text-xs leading-relaxed border-t border-white/10 pt-3 mt-3">
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
            sticky bottom-6 mt-6 transition-all duration-300
            ${selected ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"}
          `}
        >
          <div className="border border-white/20 bg-black/90 backdrop-blur-sm p-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-mono text-white/40 uppercase tracking-widest mb-1">Selected Exercise</p>
              <p className="font-serif font-bold text-white text-lg">
                {selected ? EXERCISE_LIBRARY[selected]?.name : ""}
              </p>
            </div>
            {selected && (
              <Link
                href={`/patient/session/${selected}`}
                className="bg-white text-black font-bold text-xs font-mono tracking-widest uppercase px-8 py-4 hover:bg-white/90 transition-colors whitespace-nowrap"
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
