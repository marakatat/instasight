import fs from "fs";
import path from "path";
import { SessionVideoReview } from "@/components/doctor/SessionVideoReview";
import type { AIFeedbackEvent } from "@/types/rehabilitation";

export const dynamic = "force-dynamic"; // Ensure it always reads the latest file!

export default function DoctorSessionPage() {
  let events: AIFeedbackEvent[] = [];
  
  try {
    const filePath = path.join(process.cwd(), "public", "session-data.json");
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, "utf-8");
      events = JSON.parse(data);
    }
  } catch (err) {
    console.error("Could not load session data", err);
  }

  return (
    <main className="min-h-screen p-8 bg-gray-100">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Session Review: Demo Patient</h1>
          <p className="text-gray-600 mt-2">Exercise: Right Arm Raise • Completed: Today</p>
        </header>

        <SessionVideoReview events={events} />
      </div>
    </main>
  );
}
