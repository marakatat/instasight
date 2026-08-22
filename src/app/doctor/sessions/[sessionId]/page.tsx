import { SessionVideoReview } from "@/components/doctor/SessionVideoReview";
import type { AIFeedbackEvent } from "@/types/rehabilitation";

export default function DoctorSessionPage() {
  // MOCK DATA for the doctor to review during the demo
  const mockEvents: AIFeedbackEvent[] = [
    {
      id: "evt_1",
      sessionId: "session_demo",
      videoTimeMs: 4200,
      createdAt: new Date().toISOString(),
      suggestion: "Try to move more slowly.",
      severity: "warning",
      reasonCodes: ["MOVEMENT_TOO_FAST"],
      evidence: {
        videoTimeMs: 4200,
        repetitionNumber: 1,
        exercisePhase: "complete",
        shoulderAngle: 61,
        movementDurationMs: 1200,
        rangeOfMotion: 61,
        poseConfidence: 0.92
      },
      confidence: 0.91,
      modelName: "openai/gpt-4o-mini",
      modelVersion: "1.0",
      source: "ai",
      therapistReviewed: false
    },
    {
      id: "evt_2",
      sessionId: "session_demo",
      videoTimeMs: 14500,
      createdAt: new Date().toISOString(),
      suggestion: "Good effort. Try to move slightly farther.",
      severity: "warning",
      reasonCodes: ["RANGE_OF_MOTION_BELOW_TARGET"],
      evidence: {
        videoTimeMs: 14500,
        repetitionNumber: 2,
        exercisePhase: "complete",
        shoulderAngle: 55,
        movementDurationMs: 3400,
        rangeOfMotion: 55,
        poseConfidence: 0.88
      },
      confidence: 0.89,
      modelName: "openai/gpt-4o-mini",
      modelVersion: "1.0",
      source: "ai",
      therapistReviewed: false
    },
    {
      id: "evt_3",
      sessionId: "session_demo",
      videoTimeMs: 25000,
      createdAt: new Date().toISOString(),
      suggestion: "Perfect movement!",
      severity: "success",
      reasonCodes: [],
      evidence: {
        videoTimeMs: 25000,
        repetitionNumber: 3,
        exercisePhase: "complete",
        shoulderAngle: 95,
        movementDurationMs: 3100,
        rangeOfMotion: 95,
        poseConfidence: 0.96
      },
      confidence: 0.98,
      modelName: "openai/gpt-4o-mini",
      modelVersion: "1.0",
      source: "ai",
      therapistReviewed: false
    }
  ];

  return (
    <main className="min-h-screen p-8 bg-gray-100">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Session Review: Demo Patient</h1>
          <p className="text-gray-600 mt-2">Exercise: Right Arm Raise • Completed: Today, 14:30</p>
        </header>

        <SessionVideoReview events={mockEvents} />
      </div>
    </main>
  );
}
