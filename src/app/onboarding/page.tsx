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

  const totalSteps = 3;

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

      if (updateError) throw updateError;

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
      <main className="min-h-[100dvh] bg-black flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-white border-t-transparent animate-spin" />
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-black flex items-center justify-center px-6 md:px-12">
      <div className="max-w-2xl w-full">

        {/* ── Step indicator ── */}
        <div className="mb-12 flex items-center gap-4">
          <span className="text-xs font-mono tracking-[0.2em] text-white/40">
            {String(step).padStart(2, "0")} / {String(totalSteps).padStart(2, "0")}
          </span>
          <div className="flex-1 h-px bg-white/10 relative">
            <div
              className="absolute top-0 left-0 h-px bg-white transition-all duration-500"
              style={{ width: `${(step / totalSteps) * 100}%` }}
            />
          </div>
        </div>

        {/* ── STEP 1: NAME ── */}
        {step === 1 && (
          <div className="animate-in fade-in duration-300">
            <h1 className="text-4xl md:text-5xl font-serif font-bold text-white mb-3">
              Welcome
            </h1>
            <p className="text-white/40 text-sm mb-10">
              What should we call you?
            </p>

            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="First & Last Name"
              className="w-full bg-transparent border border-white/15 px-4 py-4 text-white text-lg placeholder:text-white/20 focus:outline-none focus:border-white/50 transition-colors mb-8"
            />

            <button
              onClick={() => setStep(2)}
              disabled={fullName.trim().length < 2}
              suppressHydrationWarning
              className="w-full bg-white text-black py-4 font-bold text-sm tracking-wide hover:bg-white/90 transition-colors disabled:opacity-30"
            >
              CONTINUE →
            </button>
          </div>
        )}

        {/* ── STEP 2: ROLE ── */}
        {step === 2 && (
          <div className="animate-in fade-in duration-300">
            <h1 className="text-4xl md:text-5xl font-serif font-bold text-white mb-3">
              Your Role
            </h1>
            <p className="text-white/40 text-sm mb-12">
              Select your account type to personalize your experience.
            </p>

            <div className="grid md:grid-cols-2 gap-px bg-white/10">
              <button
                onClick={() => {
                  setRole("patient");
                  setStep(3);
                }}
                className="group bg-black p-8 md:p-10 text-left hover:bg-white hover:text-black transition-all duration-300 border border-white/10"
              >
                <span className="text-xs font-mono tracking-[0.2em] uppercase text-white/40 group-hover:text-black/40 transition-colors">
                  Patient
                </span>
                <h2 className="text-2xl font-serif mt-4 group-hover:text-black transition-colors">
                  I am a Patient
                </h2>
                <p className="text-sm text-white/40 group-hover:text-black/60 mt-3 leading-relaxed transition-colors">
                  Perform exercises at home with real-time AI feedback and share
                  progress with your physical therapist.
                </p>
                <span className="inline-block mt-6 text-sm text-white/50 group-hover:text-black group-hover:translate-x-1 transition-all">
                  Continue →
                </span>
              </button>

              <button
                onClick={() => {
                  setRole("doctor");
                  handleComplete("doctor", true);
                }}
                className="group bg-white text-black p-8 md:p-10 text-left hover:bg-black hover:text-white transition-all duration-300 border border-white/10"
              >
                <span className="text-xs font-mono tracking-[0.2em] uppercase text-black/40 group-hover:text-white/40 transition-colors">
                  Clinician
                </span>
                <h2 className="text-2xl font-serif mt-4 group-hover:text-white transition-colors">
                  I am a Doctor
                </h2>
                <p className="text-sm text-black/60 group-hover:text-white/40 mt-3 leading-relaxed transition-colors">
                  Review patient kinematics, view AI-assisted telemetry, and
                  manage recovery programs remotely.
                </p>
                <span className="inline-block mt-6 text-sm text-black/50 group-hover:text-white group-hover:translate-x-1 transition-all">
                  {loading ? "Setting up..." : "Continue →"}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: PATIENT PIN ── */}
        {step === 3 && role === "patient" && (
          <div className="animate-in fade-in duration-300">
            <h1 className="text-4xl md:text-5xl font-serif font-bold text-white mb-3">
              Doctor's PIN
            </h1>
            <p className="text-white/40 text-sm mb-10">
              If your doctor gave you a 4-digit code, enter it below to link
              your accounts.
            </p>

            {error && (
              <div className="mb-6 p-4 border border-white/20 bg-white/5 text-white text-sm">
                {error}
              </div>
            )}

            <input
              type="text"
              maxLength={4}
              value={cabinetCode}
              onChange={(e) => setCabinetCode(e.target.value)}
              placeholder="0000"
              className="w-full bg-transparent border border-white/15 px-4 py-4 text-center text-3xl tracking-[1em] font-mono text-white placeholder:text-white/15 focus:outline-none focus:border-white/50 transition-colors mb-8"
            />

            <button
              onClick={() => handleComplete("patient", false)}
              disabled={loading}
              className="w-full bg-white text-black py-4 font-bold text-sm tracking-wide hover:bg-white/90 transition-colors disabled:opacity-40 mb-4"
            >
              {loading ? "LINKING..." : "COMPLETE SETUP →"}
            </button>

            <button
              type="button"
              onClick={() => handleComplete("patient", true)}
              disabled={loading}
              className="w-full text-sm text-white/30 hover:text-white/60 transition-colors py-2"
            >
              I don't have a code right now
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
