import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { clinicalBaselines } from "@/lib/ai/clinicalBaselines";
import type { AIFeedbackEvent } from "@/types/rehabilitation";

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
  eeg: z.object({
    signalQuality: z.number(),
    motorIntentScore: z.number()
  }).optional()
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = InputSchema.parse(body);

    const apiKey = process.env.OPENROUTER_API_KEY;

    // IF WE HAVE NO API KEY, USE THE MOCK RULE-BASED ENGINE FOR THE DEMO
    if (!apiKey) {
      console.warn("No OPENROUTER_API_KEY found. Falling back to rule-based mock AI.");
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

    // --- REAL AI LOGIC (OPENROUTER) ---

    // 1. Gather the "Doctor's Dataset" (Clinical Baselines)
    const targets = (clinicalBaselines as any)[input.exerciseId] || "No baseline available";

    // 2. Build Prompt
    const systemPrompt = `You are an AI exercise coach assistant for a physical therapist.
You will be given real-time measurements from a patient performing an exercise, along with the clinical targets.
Your job is to provide a brief, encouraging coaching suggestion for the patient.
DO NOT invent measurements. Only use the provided data.
Respond in pure JSON format matching this schema without markdown:
{
  "suggestion": "string (the spoken feedback, keep it under 2 sentences)",
  "severity": "info" | "warning" | "success",
  "reasonCodes": ["string array of what was wrong, e.g. RANGE_OF_MOTION_BELOW_TARGET", "MOVEMENT_TOO_FAST"]
}`;

    const userMessage = JSON.stringify({
      patientEvidence: input.pose,
      clinicalTargets: targets,
      mockEEG: input.eeg
    });

    // 3. Call OpenRouter
    const model = "dots-studio/dots-3-note-preview:free";
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data = await response.json();
    let aiResult;
    try {
      const content = data.choices[0].message.content.trim();
      aiResult = JSON.parse(content.replace(/^```json|```$/g, ''));
    } catch (e) {
      console.error("Failed to parse AI response:", data.choices[0].message.content);
      throw new Error("AI returned invalid JSON");
    }

    // 4. Construct Final Event
    const aiEvent: AIFeedbackEvent = {
      id: crypto.randomUUID(),
      sessionId: input.sessionId,
      videoTimeMs: input.videoTimeMs,
      createdAt: new Date().toISOString(),
      repetitionNumber: input.repetitionNumber,
      suggestion: aiResult.suggestion || "Good job.",
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

  } catch (error) {
    // On any failure (rate limit, parse error, etc) fall back to rule-based engine
    console.error("Evaluation Error (falling back to rules):", error);
    const fallback: AIFeedbackEvent = {
      id: crypto.randomUUID(),
      sessionId: "fallback",
      videoTimeMs: 0,
      createdAt: new Date().toISOString(),
      repetitionNumber: 1,
      suggestion: "Good effort! Keep your movements slow and controlled.",
      severity: "info",
      reasonCodes: ["FALLBACK_RULE_BASED"],
      evidence: { videoTimeMs: 0, repetitionNumber: 1, exercisePhase: "complete", poseConfidence: 0 },
      confidence: 0.7,
      modelName: "rule-based-fallback",
      modelVersion: "0.1.0",
      source: "rules",
      therapistReviewed: false
    };
    return NextResponse.json(fallback);
  }
}
