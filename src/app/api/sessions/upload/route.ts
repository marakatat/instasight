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

    // 2. Upsert session record
    const { error: sessionError } = await supabase
      .from("sessions")
      .upsert({
        id: sessionId,
        patient_id: user?.id || null, // Link to patient if logged in
        video_url: videoUrl || null,
        exercise_id: "right_arm_raise",
        completed_at: new Date().toISOString(),
      });

    if (sessionError) console.error("Session upsert error:", sessionError);

    // 3. Insert all AI events
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

    return NextResponse.json({ success: true, sessionId, videoUrl });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Failed to upload" }, { status: 500 });
  }
}
