import { supabase } from "@/lib/supabase";
import { SessionVideoReview } from "@/components/doctor/SessionVideoReview";
import type { AIFeedbackEvent } from "@/types/rehabilitation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function DoctorSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

  // Fetch session record
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
    <main className="min-h-[100dvh] bg-black p-6 md:p-12 text-white">
      <div className="max-w-[1600px] mx-auto">
        <header className="mb-10">
          <Link
            href="/doctor/dashboard"
            className="text-xs font-mono tracking-[0.2em] uppercase text-white/40 hover:text-white transition-colors inline-block mb-6"
          >
            ← Doctor Dashboard
          </Link>
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <h1 className="text-4xl md:text-5xl font-serif font-bold tracking-tight text-white">
                Session Review
              </h1>
              <p className="text-white/40 text-sm mt-2 font-mono">
                Protocol: <span className="text-white">Right Arm Raise</span> 
                {" "}• Session: <span className="text-white/70">{sessionId}</span>
              </p>
            </div>
          </div>
        </header>

        <hr className="rule-light !mt-0 mb-10" />

        {events.length > 0 || videoUrl ? (
          <SessionVideoReview 
            events={events} 
            videoUrl={videoUrl} 
            doctorSummary={session?.doctor_summary}
          />
        ) : (
          <div className="border border-white/15 p-16 text-center">
            <h2 className="text-2xl font-serif text-white mb-2">No session data recorded</h2>
            <p className="text-white/40 text-sm max-w-md mx-auto">
              This session does not contain recorded video or telemetry events.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
