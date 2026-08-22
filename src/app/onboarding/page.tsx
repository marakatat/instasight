"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { Stethoscope, User, ArrowRight, UserCircle, Key } from "@phosphor-icons/react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  
  // Form State
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<'doctor' | 'patient' | null>(null);
  const [cabinetCode, setCabinetCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleComplete() {
    setLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No user found");

      let updates: any = { 
        full_name: fullName,
        role: role 
      };

      if (role === 'doctor') {
        // Generate a random 4-digit PIN for the doctor
        updates.cabinet_code = Math.floor(1000 + Math.random() * 9000).toString();
      } else if (role === 'patient' && cabinetCode) {
        // Link patient to doctor
        const { data: doctor } = await supabase
          .from('profiles')
          .select('id')
          .eq('cabinet_code', cabinetCode)
          .single();
          
        if (doctor) {
          updates.doctor_id = doctor.id;
        } else {
          throw new Error("Invalid Doctor PIN. Please check the code and try again.");
        }
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id);

      if (updateError) throw updateError;

      if (role === 'doctor') {
        router.push('/doctor/dashboard');
      } else {
        router.push('/patient/session/demo123'); // Demo fallback
      }
    } catch (err: any) {
      console.error("Error completing onboarding:", err);
      setError(err.message || "Failed to complete setup.");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-[100dvh] bg-figma-base flex items-center justify-center p-6 md:p-12 selection:bg-figma-teal selection:text-white overflow-hidden">
      <div className="max-w-4xl w-full z-10 relative">
        <AnimatePresence mode="wait">
          
          {/* STEP 1: NAME */}
          {step === 1 && (
            <motion.div 
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-md mx-auto bg-white rounded-[2.5rem] p-10 border border-slate-200/50 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] text-center"
            >
              <div className="w-16 h-16 bg-zinc-50 border border-zinc-200 rounded-2xl flex items-center justify-center mx-auto mb-8">
                <UserCircle size={32} weight="duotone" className="text-figma-teal" />
              </div>
              <h1 className="text-3xl font-bold text-zinc-900 tracking-tight mb-2">Welcome!</h1>
              <p className="text-zinc-500 font-medium mb-8">What should we call you?</p>
              
              <input 
                type="text" 
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="First & Last Name"
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-4 px-4 text-center text-lg font-medium text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-figma-teal/50 focus:border-figma-teal transition-all mb-6"
              />

              <button 
                onClick={() => setStep(2)}
                disabled={fullName.trim().length < 2}
                className="w-full bg-zinc-900 hover:bg-black text-white rounded-xl py-4 font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                Continue <ArrowRight size={20} weight="bold" />
              </button>
            </motion.div>
          )}

          {/* STEP 2: ROLE */}
          {step === 2 && (
            <motion.div 
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <div className="text-center mb-12">
                <h1 className="text-4xl md:text-5xl font-bold text-zinc-900 tracking-tight mb-4">How will you use Telerehab?</h1>
                <p className="text-lg text-zinc-500 font-medium">Select your account type to personalize your experience.</p>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <button 
                  onClick={() => { setRole('patient'); setStep(3); }}
                  className="group bg-white rounded-[2.5rem] p-10 border border-slate-200/50 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.03)] hover:border-figma-teal/30 hover:shadow-lg transition-all duration-300 text-left"
                >
                  <div className="w-16 h-16 bg-figma-teal/10 rounded-2xl flex items-center justify-center mb-8 border border-figma-teal/20">
                    <User size={32} weight="duotone" className="text-figma-teal" />
                  </div>
                  <h2 className="text-2xl font-bold text-zinc-900 tracking-tight mb-3">I am a Patient</h2>
                  <p className="text-zinc-500 font-medium leading-relaxed mb-8">
                    Perform exercises at home with real-time AI feedback and share progress with your physical therapist.
                  </p>
                  <div className="flex items-center gap-2 text-figma-teal font-bold group-hover:translate-x-2 transition-transform">
                    Continue as Patient <ArrowRight size={20} weight="bold" />
                  </div>
                </button>

                <button 
                  onClick={() => { setRole('doctor'); handleComplete(); }}
                  className="group bg-zinc-950 rounded-[2.5rem] p-10 border border-zinc-900 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1)] hover:border-figma-vibrant/50 hover:shadow-lg hover:shadow-figma-vibrant/10 transition-all duration-300 text-left relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mb-8 border border-white/10 backdrop-blur-md relative z-10">
                    <Stethoscope size={32} weight="duotone" className="text-white" />
                  </div>
                  <h2 className="text-2xl font-bold text-white tracking-tight mb-3 relative z-10">I am a Doctor</h2>
                  <p className="text-zinc-400 font-medium leading-relaxed mb-8 relative z-10">
                    Review patient kinematics, view AI-assisted telemetry, and manage recovery programs remotely.
                  </p>
                  <div className="flex items-center gap-2 text-white font-bold group-hover:translate-x-2 transition-transform relative z-10">
                    Continue as Doctor <ArrowRight size={20} weight="bold" />
                  </div>
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 3: PATIENT PIN */}
          {step === 3 && role === 'patient' && (
            <motion.div 
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-md mx-auto bg-white rounded-[2.5rem] p-10 border border-slate-200/50 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] text-center"
            >
              <div className="w-16 h-16 bg-zinc-50 border border-zinc-200 rounded-2xl flex items-center justify-center mx-auto mb-8">
                <Key size={32} weight="duotone" className="text-zinc-600" />
              </div>
              <h1 className="text-3xl font-bold text-zinc-900 tracking-tight mb-2">Doctor's PIN</h1>
              <p className="text-zinc-500 font-medium mb-8">If your doctor gave you a 4-digit code, enter it below to link your accounts.</p>
              
              {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm font-medium">
                  ⚠️ {error}
                </div>
              )}

              <input 
                type="text" 
                maxLength={4}
                value={cabinetCode}
                onChange={e => setCabinetCode(e.target.value)}
                placeholder="e.g. 4829"
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-4 px-4 text-center text-3xl tracking-[1em] font-mono text-zinc-900 placeholder:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-figma-teal/50 focus:border-figma-teal transition-all mb-6"
              />

              <button 
                onClick={handleComplete}
                disabled={loading}
                className="w-full bg-zinc-900 hover:bg-black text-white rounded-xl py-4 font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50 mb-4"
              >
                {loading ? "Linking..." : "Complete Setup"} <ArrowRight size={20} weight="bold" />
              </button>
              
              <button 
                onClick={handleComplete}
                disabled={loading}
                className="text-sm font-bold text-zinc-400 hover:text-zinc-600 transition-colors"
              >
                I don't have a code right now
              </button>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </main>
  );
}
