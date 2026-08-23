import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import { ArrowRight, ChartLine, Clock, CheckCircle } from "@phosphor-icons/react/dist/ssr";

export const dynamic = "force-dynamic";

function formatExerciseName(id: string) {
  return id
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatDuration(ms: number) {
  if (!ms || ms <= 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export default async function PatientDashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Fetch sessions for this patient (or all if not logged in, for demo)
  const query = supabase
    .from("sessions")
    .select("*, session_events(count)")
    .order("completed_at", { ascending: false })
    .limit(20);

  if (user?.id) {
    query.eq("patient_id", user.id);
  }

  const { data: sessions } = await query;

  // Fetch summary events for each session to show patient summaries
  const sessionIds = sessions?.map((s: any) => s.id) ?? [];
  const { data: summaryEvents } = sessionIds.length > 0
    ? await supabase
        .from("session_events")
        .select("session_id, suggestion, clinical_note")
        .in("session_id", sessionIds)
        .contains("reason_codes", ["SESSION_SUMMARY"])
    : { data: [] };

  const summaryBySession = (summaryEvents ?? []).reduce((acc: any, ev: any) => {
    acc[ev.session_id] = ev.suggestion; // patient summary is stored in `suggestion`
    return acc;
  }, {} as Record<string, string>);

  // Compute high-level stats
  const totalSessions = sessions?.length ?? 0;
  const exerciseCounts = (sessions ?? []).reduce((acc: any, s: any) => {
    acc[s.exercise_id] = (acc[s.exercise_id] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const topExercise = Object.entries(exerciseCounts).sort((a: any, b: any) => b[1] - a[1])[0];

  return (
    <main className="min-h-[100dvh] bg-[#F7F4EE] p-6 md:p-12 font-sans">
      <div className="max-w-[1440px] mx-auto bg-white rounded-[48px] shadow-sm border border-gray-100 p-8 md:p-12">

        {/* Header */}
        <header className="mb-10">
          <Link
            href="/"
            className="text-[10px] font-bold tracking-widest uppercase text-gray-400 hover:text-[#36332E] transition-colors inline-block mb-6"
          >
            ← Instasight
          </Link>
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-5xl font-serif font-bold text-[#36332E]">
                My Progress
              </h1>
              <p className="text-gray-500 text-sm mt-3">
                Your rehabilitation journey, powered by AI.
              </p>
            </div>
            <Link
              href="/patient/home"
              className="inline-block bg-[#36332E] text-white rounded-[24px] font-bold text-[11px] tracking-widest uppercase px-6 py-4 hover:bg-black transition-colors whitespace-nowrap self-start sm:self-auto"
            >
              + New Session
            </Link>
          </div>
        </header>

        <div className="border-t border-gray-100 mb-10" />

        {/* Stats Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-12">
          <div className="bg-[#F7F4EE] rounded-[32px] p-6 border border-gray-100">
            <span className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-2">
              Total Sessions
            </span>
            <p className="font-mono text-3xl font-bold text-[#36332E]">{totalSessions}</p>
          </div>
          <div className="bg-[#F7F4EE] rounded-[32px] p-6 border border-gray-100">
            <span className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-2">
              Exercises Done
            </span>
            <p className="font-mono text-3xl font-bold text-[#36332E]">
              {Object.keys(exerciseCounts).length}
            </p>
          </div>
          <div className="bg-[#F7F4EE] rounded-[32px] p-6 border border-gray-100 col-span-2 sm:col-span-1">
            <span className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-2">
              Most Practiced
            </span>
            <p className="font-serif text-xl font-bold text-[#36332E] leading-tight mt-1">
              {topExercise ? formatExerciseName(topExercise[0] as string) : "—"}
            </p>
          </div>
        </div>

        {/* Sessions List */}
        {!sessions || sessions.length === 0 ? (
          <div className="border border-gray-100 bg-[#F7F4EE] rounded-[40px] p-12 md:p-16 text-center">
            <ChartLine size={40} className="text-gray-300 mx-auto mb-4" />
            <h2 className="text-2xl font-serif font-bold text-[#36332E] mb-3">No sessions yet</h2>
            <p className="text-sm text-gray-500 max-w-sm mx-auto mb-8">
              Complete your first exercise session and your AI-powered progress report will appear here automatically.
            </p>
            <Link
              href="/patient/home"
              className="inline-block bg-[#36332E] text-white rounded-[24px] font-bold text-[11px] tracking-widest uppercase px-6 py-4 hover:bg-black transition-colors"
            >
              Browse Exercises →
            </Link>
          </div>
        ) : (
          <>
            <span className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-4">
              Session History
            </span>
            <div className="flex flex-col gap-4">
              {sessions.map((session: any) => {
                const eventCount = session.session_events?.[0]?.count ?? 0;
                const summary = summaryBySession[session.id];
                const exerciseName = formatExerciseName(session.exercise_id || "Exercise Session");

                return (
                  <Link
                    key={session.id}
                    href={`/patient/session-review/${session.id}`}
                    className="group bg-[#F7F4EE] rounded-[32px] p-6 md:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:-translate-y-1 hover:shadow-md transition-all duration-300 border border-transparent hover:border-gray-200"
                  >
                    <div className="flex-1 min-w-0">
                      {/* Title row */}
                      <div className="flex items-center gap-3 mb-2">
                        <CheckCircle size={20} className="text-emerald-500 flex-shrink-0" weight="fill" />
                        <h3 className="font-serif font-bold text-[#36332E] text-lg leading-tight">
                          {exerciseName}
                        </h3>
                      </div>

                      {/* Date + time */}
                      <div className="flex items-center gap-3 pl-8 mb-3">
                        <Clock size={14} className="text-gray-400" />
                        <span className="text-[11px] font-bold text-gray-500 tracking-wider">
                          {formatDate(session.completed_at)} at {formatTime(session.completed_at)}
                        </span>
                        <span className="text-[11px] text-gray-300">·</span>
                        <span className="text-[11px] font-bold text-gray-500 tracking-wider">
                          {eventCount} AI events
                        </span>
                      </div>

                      {/* Patient summary */}
                      {summary && (
                        <p className="pl-8 text-sm text-gray-600 leading-relaxed line-clamp-2">
                          {summary}
                        </p>
                      )}
                      {!summary && (
                        <p className="pl-8 text-sm text-gray-400 italic">
                          Session complete.
                        </p>
                      )}
                    </div>

                    <ArrowRight
                      size={20}
                      weight="bold"
                      className="text-gray-400 group-hover:text-[#36332E] group-hover:translate-x-1 transition-all flex-shrink-0"
                    />
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
