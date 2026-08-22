import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import { Stethoscope, CalendarBlank, ChartLineUp, ArrowRight } from "@phosphor-icons/react/dist/ssr";

export const dynamic = "force-dynamic";

export default async function DoctorDashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Fetch the doctor's profile to get the PIN
  const { data: doctorProfile } = await supabase
    .from('profiles')
    .select('full_name, cabinet_code')
    .eq('id', user?.id)
    .single();

  const { data: sessions, error } = await supabase
    .from("sessions")
    .select("*, session_events(count), profiles(full_name)")
    .order("completed_at", { ascending: false });

  if (error) console.error("Error fetching sessions:", error);

  return (
    <main className="min-h-[100dvh] bg-figma-base p-6 md:p-12 selection:bg-figma-teal selection:text-white">
      <div className="max-w-[1200px] mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12">
          <header className="flex items-center gap-6">
            <div className="w-16 h-16 rounded-[1.25rem] bg-white border border-slate-200/50 shadow-sm flex items-center justify-center">
              <Stethoscope size={32} weight="duotone" className="text-figma-teal" />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-zinc-900 tracking-tight">
                {doctorProfile?.full_name ? `Dr. ${doctorProfile.full_name}'s Cabinet` : "Clinical Dashboard"}
              </h1>
              <p className="text-zinc-500 font-medium mt-1">Review AI-assisted telerehab sessions</p>
            </div>
          </header>

          {doctorProfile?.cabinet_code && (
            <div className="bg-white border border-slate-200/50 rounded-2xl p-4 shadow-sm flex items-center gap-4">
              <div className="bg-figma-teal/10 p-3 rounded-xl">
                <span className="text-xs font-bold text-figma-teal">CABINET PIN</span>
              </div>
              <p className="font-mono text-3xl font-bold tracking-widest text-zinc-900">{doctorProfile.cabinet_code}</p>
            </div>
          )}
        </div>

        {!sessions || sessions.length === 0 ? (
          <div className="bg-white p-12 rounded-[2.5rem] border border-slate-200/50 text-center shadow-[0_20px_40px_-15px_rgba(0,0,0,0.03)]">
            <div className="w-24 h-24 bg-zinc-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <CalendarBlank size={40} weight="duotone" className="text-zinc-300" />
            </div>
            <h2 className="text-2xl font-bold text-zinc-900 tracking-tight">No sessions recorded yet</h2>
            <p className="text-zinc-500 font-medium mt-2 max-w-sm mx-auto">Patient exercises captured via the portal will automatically sync here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sessions.map((session: any) => {
              const eventCount = session.session_events?.[0]?.count ?? 0;
              const date = new Date(session.completed_at);
              const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
              const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
              
              const title = session.exercise_id?.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) || "Exercise Session";
              const patientName = session.profiles?.full_name || "Unknown Patient";

              return (
                <Link
                  key={session.id}
                  href={`/doctor/sessions/${session.id}`}
                  className="group flex flex-col bg-white p-8 rounded-[2rem] border border-slate-200/50 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.03)] hover:border-figma-teal/30 hover:shadow-lg transition-all duration-300 hover:-translate-y-1 overflow-hidden relative"
                >

                  
                  <div className="flex-1 z-10">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="text-xl font-bold text-zinc-900 tracking-tight">{title}</h3>
                      <span className="px-2 py-1 bg-zinc-100 rounded text-xs font-bold text-zinc-500">{patientName}</span>
                    </div>
                    <div className="flex items-center gap-2 text-zinc-500 text-sm font-medium">
                      <CalendarBlank size={16} weight="bold" />
                      {formattedDate} at {time}
                    </div>
                  </div>

                  <div className="mt-8 pt-6 border-t border-slate-100 flex items-end justify-between z-10">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <ChartLineUp size={16} className="text-figma-vibrant" weight="bold" />
                        <span className="text-xs font-bold text-zinc-400">Telemetry</span>
                      </div>
                      <p className="font-mono text-2xl font-bold text-zinc-900">
                        {eventCount} <span className="text-sm font-sans text-zinc-400 font-medium">events</span>
                      </p>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-zinc-50 border border-zinc-200 flex items-center justify-center text-zinc-400 group-hover:bg-figma-teal group-hover:text-white group-hover:border-figma-teal transition-all duration-300">
                      <ArrowRight size={20} weight="bold" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
