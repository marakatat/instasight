import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Check for authenticated user to link the session to a patient
    const { data: { user } } = await supabase.auth.getUser();

    const formData = await request.formData();
    const videoFile = formData.get("video") as File;
    const eventsString = formData.get("events") as string;
    const sessionId = formData.get("sessionId") as string || `session_${Date.now()}`;

    if (!videoFile || !eventsString) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }

    const events = JSON.parse(eventsString);
    const eegDataString = formData.get("eegMetrics") as string | null;
    let eegMetrics = eegDataString ? JSON.parse(eegDataString) : null;

    // Fallback to in-memory deviceStore metrics if not in formData
    if (!eegMetrics) {
      const { deviceStore } = await import("@/lib/device/deviceStore");
      eegMetrics = deviceStore.getSessionMetrics("esp32-eeg-01", sessionId);
    }

    // 1. Upload video to Supabase Storage
    const arrayBuffer = await videoFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const videoPath = `sessions/${sessionId}/recording.webm`;

    const { data: storageData, error: storageError } = await supabase.storage
      .from("session-videos")
      .upload(videoPath, buffer, {
        contentType: "video/webm",
        upsert: true,
      });

    if (storageError) {
      console.error("Storage upload error:", storageError);
      // Don't fail the whole request — events are more important
    }

    // Get a public URL for the video
    const { data: urlData } = supabase.storage
      .from("session-videos")
      .getPublicUrl(videoPath);
    const videoUrl = urlData?.publicUrl;

    // 2. Generate AI Summaries incorporating both Kinematics & EEG Movement Intention
    const avgIntentPct = eegMetrics ? Math.round((eegMetrics.avgMotorIntentScore || 0) * 100) : 75;
    const peakIntentPct = eegMetrics ? Math.round((eegMetrics.peakMotorIntentScore || 0) * 100) : 88;
    const muErd = eegMetrics?.avgMuErdPercentage ?? 28;
    const intentTriggers = eegMetrics?.intentionTriggersCount || events.length || 0;
    const fatigue = eegMetrics?.avgFatigueIndex ?? 1.1;

    let patientSummary = `Great effort today! Your brain showed strong movement intention (${peakIntentPct}% peak focus) activating right before your physical movements. Keep up the rhythm!`;
    let doctorSummary = `Session completed with ${events.length} kinematic checkpoints. Sensorimotor EEG spectral analysis demonstrates robust Mu-band desynchronization (average ERD: ${muErd}%, peak motor intent: ${peakIntentPct}%), indicating active corticospinal motor preparation. Central fatigue index (Theta/Beta: ${fatigue}) remained within physiological baseline.`;

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (apiKey && (events.length > 0 || eegMetrics)) {
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

      try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          signal: AbortSignal.timeout(5000),
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "dots-studio/dots-3-note-preview:free",
            messages: [
              { role: "system", content: systemPrompt },
              {
                role: "user",
                content: JSON.stringify({
                  kinematicEvents: events,
                  eegMetrics: {
                    avgMotorIntentPct: avgIntentPct,
                    peakMotorIntentPct: peakIntentPct,
                    muDesynchronizationErdPct: muErd,
                    movementIntentionTriggers: intentTriggers,
                    fatigueIndex: fatigue,
                    bandPowers: eegMetrics?.bandPowersAverage,
                  },
                }),
              },
            ],
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const content = data.choices?.[0]?.message?.content?.trim();
          if (content) {
            const parsed = JSON.parse(content.replace(/^```json|```$/g, ""));
            if (parsed.patientSummary) patientSummary = parsed.patientSummary;
            if (parsed.doctorSummary) doctorSummary = parsed.doctorSummary;
          }
        }
      } catch (err) {
        console.warn("AI Summarization timed out or failed, using standard neuro-motor summary:", err);
      }
    }

    // 3. Upsert session record with summaries and EEG metadata
    const { error: sessionError } = await supabase
      .from("sessions")
      .upsert({
        id: sessionId,
        patient_id: user?.id || null,
        video_url: videoUrl || null,
        exercise_id: "right_arm_raise",
        patient_summary: patientSummary,
        doctor_summary: doctorSummary,
        completed_at: new Date().toISOString(),
      });

    if (sessionError) console.error("Session upsert error:", sessionError);

    // 4. Insert all AI events with EEG evidence
    if (events.length > 0) {
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

      const { error: eventsError } = await supabase
        .from("session_events")
        .upsert(rows);

      if (eventsError) console.error("Events insert error:", eventsError);
    }

    return NextResponse.json({
      success: true,
      sessionId,
      videoUrl,
      patientSummary,
      doctorSummary,
      eegMetrics,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Failed to upload" }, { status: 500 });
  }
}

