"use client";

import { useState, useRef, useCallback } from "react";
import { CameraPoseView } from "./CameraPoseView";
import type { AIFeedbackEvent, PoseMetrics } from "@/types/rehabilitation";
import { CheckCircle, Heartbeat, VideoCamera, ShieldCheck, PlayCircle, StopCircle, ArrowRight, Waveform, Brain } from "@phosphor-icons/react/dist/ssr";
import { speak } from "@/lib/voice/speak";
import { useEegStream } from "@/lib/eeg/useEegStream";

type SessionState = 'setup' | 'active' | 'processing' | 'complete';

export function ExerciseSession() {
  const [sessionState, setSessionState] = useState<SessionState>('setup');
  const [uploadStatus, setUploadStatus] = useState("Saving session...");
  const [sessionUrl, setSessionUrl] = useState<string | null>(null);
  const [patientSummary, setPatientSummary] = useState<string | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [liveFeedback, setLiveFeedback] = useState<{ suggestion: string; severity: string } | null>(null);
  const [currentMetrics, setCurrentMetrics] = useState<PoseMetrics | null>(null);

  const liveFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiEventsRef = useRef<AIFeedbackEvent[]>([]);
  const pendingAICallsRef = useRef<Promise<void>[]>([]);
  const aiCallCountRef = useRef(0);
  const sessionIdRef = useRef<string>(`session_${Date.now()}`);
  const AI_CALL_LIMIT = 5;

  // Real-time EEG telemetry stream via Next.js HTTP API polling & fallback simulator
  const { telemetry, isHardwareOnline, startStream, stopStream } = useEegStream({
    deviceId: "esp32-demo-01",
    pollIntervalMs: 150,
  });

  const handleStart = () => {
    aiEventsRef.current = [];
    pendingAICallsRef.current = [];
    aiCallCountRef.current = 0;
    const newSessionId = `session_${Date.now()}`;
    sessionIdRef.current = newSessionId;
    setSessionUrl(null);
    setSessionState('active');
    
    startStream(newSessionId);
    speak("Starting the exercise. Move slowly.");
  };

  const handleStop = () => {
    setSessionState('processing');
    setUploadStatus("Processing video and saving results...");
    stopStream();
    speak("Exercise stopped. Saving results.");
  };

  const handleRecordingComplete = async (blob: Blob) => {
    setUploadStatus(`Saving ${pendingAICallsRef.current.length} feedback notes...`);
    await Promise.allSettled(pendingAICallsRef.current);

    setUploadStatus("Uploading session to dashboard...");

    const formData = new FormData();
    formData.append("video", blob, "recording.webm");
    formData.append("events", JSON.stringify(aiEventsRef.current));
    formData.append("sessionId", sessionIdRef.current);

    try {
      const res = await fetch("/api/sessions/upload", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const result = await res.json();
        const sid = result.sessionId || sessionIdRef.current;
        setSessionUrl(`/doctor/sessions/${sid}`);
        if (result.patientSummary) setPatientSummary(result.patientSummary);
        setSessionState('complete');
      } else {
        setUploadStatus("❌ Failed to upload session.");
      }
    } catch (e) {
      console.error(e);
      setUploadStatus("❌ Error uploading session.");
    }
  };

  const handleAIEvent = useCallback((event: AIFeedbackEvent) => {
    aiEventsRef.current.push(event);
    setLiveFeedback({ suggestion: event.suggestion, severity: event.severity });
    if (liveFeedbackTimerRef.current) clearTimeout(liveFeedbackTimerRef.current);
    liveFeedbackTimerRef.current = setTimeout(() => setLiveFeedback(null), 8000);
  }, []);

  const handleAIPromise = useCallback((promise: Promise<void>) => {
    pendingAICallsRef.current.push(promise);
  }, []);

  const shouldTriggerAI = useCallback(() => {
    aiCallCountRef.current += 1;
    return aiCallCountRef.current <= AI_CALL_LIMIT;
  }, []);

  const motorIntentPct = Math.round((telemetry?.motorAttemptProbability ?? 0) * 100);

  return (
    <div className="min-h-[100dvh] bg-black text-white selection:bg-figma-teal overflow-hidden flex flex-col font-sans relative">
      
      {/* Immersive Camera Layer */}
      <div className={`absolute inset-0 transition-all duration-1000 ${sessionState !== 'active' ? 'opacity-40 blur-2xl scale-105' : 'opacity-100 scale-100'}`}>
        <CameraPoseView 
          isRecording={sessionState === 'active'} 
          onRecordingComplete={handleRecordingComplete}
          onAIEvent={handleAIEvent}
          onAIPromise={handleAIPromise}
          shouldTriggerAI={shouldTriggerAI}
          onLoaded={() => setIsCameraReady(true)}
          liveFeedback={liveFeedback}
          onMetricsUpdate={setCurrentMetrics}
          eegTelemetry={telemetry}
          sessionId={sessionIdRef.current}
        />
      </div>

      {/* Bento Grid HUD Overlay */}
      <div className="absolute inset-0 z-10 w-full h-full p-6 lg:p-10 flex flex-col justify-between pointer-events-none">
        
        {/* TOP ROW */}
        <div className="flex justify-between items-start w-full">
          {/* Top Left: Header Bento */}
          <div className="bg-black/40 backdrop-blur-3xl border border-white/10 rounded-3xl p-5 flex items-center gap-5 shadow-2xl pointer-events-auto transition-transform">
             <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center border border-white/20">
               <Heartbeat size={24} weight="duotone" className="text-white" />
             </div>
             <div>
               <h1 className="text-xl font-bold tracking-tight text-white m-0 leading-none">Right Arm Raise</h1>
               <div className="flex items-center gap-3 mt-2">
                 <div className="flex items-center gap-1.5">
                   <div className={`w-2 h-2 rounded-full ${isCameraReady ? 'bg-figma-teal shadow-[0_0_10px_rgba(42,157,143,0.8)]' : 'bg-figma-mustard animate-pulse'}`} />
                   <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest m-0 leading-none">
                     {isCameraReady ? "Camera" : "Initializing"}
                   </p>
                 </div>
                 <div className="w-px h-3 bg-white/20" />
                 <div className="flex items-center gap-1.5">
                   <div className={`w-2 h-2 rounded-full ${isHardwareOnline ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]' : 'bg-indigo-400 animate-pulse'}`} />
                   <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest m-0 leading-none">
                     {isHardwareOnline ? "ESP32 Linked" : "Simulation"}
                   </p>
                 </div>
               </div>
             </div>
          </div>
        </div>

        {/* CENTER OVERLAYS */}
        <div className="flex-1 flex flex-col items-center justify-center w-full">
          {/* Setup State */}
          {sessionState === 'setup' && isCameraReady && (
            <div className="bg-black/40 backdrop-blur-3xl p-10 rounded-[3rem] border border-white/10 shadow-2xl text-center max-w-lg pointer-events-auto animate-in fade-in zoom-in duration-500">
              <div className="w-20 h-20 bg-white/10 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-white/20">
                <VideoCamera size={40} weight="duotone" className="text-white" />
              </div>
              <h2 className="text-3xl font-bold mb-4 text-white">Camera Setup</h2>
              <p className="text-zinc-400 font-medium leading-relaxed mb-8">
                Please sit upright and ensure your upper body is fully visible in the frame. The camera will track your form.
              </p>
              <button 
                onClick={handleStart}
                className="w-full py-5 bg-white text-black font-bold text-lg rounded-2xl hover:bg-zinc-200 transition-transform active:scale-95 shadow-[0_0_40px_rgba(255,255,255,0.2)] flex items-center justify-center gap-2"
              >
                <PlayCircle size={28} weight="fill" />
                Start Workout
              </button>
            </div>
          )}

          {/* Processing State */}
          {sessionState === 'processing' && (
            <div className="bg-black/40 backdrop-blur-3xl p-10 rounded-[3rem] border border-white/10 shadow-2xl text-center max-w-lg w-full pointer-events-auto animate-in fade-in zoom-in duration-500">
              <div className="w-16 h-16 border-4 border-figma-teal border-t-transparent rounded-full animate-spin mx-auto mb-8" />
              <h2 className="text-2xl font-bold mb-2 text-white">Analyzing Session</h2>
              <p className="text-zinc-400 font-medium">{uploadStatus}</p>
            </div>
          )}

          {/* Complete State */}
          {sessionState === 'complete' && sessionUrl && (
            <div className="bg-black/40 backdrop-blur-3xl p-12 rounded-[3rem] border border-white/10 shadow-2xl text-center max-w-xl w-full flex flex-col items-center pointer-events-auto animate-in fade-in zoom-in duration-500">
              <div className="w-24 h-24 bg-figma-teal/20 rounded-[2.5rem] flex items-center justify-center mb-8 border border-figma-teal/30">
                <CheckCircle size={48} weight="fill" className="text-figma-teal" />
              </div>
              <h2 className="text-4xl font-bold mb-4 text-white">Session Complete</h2>
              <p className="text-lg text-zinc-400 font-medium leading-relaxed mb-6">
                Session saved. Your doctor will review the results.
              </p>
              
              {patientSummary && (
                <div className="bg-white/10 p-6 rounded-3xl mb-8 border border-white/20 w-full shadow-inner">
                  <p className="text-white text-lg font-medium leading-relaxed">"{patientSummary}"</p>
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4 w-full mb-10">
                <div className="bg-white/5 p-6 rounded-3xl border border-white/10 flex flex-col items-center justify-center">
                  <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Reps Completed</p>
                  <p className="text-4xl font-bold text-white">{currentMetrics?.repetition || aiEventsRef.current.length || 0}</p>
                </div>
                <div className="bg-white/5 p-6 rounded-3xl border border-white/10 flex flex-col items-center justify-center">
                  <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Feedback Notes</p>
                  <p className="text-4xl font-bold text-figma-teal">{aiEventsRef.current.length}</p>
                </div>
              </div>

              <a
                href={sessionUrl}
                target="_blank"
                className="w-full py-5 bg-figma-teal text-white font-bold text-lg rounded-2xl hover:bg-teal-500 transition-transform active:scale-95 shadow-[0_0_30px_rgba(42,157,143,0.3)] flex items-center justify-center gap-2"
              >
                View Session Details <ArrowRight size={24} weight="bold" />
              </a>
            </div>
          )}
        </div>

        {/* BOTTOM ROW */}
        <div className="flex justify-between items-end w-full gap-6">
          {sessionState === 'active' ? (
            <>
              {/* Bottom Left: Telemetry Bento */}
              <div className="bg-black/40 backdrop-blur-3xl p-6 rounded-[2rem] border border-white/10 shadow-2xl flex gap-8 pointer-events-auto animate-in slide-in-from-bottom-10 duration-500">
                <div className="flex flex-col min-w-[80px]">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                    <Heartbeat size={14} /> Phase
                  </span>
                  <span className="text-2xl font-bold capitalize text-white">{currentMetrics?.phase || 'Idle'}</span>
                </div>
                <div className="w-px bg-white/10" />
                <div className="flex flex-col min-w-[80px]">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                    <ShieldCheck size={14} /> ROM
                  </span>
                  <span className="text-2xl font-bold text-figma-teal">{Math.round(currentMetrics?.rangeOfMotion || 0)}°</span>
                </div>
                <div className="w-px bg-white/10" />
                <div className="flex flex-col min-w-[80px]">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                    <Heartbeat size={14} /> Reps
                  </span>
                  <span className="text-2xl font-bold text-white">{currentMetrics?.repetition || 0}</span>
                </div>
                <div className="w-px bg-white/10" />
                {/* EEG Integration */}
                <div className="flex flex-col min-w-[80px]">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                    <Brain size={14} /> Intent
                  </span>
                  <span className={`text-2xl font-bold ${motorIntentPct >= 65 ? "text-teal-400" : "text-amber-400"}`}>
                    {motorIntentPct}%
                  </span>
                </div>
              </div>

              {/* Bottom Right: Controls Bento */}
              <div className="bg-black/40 backdrop-blur-3xl p-4 rounded-[2rem] border border-white/10 shadow-2xl flex items-center gap-3 pointer-events-auto animate-in slide-in-from-bottom-10 duration-500">
                <button 
                  onClick={() => speak("Lift your arm slowly until it is comfortable.")}
                  className="w-14 h-14 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl flex items-center justify-center transition-colors text-white"
                  title="Repeat Instruction"
                >
                  <Waveform size={24} weight="duotone" />
                </button>
                <button 
                  onClick={handleStop}
                  className="px-8 h-14 bg-white text-black font-bold rounded-2xl hover:bg-zinc-200 transition-transform active:scale-95 flex items-center gap-2 text-lg shadow-[0_0_20px_rgba(255,255,255,0.2)]"
                >
                  <StopCircle size={24} weight="fill" />
                  Finish
                </button>
              </div>
            </>
          ) : (
            <div className="w-full flex justify-end">
              {/* Optional footer elements for non-active states */}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
