import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import derivedBaselines from "@/lib/ai/derivedBaselines.json";
import type { AIFeedbackEvent } from "@/types/rehabilitation";
import { RateLimiter } from "@/lib/rate-limit";

// Allow 5 AI requests per minute per IP for demo purposes
const aiRateLimiter = new RateLimiter(60000, 30);

const InputSchema = z.object({
  sessionId: z.string(),
  videoTimeMs: z.number(),
  repetitionNumber: z.number(),
  exerciseId: z.string(),
  pose: z.object({
    shoulderAngle: z.number().optional(),
    elbowAngle: z.number().optional(),
    movementDurationMs: z.number().optional(),
    rangeOfMotion: z.number().optional(),
    poseConfidence: z.number()
  }),
  eeg: z.any().optional().nullable()
});

export async function POST(request: NextRequest) {
  let input: any = null;
  try {
    // 1. Rate Limiting Check
    const ip = request.headers.get("x-forwarded-for") || "unknown-ip";
    const limitStatus = aiRateLimiter.limit(ip);
    
    if (!limitStatus.success) {
      console.warn(`Rate limit exceeded for IP: ${ip}`);
      throw new Error("RATE_LIMIT_EXCEEDED");
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      console.error("Failed to parse request JSON");
      throw new Error("INVALID_JSON");
    }
    
    try {
      input = InputSchema.parse(body);
    } catch (validationError) {
      console.error("Zod Validation Error:", validationError);
      // We must preserve the raw input values for the fallback if validation fails
      input = body; 
      throw new Error("VALIDATION_ERROR");
    }

    const apiKey = process.env.GEMINI_API_KEY;

    // IF WE HAVE NO API KEY, USE THE MOCK RULE-BASED ENGINE FOR THE DEMO
    if (!apiKey) {
      console.warn("No GEMINI_API_KEY found. Falling back to rule-based mock AI.");
      const reasons: string[] = [];
      let suggestion = "Good movement. Continue.";
      let severity: "info" | "warning" | "success" = "success";

      if (input.pose.movementDurationMs && input.pose.movementDurationMs < 2000) {
        reasons.push("MOVEMENT_TOO_FAST");
        suggestion = "Try to move more slowly.";
        severity = "warning";
      }

      if (input.pose.rangeOfMotion && input.pose.rangeOfMotion < 70) {
        reasons.push("RANGE_OF_MOTION_BELOW_TARGET");
        suggestion = "Good effort. Try to move slightly farther, if comfortable.";
        severity = "warning";
      }

      if (input.pose.poseConfidence < 0.5) {
        reasons.push("LOW_CAMERA_CONFIDENCE");
        suggestion = "Please move into the center of the camera view.";
        severity = "info";
      }

      const mockEvent: AIFeedbackEvent = {
        id: crypto.randomUUID(),
        sessionId: input.sessionId,
        videoTimeMs: input.videoTimeMs,
        createdAt: new Date().toISOString(),
        repetitionNumber: input.repetitionNumber,
        suggestion,
        severity,
        reasonCodes: reasons,
        evidence: {
          videoTimeMs: input.videoTimeMs,
          repetitionNumber: input.repetitionNumber,
          exercisePhase: "complete", // simplified
          ...input.pose
        },
        confidence: 0.86,
        modelName: "exercise-coach-demo",
        modelVersion: "0.1.0",
        source: "rules",
        therapistReviewed: false
      };
      
      return NextResponse.json(mockEvent);
    }

    // --- REAL AI LOGIC ---

    // 1. Gather the "Doctor's Dataset" (Statistically-derived from real patient recordings)
    // Map exercise IDs to dataset keys
    const exerciseKeyMap: Record<string, string> = {
      "right_arm_raise": "arm_raise",
      "left_arm_raise":  "arm_raise",
      "arm_raise":       "arm_raise",
      "knee_extension":  "knee_extension",
      "sit_to_stand":    "sit_to_stand",
      "squat":           "sit_to_stand", // closest dataset proxy
    };
    const datasetKey = exerciseKeyMap[input.exerciseId] || "arm_raise";
    const datasetBaseline = (derivedBaselines as any)[datasetKey];

    // 2. Build Prompt — inject full statistical context from real CSV data
    const systemPrompt = `You are an AI exercise coach embedded in a physical therapy remote rehabilitation platform.
You have access to REAL clinical population data derived from ${datasetBaseline?.correct_form ? Object.values(datasetBaseline.correct_form)[0] : {n:0}}+ patient recordings.

Your job is to compare the LIVE patient measurements against population-derived baselines and generate feedback.

Dataset-derived baselines for exercise "${datasetKey}":
${JSON.stringify(datasetBaseline, null, 2)}

Interpretation guide:
- "correct_form" = statistical distribution of CORRECT repetitions from the dataset
- "incorrect_form" = statistical distribution of INCORRECT repetitions from the dataset  
- p50 = median correct value, p25/p75 = interquartile range, p5/p95 = extreme bounds
- If patient's measured angle is below p25 of correct_form or similar to incorrect_form distribution, flag it

Generate these 4 fields:
1. "suggestion": A SHORT warm coaching cue for the patient to hear ALOUD (max 1 sentence, no numbers/jargon). Example: "Great job—try to raise your arm just a little higher."
2. "clinicalNote": A DENSE technical note for the doctor. Include: measured value, comparison to dataset p25/p50/p75, deviation from correct-form median, whether it resembles correct or incorrect population distribution, and clinical recommendation.
3. "severity": "success" if within correct-form IQR, "warning" if below p25 or resembling incorrect distribution, "info" otherwise
4. "reasonCodes": array of strings like ["ROM_BELOW_DATASET_P25", "ELBOW_FLEXION_MATCHES_INCORRECT_DISTRIBUTION"]

Respond ONLY in pure JSON, no markdown:
{
  "suggestion": "...",
  "clinicalNote": "...",
  "severity": "info" | "warning" | "success",
  "reasonCodes": ["..."]
}`;

    const userMessage = JSON.stringify({
      live_patient_measurements: input.pose,
      repetition_number: input.repetitionNumber,
    });

    // 3. Call Gemini API
    const model = "gemini-3.5-flash-lite";
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [
          { role: "user", parts: [{ text: userMessage }] }
        ]
      }),
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    let aiResult;
    try {
      const content = data.candidates[0].content.parts[0].text;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON object found in response");
      aiResult = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error("Failed to parse AI response:", data.candidates?.[0]?.content?.parts?.[0]?.text || data);
      throw new Error("AI returned invalid JSON");
    }

    // 4. Construct Final Event
    const aiEvent: AIFeedbackEvent = {
      id: crypto.randomUUID(),
      sessionId: input.sessionId,
      videoTimeMs: input.videoTimeMs,
      createdAt: new Date().toISOString(),
      repetitionNumber: input.repetitionNumber,
      suggestion: aiResult.suggestion || "Good job, keep it up.",
      clinicalNote: aiResult.clinicalNote || undefined,
      severity: aiResult.severity || "info",
      reasonCodes: aiResult.reasonCodes || [],
      evidence: {
        videoTimeMs: input.videoTimeMs,
        repetitionNumber: input.repetitionNumber,
        exercisePhase: "complete",
        ...input.pose
      },
      confidence: 0.95, // We'd ideally get this from logprobs
      modelName: model,
      modelVersion: "1.0",
      source: "ai",
      therapistReviewed: false
    };

    return NextResponse.json(aiEvent);

  } catch (error: any) {
    if (error.message === "RATE_LIMIT_EXCEEDED") {
      return NextResponse.json({ error: "Rate limit exceeded. Please wait." }, { status: 429 });
    }

    // On any failure (parse error, OpenRouter error, etc) fall back to rule-based engine
    console.error("Evaluation Error (falling back to rules):", error);
    const fallback: AIFeedbackEvent = {
      id: crypto.randomUUID(),
      sessionId: input?.sessionId || "fallback",
      videoTimeMs: input?.videoTimeMs || 0,
      createdAt: new Date().toISOString(),
      repetitionNumber: input?.repetitionNumber || 1,
      suggestion: "Good effort! Keep your movements slow and controlled.",
      clinicalNote: "Fallback rule-based response. AI service temporarily unavailable or timed out.",
      severity: "info",
      reasonCodes: ["FALLBACK_RULE_BASED"],
      evidence: { 
        videoTimeMs: input?.videoTimeMs || 0, 
        repetitionNumber: input?.repetitionNumber || 1, 
        exercisePhase: "complete", 
        ...(input?.pose || { poseConfidence: 0 })
      },
      confidence: 0.7,
      modelName: "rule-based-fallback",
      modelVersion: "0.1.0",
      source: "rules",
      therapistReviewed: false
    };
    return NextResponse.json(fallback);
  }
}
