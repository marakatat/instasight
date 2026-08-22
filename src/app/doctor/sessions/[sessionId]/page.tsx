import { supabase } from "@/lib/supabase";
import { SessionVideoReview } from "@/components/doctor/SessionVideoReview";
import type { AIFeedbackEvent } from "@/types/rehabilitation";

export const dynamic = "force-dynamic";

export default async function DoctorSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

  // Fetch session record (for video URL)
  const { data: session } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", sessionId)
    .single();

  // Fetch all AI events for this session, ordered by time
  const { data: rawEvents, error } = await supabase
    .from("session_events")
    .select("*")
    .eq("session_id", sessionId)
    .order("video_time_ms", { ascending: true });

  if (error) console.error("Error fetching session events:", error);

  // Map DB rows back to AIFeedbackEvent shape
  const events: AIFeedbackEvent[] = (rawEvents || []).map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    videoTimeMs: row.video_time_ms,
    repetitionNumber: row.repetition_number,
    suggestion: row.suggestion,
    clinicalNote: row.clinical_note,
    severity: row.severity,
    reasonCodes: row.reason_codes,
    evidence: row.evidence,
    modelName: row.model_name,
    modelVersion: "1.0",
    confidence: row.confidence,
    source: row.source,
    createdAt: row.created_at,
    therapistReviewed: false,
  }));

  const videoUrl = session?.video_url || null;

  return (
    <main className="min-h-screen p-8 bg-gray-100">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Session Review</h1>
          <p className="text-gray-600 mt-1">
            Exercise: Right Arm Raise · Session ID: <code className="text-sm bg-gray-200 px-1 rounded">{sessionId}</code>
          </p>
        </header>

        {events.length > 0 || videoUrl ? (
          <SessionVideoReview events={events} videoUrl={videoUrl} />
        ) : (
          <div className="bg-white p-8 rounded-xl text-center border shadow-sm">
            <h2 className="text-xl font-bold text-gray-800">No session data found.</h2>
            <p className="text-gray-600 mt-2">
              Go to the Patient view, complete an exercise, then click "Stop & Send to Doctor".
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
