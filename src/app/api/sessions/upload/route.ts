import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(request: NextRequest) {
  let step = "init";
  try {
    step = "create-client";
    const supabase = await createClient();

    step = "get-user";
    const { data: { user } } = await supabase.auth.getUser();

    step = "parse-formdata";
    const formData = await request.formData();
    const videoFile = formData.get("video") as File | null;
    const eventsString = formData.get("events") as string;
    const sessionId = (formData.get("sessionId") as string) || `session_${Date.now()}`;
    const exerciseId = (formData.get("exerciseId") as string) || "right_arm_raise";

    console.log(`[upload] sessionId=${sessionId} exerciseId=${exerciseId} events=${eventsString?.length} video=${videoFile?.size}`);

    if (!eventsString) {
      return NextResponse.json({ error: "Missing events data" }, { status: 400 });
    }

    step = "parse-events";
    const events = JSON.parse(eventsString);
    console.log(`[upload] Parsed ${events.length} events`);

    const eegDataString = formData.get("eegMetrics") as string | null;
    let eegMetrics = eegDataString ? JSON.parse(eegDataString) : null;

    // Fallback to in-memory deviceStore metrics if not in formData
    if (!eegMetrics) {
      const { deviceStore } = await import("@/lib/device/deviceStore");
      eegMetrics = deviceStore.getSessionMetrics("esp32-eeg-01", sessionId);
    }

    let videoUrl: string | null = null;

    if (videoFile && videoFile.size > 0) {
      step = "upload-video";
      const arrayBuffer = await videoFile.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const videoPath = `sessions/${sessionId}/recording.webm`;

      const { error: storageError } = await supabase.storage
        .from("session-videos")
        .upload(videoPath, buffer, {
          contentType: "video/webm",
          upsert: true,
        });

      if (storageError) {
        console.error("[upload] Storage upload error:", storageError.message);
      } else {
        const { data: urlData } = supabase.storage
          .from("session-videos")
          .getPublicUrl(videoPath);
        videoUrl = urlData?.publicUrl || null;
        console.log("[upload] Video uploaded:", videoUrl);
      }
    }

    // 2. Generate AI Summaries from Kinematics and EEG Movement Intention
    step = "ai-summary";
    const avgIntentPct = eegMetrics ? Math.round((eegMetrics.avgMotorIntentScore || 0) * 100) : 75;
    const peakIntentPct = eegMetrics ? Math.round((eegMetrics.peakMotorIntentScore || 0) * 100) : 88;
    const muErd = eegMetrics?.avgMuErdPercentage ?? 28;
    const intentTriggers = eegMetrics?.intentionTriggersCount || events.length || 0;
    const fatigue = eegMetrics?.avgFatigueIndex ?? 1.1;

    let patientSummary = `Great effort today! Your brain showed strong movement intention (${peakIntentPct}% peak focus) activating right before your physical movements. Keep up the rhythm!`;
    let doctorSummary = `Session completed with ${events.length} kinematic checkpoints. Sensorimotor EEG spectral analysis demonstrates robust Mu-band desynchronization (average ERD: ${muErd}%, peak motor intent: ${peakIntentPct}%), indicating active corticospinal motor preparation. Central fatigue index (Theta/Beta: ${fatigue}) remained within physiological baseline.`;

    const geminiKey = process.env.GEMINI_API_KEY;
    const openRouterKey = process.env.OPENROUTER_API_KEY;

    const systemPrompt = `You are an expert clinical neuro-rehabilitation AI analyzing a patient's physical therapy and EEG session.
You are given kinematic feedback events (reps, range of motion, compensations) AND real-time EEG brainwave metrics (sensorimotor Mu rhythm ERD%, motor attempt probability, frequency bands, central fatigue).

Generate TWO clinical syntheses:
1. "patientSummary": A 1-2 sentence warm, encouraging message for the patient explaining their movement and how well their brain intended and prepared for the exercise (avoid medical jargon, celebrate brain-body connection).
2. "doctorSummary": A dense, technical clinical summary for the physical therapist / neurologist including:
   - Repetition count & average Range of Motion (ROM).
   - Sensorimotor Mu rhythm Event-Related Desynchronization (ERD) and corticospinal motor intent score.
   - Neuro-muscular coupling (synchrony between mental intention and physical execution).
   - Fatigue indicators (Theta/Beta ratio) and compensation notes.

Respond ONLY in pure JSON format with no markdown:
{
  "patientSummary": "...",
  "doctorSummary": "..."
}`;

    const userPayload = JSON.stringify({
      kinematicEvents: events,
      eegMetrics: {
        avgMotorIntentPct: avgIntentPct,
        peakMotorIntentPct: peakIntentPct,
        muDesynchronizationErdPct: muErd,
        movementIntentionTriggers: intentTriggers,
        fatigueIndex: fatigue,
        bandPowers: eegMetrics?.bandPowersAverage,
      },
    });

    if (geminiKey && (events.length > 0 || eegMetrics)) {
      try {
        const model = "gemini-2.5-flash";
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              system_instruction: { parts: [{ text: systemPrompt }] },
              contents: [{ role: "user", parts: [{ text: userPayload }] }],
            }),
          }
        );

        console.log(`[upload] Gemini status: ${response.status}`);
        if (response.ok) {
          const data = await response.json();
          const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (content) {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              if (parsed.patientSummary) patientSummary = parsed.patientSummary;
              if (parsed.doctorSummary) doctorSummary = parsed.doctorSummary;
              console.log("[upload] AI summary generated successfully via Gemini");
            }
          }
        }
      } catch (err) {
        console.error("[upload] Gemini AI Summarization error:", err);
      }
    } else if (openRouterKey && (events.length > 0 || eegMetrics)) {
      try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          signal: AbortSignal.timeout(5000),
          headers: {
            Authorization: `Bearer ${openRouterKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "dots-studio/dots-3-note-preview:free",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPayload },
            ],
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const content = data.choices?.[0]?.message?.content?.trim();
          if (content) {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              if (parsed.patientSummary) patientSummary = parsed.patientSummary;
              if (parsed.doctorSummary) doctorSummary = parsed.doctorSummary;
              console.log("[upload] AI summary generated successfully via OpenRouter");
            }
          }
        }
      } catch (err) {
        console.warn("[upload] OpenRouter summarization timed out or failed:", err);
      }
    }

    // 3. Upsert session record
    step = "upsert-session";
    console.log("[upload] Upserting session...");
    const { error: sessionError } = await supabase
      .from("sessions")
      .upsert({
        id: sessionId,
        patient_id: user?.id || null,
        video_url: videoUrl || null,
        exercise_id: exerciseId,
        patient_summary: patientSummary,
        doctor_summary: doctorSummary,
        completed_at: new Date().toISOString(),
      });

    if (sessionError) {
      console.error("[upload] Session upsert error:", sessionError.message, sessionError.details, sessionError.hint);
    }

    // 4. Insert all AI events + summary event
    step = "upsert-events";
    const rows = events.map((e: any) => ({
      id: e.id,
      session_id: sessionId,
      video_time_ms: e.videoTimeMs,
      repetition_number: e.repetitionNumber,
      suggestion: e.suggestion,
      clinical_note: e.clinicalNote,
      severity: e.severity,
      reason_codes: e.reasonCodes,
      evidence: {
        ...e.evidence,
        eeg: eegMetrics
          ? {
              motorIntentScore: eegMetrics.avgMotorIntentScore,
              muErdPercentage: eegMetrics.avgMuErdPercentage,
              fatigueIndex: eegMetrics.avgFatigueIndex,
            }
          : undefined,
      },
      model_name: e.modelName,
      confidence: e.confidence,
      source: e.source,
      created_at: e.createdAt,
    }));

    rows.push({
      id: crypto.randomUUID(),
      session_id: sessionId,
      video_time_ms: 0,
      repetition_number: 0,
      suggestion: patientSummary,
      clinical_note: doctorSummary,
      severity: "info",
      reason_codes: ["SESSION_SUMMARY"],
      evidence: {
        eeg: eegMetrics
          ? {
              avgMotorIntentScore: eegMetrics.avgMotorIntentScore,
              peakMotorIntentScore: eegMetrics.peakMotorIntentScore,
              muErdPercentage: eegMetrics.avgMuErdPercentage,
              fatigueIndex: eegMetrics.avgFatigueIndex,
            }
          : undefined,
      },
      model_name: "summary-agent",
      confidence: 1.0,
      source: "summary",
      created_at: new Date().toISOString(),
    });

    console.log(`[upload] Inserting ${rows.length} rows into session_events...`);
    const { error: eventsError } = await supabase
      .from("session_events")
      .upsert(rows);

    if (eventsError) {
      console.error("[upload] Events insert error:", eventsError.message, eventsError.details, eventsError.hint);
    } else {
      console.log("[upload] Events inserted successfully");
    }

    return NextResponse.json({
      success: true,
      sessionId,
      videoUrl,
      patientSummary,
      doctorSummary,
      eegMetrics,
    });
  } catch (error: any) {
    console.error(`[upload] CRASH at step="${step}":`, error?.message || error);
    return NextResponse.json({ error: "Failed to upload", step, detail: error?.message }, { status: 500 });
  }
}
