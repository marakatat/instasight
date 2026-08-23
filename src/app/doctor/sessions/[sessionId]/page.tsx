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
  const events: AIFeedbackEvent[] = (rawEvents || [])
    .filter((row) => row.source !== "summary")
    .map((row) => ({
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

  const summaryRow = (rawEvents || []).find((row) => row.source === "summary");
  const doctorSummary = session?.doctor_summary || summaryRow?.clinical_note || undefined;

  const videoUrl = session?.video_url || null;

  // Retrieve session-specific EEG metrics from deviceStore
  const { deviceStore } = await import("@/lib/device/deviceStore");
  const eegMetrics = deviceStore.getSessionMetrics("esp32-eeg-01", sessionId);

  return (
    <main className="min-h-[100dvh] bg-[#F7F4EE] p-6 md:p-10 text-[#36332E] font-sans">
      <div className="max-w-[1440px] mx-auto bg-white rounded-[48px] shadow-sm border border-gray-100 p-8 flex flex-col gap-8">
        
        {/* Real Header with Figma Styling */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 pb-6 border-b border-gray-100">
          <div className="flex flex-col gap-2">
            <Link
              href="/doctor/dashboard"
              className="text-[10px] font-bold tracking-widest uppercase text-gray-400 hover:text-[#36332E] transition-colors"
            >
              ← Back to Dashboard
            </Link>
            <h1 className="text-3xl font-serif font-bold tracking-tight text-[#36332E]">
              Clinical Neuro-Kinematic Review
            </h1>
          </div>
          
          <div className="flex gap-8 text-sm">
            <div>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Protocol</p>
              <p className="text-[#36332E] font-bold">Right Arm Raise</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Session ID</p>
              <p className="text-[#36332E] font-bold max-w-[120px] truncate" title={sessionId}>{sessionId}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Device</p>
              <p className="text-emerald-600 font-bold">esp32-eeg-01</p>
            </div>
          </div>
        </header>

        {events.length > 0 || videoUrl ? (
          <SessionVideoReview 
            events={events} 
            videoUrl={videoUrl} 
            doctorSummary={doctorSummary}
            eegMetrics={eegMetrics}
          />
        ) : (
          <div className="py-24 text-center bg-[#F7F4EE] rounded-[40px] m-4">
            <h2 className="text-2xl font-serif font-bold text-[#36332E] mb-2">No session data recorded</h2>
            <p className="text-gray-400 text-sm max-w-md mx-auto">
              This session does not contain recorded video or telemetry events.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
