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

    // 2. Generate AI Summaries from the events
    let patientSummary = "Great job today! Keep up the good work.";
    let doctorSummary = "Session complete. No significant deviations noted.";

    const apiKey = process.env.OPENROUTER_API_KEY;
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
              { role: "user", content: JSON.stringify({ events }) }
            ]
          })
        });

        if (response.ok) {
          const data = await response.json();
          const content = data.choices?.[0]?.message?.content?.trim();
          if (content) {
            const parsed = JSON.parse(content.replace(/^```json|```$/g, ''));
            if (parsed.patientSummary) patientSummary = parsed.patientSummary;
            if (parsed.doctorSummary) doctorSummary = parsed.doctorSummary;
          }
        }
      } catch (err) {
        console.warn("AI Summarization timed out or failed, using standard summary:", err);
      }
    }

    // 3. Upsert session record with summaries
    const { error: sessionError } = await supabase
      .from("sessions")
      .upsert({
        id: sessionId,
        patient_id: user?.id || null, // Link to patient if logged in
        video_url: videoUrl || null,
        exercise_id: "right_arm_raise",
        patient_summary: patientSummary,
        doctor_summary: doctorSummary,
        completed_at: new Date().toISOString(),
      });

    if (sessionError) console.error("Session upsert error:", sessionError);

    // 4. Insert all AI events
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
        evidence: e.evidence,
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

    return NextResponse.json({ success: true, sessionId, videoUrl, patientSummary });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Failed to upload" }, { status: 500 });
  }
}
