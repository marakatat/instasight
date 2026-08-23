import Link from "next/link";

export default async function PatientDetailPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;

  return (
    <main className="min-h-[100dvh] bg-[#F7F4EE] p-6 md:p-12 font-sans">
      <div className="max-w-[1440px] mx-auto bg-white rounded-[48px] shadow-sm border border-gray-100 p-8 md:p-12">
        <header className="mb-10">
          <Link
            href="/doctor/dashboard"
            className="text-[10px] font-bold tracking-widest uppercase text-gray-400 hover:text-[#36332E] transition-colors inline-block mb-6"
          >
            ← Doctor Dashboard
          </Link>
          <h1 className="text-3xl md:text-5xl font-serif font-bold text-[#36332E]">
            Patient Profile
          </h1>
          <p className="text-gray-400 text-[10px] font-bold tracking-widest uppercase mt-3">
            ID: <span className="text-[#36332E]">{patientId}</span>
          </p>
        </header>

        <div className="border-t border-gray-100 mb-10" />

        <div className="border border-gray-100 bg-[#F7F4EE] rounded-[40px] p-12 text-center">
          <p className="text-gray-500 text-sm font-medium">
            Patient history and recovery longitudinal charts.
          </p>
        </div>
      </div>
    </main>
  );
}
