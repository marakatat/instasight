"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { useState, useEffect } from "react";

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Form state
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"doctor" | "patient" | null>(null);
  const [cabinetCode, setCabinetCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const totalSteps = role === "patient" ? 3 : 2;

  useEffect(() => {
    setMounted(true);
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.replace("/login");
    });
  }, [router, supabase]);

  async function handleComplete(
    targetRole?: "doctor" | "patient",
    skipPin: boolean = false
  ) {
    setLoading(true);
    setError(null);
    const selectedRole = targetRole || role;

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        throw new Error("No active session found. Please sign in.");
      }

      let updates: any = {
        full_name: fullName.trim(),
        role: selectedRole,
      };

      if (selectedRole === "doctor") {
        updates.cabinet_code = Math.floor(
          1000 + Math.random() * 9000
        ).toString();
      } else if (
        selectedRole === "patient" &&
        !skipPin &&
        cabinetCode.trim().length > 0
      ) {
        const { data: doctor, error: docError } = await supabase
          .from("profiles")
          .select("id")
          .eq("cabinet_code", cabinetCode.trim())
          .maybeSingle();

        if (docError || !doctor) {
          throw new Error(
            "Invalid Doctor PIN. Please check the code and try again."
          );
        }
        updates.doctor_id = doctor.id;
      }

      const { error: updateError } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", user.id);

      if (updateError) {
        throw updateError;
      }

      if (selectedRole === "doctor") {
        router.push("/doctor/dashboard");
      } else {
        router.push("/patient/session/right_arm_raise");
      }
    } catch (err: any) {
      console.error("Error completing onboarding:", err);
      setError(err.message || "Failed to complete setup.");
      setLoading(false);
    }
  }

  if (!mounted) {
    return (
      <main className="min-h-[100dvh] bg-[#F7F4EE] flex items-center justify-center font-sans">
        <div className="w-6 h-6 border-2 border-[#36332E] border-t-transparent animate-spin rounded-full" />
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-[#F7F4EE] flex items-center justify-center px-6 md:px-12 font-sans">
      <div className="max-w-2xl w-full bg-white rounded-[40px] p-8 md:p-12 shadow-sm border border-gray-100">

        {/* ── Step indicator ── */}
        <div className="mb-10 flex items-center gap-4">
          <span className="text-[10px] font-bold tracking-widest text-gray-400">
            {String(step).padStart(2, "0")} / {String(totalSteps).padStart(2, "0")}
          </span>
          <div className="flex-1 h-1 bg-[#F7F4EE] rounded-full relative overflow-hidden">
            <div
              className="absolute top-0 left-0 h-full bg-[#36332E] transition-all duration-500 rounded-full"
              style={{ width: `${(step / totalSteps) * 100}%` }}
            />
          </div>
        </div>

        {/* ── STEP 1: NAME ── */}
        {step === 1 && (
          <div className="animate-in fade-in duration-300">
            <h1 className="text-3xl md:text-4xl font-serif font-bold text-[#36332E] mb-3">
              Welcome
            </h1>
            <p className="text-gray-500 text-sm mb-8">
              What should we call you?
            </p>

            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="First & Last Name"
              className="w-full bg-[#F7F4EE] border border-[#EAE5D9] rounded-[24px] px-5 py-4 text-[#36332E] text-lg placeholder:text-gray-400 focus:outline-none focus:border-gray-300 transition-colors mb-8"
            />

            <button
              onClick={() => setStep(2)}
              disabled={fullName.trim().length < 2}
              suppressHydrationWarning
              className="w-full bg-[#36332E] text-white rounded-[24px] py-4 font-bold text-[11px] tracking-widest uppercase hover:bg-black transition-colors disabled:opacity-30"
            >
              Continue →
            </button>
          </div>
        )}

        {/* ── STEP 2: ROLE ── */}
        {step === 2 && (
          <div className="animate-in fade-in duration-300">
            <h1 className="text-3xl md:text-4xl font-serif font-bold text-[#36332E] mb-3">
              Your Role
            </h1>
            <p className="text-gray-500 text-sm mb-10">
              Select your account type to personalize your experience.
            </p>

            <div className="grid md:grid-cols-2 gap-4">
              <button
                onClick={() => {
                  setRole("patient");
                  setStep(3);
                }}
                className="group bg-[#F7F4EE] p-8 md:p-10 rounded-[32px] text-left hover:shadow-md hover:-translate-y-1 transition-all duration-300 border border-transparent hover:border-gray-200 flex flex-col justify-between"
              >
                <div>
                  <span className="text-[10px] font-bold tracking-widest uppercase text-gray-400 group-hover:text-emerald-500 transition-colors">
                    Patient
                  </span>
                  <h2 className="text-2xl font-serif font-bold mt-3 text-[#36332E]">
                    I am a Patient
                  </h2>
                  <p className="text-sm text-gray-500 mt-3 leading-relaxed">
                    Perform exercises at home with real-time AI feedback and share
                    progress with your physical therapist.
                  </p>
                </div>
                <span className="inline-block mt-6 text-[10px] font-bold tracking-widest uppercase text-gray-400 group-hover:text-[#36332E] group-hover:translate-x-1 transition-all">
                  Continue →
                </span>
              </button>

              <button
                onClick={() => {
                  setRole("doctor");
                  handleComplete("doctor", true);
                }}
                className="group bg-[#F7F4EE] p-8 md:p-10 rounded-[32px] text-left hover:shadow-md hover:-translate-y-1 transition-all duration-300 border border-transparent hover:border-gray-200 flex flex-col justify-between"
              >
                <div>
                  <span className="text-[10px] font-bold tracking-widest uppercase text-gray-400 group-hover:text-blue-500 transition-colors">
                    Clinician
                  </span>
                  <h2 className="text-2xl font-serif font-bold mt-3 text-[#36332E]">
                    I am a Doctor
                  </h2>
                  <p className="text-sm text-gray-500 mt-3 leading-relaxed">
                    Review patient kinematics, view AI-assisted telemetry, and
                    manage recovery programs remotely.
                  </p>
                </div>
                <span className="inline-block mt-6 text-[10px] font-bold tracking-widest uppercase text-gray-400 group-hover:text-[#36332E] group-hover:translate-x-1 transition-all">
                  {loading ? "Setting up..." : "Continue →"}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: PATIENT PIN ── */}
        {step === 3 && role === "patient" && (
          <div className="animate-in fade-in duration-300">
            <h1 className="text-3xl md:text-4xl font-serif font-bold text-[#36332E] mb-3">
              Doctor's PIN
            </h1>
            <p className="text-gray-500 text-sm mb-8">
              If your doctor gave you a 4-digit code, enter it below to link
              your accounts.
            </p>

            {error && (
              <div className="mb-6 p-4 rounded-2xl border border-red-100 bg-red-50 text-[#B86F68] text-sm font-medium">
                {error}
              </div>
            )}

            <input
              type="text"
              maxLength={4}
              value={cabinetCode}
              onChange={(e) => setCabinetCode(e.target.value)}
              placeholder="0000"
              className="w-full bg-[#F7F4EE] border border-[#EAE5D9] rounded-[24px] px-4 py-4 text-center text-3xl tracking-[0.5em] font-mono text-[#36332E] placeholder:text-gray-300 focus:outline-none focus:border-gray-300 transition-colors mb-8"
            />

            <button
              onClick={() => handleComplete("patient", !cabinetCode.trim())}
              disabled={loading}
              className="w-full bg-[#36332E] text-white rounded-[24px] py-4 font-bold text-[11px] tracking-widest uppercase hover:bg-black transition-colors disabled:opacity-40 mb-4"
            >
              {loading ? "Setting Up..." : "Finish Setup →"}
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => {
                  setCabinetCode("");
                  handleComplete("patient", true);
                }}
                disabled={loading}
                className="text-[11px] font-bold tracking-wide text-gray-400 hover:text-[#36332E] transition-colors py-2"
              >
                I don't have a code right now
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
