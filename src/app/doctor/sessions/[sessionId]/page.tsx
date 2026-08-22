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
    <main className="min-h-[100dvh] bg-figma-base p-6 md:p-12 selection:bg-figma-teal selection:text-white">
      <div className="max-w-[1600px] mx-auto">
        <header className="mb-12">
          <h1 className="text-4xl font-bold text-zinc-900 tracking-tight">Session Review</h1>
          <p className="text-zinc-500 font-medium mt-2 flex items-center gap-2">
            Exercise: <span className="font-bold text-zinc-900">Right Arm Raise</span> 
            <span className="text-zinc-300">•</span>
            Session ID: <code className="text-sm bg-zinc-200/50 text-zinc-600 px-2 py-0.5 rounded-md">{sessionId}</code>
          </p>
        </header>

        {events.length > 0 || videoUrl ? (
          <SessionVideoReview events={events} videoUrl={videoUrl} />
        ) : (
          <div className="bg-white p-12 rounded-[2.5rem] border border-slate-200/50 text-center shadow-[0_20px_40px_-15px_rgba(0,0,0,0.03)]">
            <h2 className="text-2xl font-bold text-zinc-900 tracking-tight">No session data found.</h2>
            <p className="text-zinc-500 font-medium mt-2">
              Go to the Patient view, complete an exercise, then click "Stop & Send to Doctor".
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
