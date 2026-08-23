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
    <main className="min-h-[100dvh] bg-black text-white">
      <div className="max-w-[1200px] mx-auto px-6 md:px-12 py-12">

        {/* Header */}
        <header className="mb-12">
          <Link
            href="/"
            className="text-xs font-mono tracking-[0.2em] uppercase text-white/40 hover:text-white transition-colors inline-block mb-6"
          >
            ← Instasight
          </Link>
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <h1 className="text-4xl md:text-5xl font-serif font-bold text-white">
                My Progress
              </h1>
              <p className="text-white/40 text-sm mt-2">
                Your rehabilitation journey, powered by AI.
              </p>
            </div>
            <Link
              href="/patient/home"
              className="inline-block bg-white text-black font-bold text-xs font-mono tracking-widest uppercase px-6 py-3 hover:bg-white/90 transition-colors whitespace-nowrap self-start sm:self-auto"
            >
              + New Session
            </Link>
          </div>
        </header>

        <hr className="border-white/10 mb-10" />

        {/* Stats Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-white/10 mb-12">
          <div className="bg-black p-6">
            <span className="text-xs font-mono tracking-[0.2em] uppercase text-white/30 block mb-2">
              Total Sessions
            </span>
            <p className="font-mono text-4xl font-bold text-white">{totalSessions}</p>
          </div>
          <div className="bg-black p-6">
            <span className="text-xs font-mono tracking-[0.2em] uppercase text-white/30 block mb-2">
              Exercises Done
            </span>
            <p className="font-mono text-4xl font-bold text-white">
              {Object.keys(exerciseCounts).length}
            </p>
          </div>
          <div className="bg-black p-6 col-span-2 sm:col-span-1">
            <span className="text-xs font-mono tracking-[0.2em] uppercase text-white/30 block mb-2">
              Most Practiced
            </span>
            <p className="font-serif text-xl font-bold text-white leading-tight">
              {topExercise ? formatExerciseName(topExercise[0] as string) : "—"}
            </p>
          </div>
        </div>

        {/* Sessions List */}
        {!sessions || sessions.length === 0 ? (
          <div className="border border-white/10 p-16 text-center">
            <ChartLine size={40} className="text-white/20 mx-auto mb-4" />
            <h2 className="text-2xl font-serif text-white mb-3">No sessions yet</h2>
            <p className="text-sm text-white/40 max-w-sm mx-auto mb-8">
              Complete your first exercise session and your AI-powered progress report will appear here automatically.
            </p>
            <Link
              href="/patient/home"
              className="inline-block bg-white text-black font-bold text-xs font-mono tracking-widest uppercase px-6 py-3 hover:bg-white/90 transition-colors"
            >
              Browse Exercises →
            </Link>
          </div>
        ) : (
          <>
            <span className="text-xs font-mono tracking-[0.2em] uppercase text-white/30 block mb-4">
              Session History
            </span>
            <div className="flex flex-col gap-px bg-white/10">
              {sessions.map((session: any) => {
                const eventCount = session.session_events?.[0]?.count ?? 0;
                const summary = summaryBySession[session.id];
                const exerciseName = formatExerciseName(session.exercise_id || "Exercise Session");

                return (
                  <Link
                    key={session.id}
                    href={`/patient/session-review/${session.id}`}
                    className="group bg-black p-6 md:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-white/[0.03] transition-all"
                  >
                    <div className="flex-1 min-w-0">
                      {/* Title row */}
                      <div className="flex items-center gap-3 mb-2">
                        <CheckCircle size={16} className="text-white/20 group-hover:text-white/40 flex-shrink-0 transition-colors" weight="bold" />
                        <h3 className="font-serif font-bold text-white text-lg leading-tight">
                          {exerciseName}
                        </h3>
                      </div>

                      {/* Date + time */}
                      <div className="flex items-center gap-3 pl-7 mb-3">
                        <Clock size={12} className="text-white/25" />
                        <span className="text-xs font-mono text-white/30">
                          {formatDate(session.completed_at)} at {formatTime(session.completed_at)}
                        </span>
                        <span className="text-xs font-mono text-white/20">·</span>
                        <span className="text-xs font-mono text-white/30">
                          {eventCount} AI events
                        </span>
                      </div>

                      {/* Patient summary */}
                      {summary && (
                        <p className="pl-7 text-sm text-white/50 leading-relaxed line-clamp-2 group-hover:text-white/70 transition-colors">
                          {summary}
                        </p>
                      )}
                      {!summary && (
                        <p className="pl-7 text-sm text-white/25 italic">
                          Session complete.
                        </p>
                      )}
                    </div>

                    <ArrowRight
                      size={18}
                      weight="bold"
                      className="text-white/20 group-hover:text-white/60 group-hover:translate-x-1 transition-all flex-shrink-0"
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
