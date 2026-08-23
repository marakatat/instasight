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
    const sessionId = formData.get("sessionId") as string || `session_${Date.now()}`;
    const exerciseId = formData.get("exerciseId") as string || "unknown";

    console.log(`[upload] sessionId=${sessionId} exerciseId=${exerciseId} events=${eventsString?.length} video=${videoFile?.size}`);

    if (!eventsString) {
      return NextResponse.json({ error: "Missing events data" }, { status: 400 });
    }

    step = "parse-events";
    const events = JSON.parse(eventsString);
    console.log(`[upload] Parsed ${events.length} events`);

    let videoUrl = null;

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
        videoUrl = urlData?.publicUrl;
        console.log("[upload] Video uploaded:", videoUrl);
      }
    }

    // 2. Generate AI Summaries from the events
    step = "ai-summary";
    let patientSummary = "Great job today! Keep up the good work.";
    let doctorSummary = "Session complete. No significant deviations noted.";

    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey && events.length > 0) {
      const systemPrompt = `You are a clinical AI assistant analyzing a patient's physical therapy session.
You are given a list of feedback events recorded during the session (each containing range of motion, motor intent scores, suggestions, and clinical notes).
Generate TWO summaries:
1. "patientSummary": A 1-2 sentence encouraging summary for the patient (simple, warm, non-medical).
2. "doctorSummary": A dense, technical clinical note for the physical therapist summarizing the session's overall performance, average range of motion, fatigue indicators, and specific joint compensations if any.

Respond ONLY in pure JSON format:
{
  "patientSummary": "...",
  "doctorSummary": "..."
}`;

      try {
        const model = "gemini-3.5-flash-lite";
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: "user", parts: [{ text: JSON.stringify({ events }) }] }]
          })
        });

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
              console.log("[upload] AI summary generated successfully");
            }
          } else {
            console.warn("[upload] Gemini returned no content:", JSON.stringify(data));
          }
        } else {
          const errBody = await response.text();
          console.warn("[upload] Gemini error response:", errBody);
        }
      } catch (err) {
        console.error("[upload] AI Summarization failed:", err);
      }
    } else {
      console.log(`[upload] Skipping AI summary: apiKey=${!!apiKey} events=${events.length}`);
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
        completed_at: new Date().toISOString(),
      });

    if (sessionError) {
      console.error("[upload] Session upsert error:", sessionError.message, sessionError.details, sessionError.hint);
      // Don't throw — continue to try saving events
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
      evidence: e.evidence,
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
      evidence: {},
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

    return NextResponse.json({ success: true, sessionId, videoUrl, patientSummary });
  } catch (error: any) {
    console.error(`[upload] CRASH at step="${step}":`, error?.message || error);
    return NextResponse.json({ error: "Failed to upload", step, detail: error?.message }, { status: 500 });
  }
}
