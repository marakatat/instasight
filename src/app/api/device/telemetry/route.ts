import { NextRequest, NextResponse } from "next/server";
import { deviceStore } from "@/lib/device/deviceStore";
import { processRawEegBatch } from "@/lib/eeg/signalProcessing";
import { EegTelemetry } from "@/lib/eeg/useEegStream";

/**
 * POST /api/device/telemetry
 * Called by ESP32 via HTTP POST
 * Body can contain:
 * 1. Raw ADS1115 sample batch: { deviceId, sessionId, sequence, samples: number[], samples_o?: number[] }
 * 2. Or pre-processed metrics: { deviceId, signalQuality, motorAttemptProbability, ... }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const deviceId = body.deviceId || "esp32-01";
    const sequence = body.sequence || 1;
    const sessionId = body.sessionId;

    let telemetry: EegTelemetry;

    if (Array.isArray(body.samples) && body.samples.length > 0) {
      // Process raw ADC samples through native TypeScript DSP engine
      telemetry = processRawEegBatch(deviceId, sequence, body.samples, body.samples_o, sessionId);
    } else if (typeof body.signalQuality === "number") {
      // Pre-processed telemetry passed directly from physical hardware
      telemetry = {
        deviceId,
        sequence,
        source: body.source || "esp32_hardware",
        signalQuality: body.signalQuality,
        motorAttemptProbability: body.motorAttemptProbability ?? 0.5,
        confidence: body.confidence ?? 0.85,
        erdPercentage: body.erdPercentage ?? 0,
        isAttemptDetected: body.isAttemptDetected ?? (body.motorAttemptProbability >= 0.65),
        bands: body.bands || { delta: 0.1, theta: 0.1, alpha: 0.3, mu: 0.2, beta: 0.2, gamma: 0.1 },
        filteredPreview: body.filteredPreview || [],
        timestamp: Date.now(),
      };
    } else {
      return NextResponse.json(
        { error: "Invalid telemetry packet. Must contain real samples or signal metrics." },
        { status: 400 }
      );
    }

    // Save in in-memory device store
    deviceStore.updateTelemetry(deviceId, telemetry);

    // Return active command in response so ESP32 can detect stop command even during POST stream
    const activeCommand = deviceStore.getCommand(deviceId);

    return NextResponse.json({
      success: true,
      processed: true,
      command: activeCommand.command,
      sequence: telemetry.sequence,
    });
  } catch (error) {
    console.error("Error processing telemetry POST:", error);
    return NextResponse.json({ error: "Failed to process telemetry" }, { status: 500 });
  }
}

/**
 * GET /api/device/telemetry?deviceId=esp32-01
 * Polled by Next.js browser page to read the latest real hardware telemetry
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get("deviceId") || "esp32-01";

  const { telemetry, isHardwareOnline, lastSeenMs } = deviceStore.getTelemetry(deviceId);
  const currentCommand = deviceStore.getCommand(deviceId);

  if (telemetry && isHardwareOnline) {
    return NextResponse.json({
      telemetry,
      isHardwareOnline: true,
      isStreaming: currentCommand.command === "START_STREAM",
      lastSeenMs,
    });
  }

  return NextResponse.json({
    telemetry: null,
    isHardwareOnline: false,
    isStreaming: currentCommand.command === "START_STREAM",
    lastSeenMs,
  });
}
