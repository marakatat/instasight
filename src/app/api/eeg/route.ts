import { NextRequest, NextResponse } from "next/server";
import { deviceStore } from "@/lib/device/deviceStore";
import { processRawEegBatch } from "@/lib/eeg/signalProcessing";

/**
 * POST /api/eeg
 * Bridge forwarding endpoint from Python bridge (simulating the phone).
 *
 * Payload:
 * {
 *   "deviceId": "esp32-eeg-01",
 *   "sessionId": "session-123",
 *   "sequence": 4,
 *   "deviceTimeMs": 8120,
 *   "sampleRate": 250,
 *   "samples": [0.18, 0.21, 0.19],
 *   "sampleCount": 3,
 *   "receivedAt": "2026-08-23T08:30:00Z"
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const deviceId = typeof body.deviceId === "string" ? body.deviceId.trim() : "esp32-eeg-01";
    const sequence = typeof body.sequence === "number" ? body.sequence : 1;
    const sessionId = body.sessionId || "demo-session";
    const samples = Array.isArray(body.samples) ? body.samples : [];

    if (samples.length === 0) {
      return NextResponse.json({ ok: true, message: "Empty samples batch ignored" });
    }

    // Process raw EEG batch into telemetry metrics and band powers
    const telemetry = processRawEegBatch(deviceId, sequence, samples, undefined, sessionId);

    // Update in-memory device state
    deviceStore.updateTelemetry(deviceId, telemetry);

    return NextResponse.json({
      ok: true,
      processed: true,
      deviceId,
      sessionId,
      sequence,
      sampleCount: samples.length,
    });
  } catch (error) {
    console.error("Error handling /api/eeg POST:", error);
    return NextResponse.json({ ok: false, error: "Failed to process EEG payload" }, { status: 500 });
  }
}
