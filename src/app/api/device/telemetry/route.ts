import { NextRequest, NextResponse } from "next/server";
import { deviceStore } from "@/lib/device/deviceStore";
import { processRawEegBatch } from "@/lib/eeg/signalProcessing";
import { EegTelemetry } from "@/lib/eeg/useEegStream";

/**
 * POST /api/device/telemetry
 * Called by ESP32 or Python Phone Bridge
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const deviceId = typeof body.deviceId === "string" ? body.deviceId.trim() : "";
    if (!deviceId) {
      return NextResponse.json({ error: "Missing required deviceId" }, { status: 400 });
    }
    const sequence = body.sequence || 1;
    const sessionId = body.sessionId;

    let telemetry: EegTelemetry;

    if (Array.isArray(body.samples) && body.samples.length > 0) {
      // Process raw ADC samples through native TypeScript DSP engine
      telemetry = processRawEegBatch(deviceId, sequence, body.samples, body.samples_o, sessionId);
    } else if (typeof body.signalQuality === "number") {
      // Pre-processed telemetry passed directly
      telemetry = {
        deviceId,
        sequence,
        source: body.source || "esp32_hardware",
        signalQuality: body.signalQuality,
        motorAttemptProbability: typeof body.motorAttemptProbability === "number" ? body.motorAttemptProbability : 0,
        confidence: typeof body.confidence === "number" ? body.confidence : 0,
        erdPercentage: typeof body.erdPercentage === "number" ? body.erdPercentage : 0,
        betaErdPercentage: typeof body.betaErdPercentage === "number" ? body.betaErdPercentage : 0,
        isAttemptDetected: Boolean(body.isAttemptDetected),
        isMovementIntended: Boolean(body.isMovementIntended),
        intentionState: body.intentionState || "resting",
        fatigueIndex: typeof body.fatigueIndex === "number" ? body.fatigueIndex : 1.0,
        bands: body.bands || { delta: 0, theta: 0, alpha: 0, mu: 0, beta: 0, gamma: 0 },
        filteredPreview: Array.isArray(body.filteredPreview) ? body.filteredPreview : [],
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

    // Return active command in response
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
 * GET /api/device/telemetry?deviceId=esp32-eeg-01
 * Polled by Next.js UI to read real hardware state & latest telemetry
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get("deviceId")?.trim() || "esp32-eeg-01";

  const { telemetry, isHardwareOnline: isActivelyStreaming, lastSeenMs } = deviceStore.getTelemetry(deviceId);

  let isBridgeOnline = false;
  let isEsp32Online = false;
  let isAdsConnected = false;
  let esp32Url = "http://192.168.155.39";

  if (isActivelyStreaming) {
    // If active telemetry packets are flowing in right now
    isBridgeOnline = true;
    isEsp32Online = true;
    isAdsConnected = telemetry?.source === "esp32_hardware" && (telemetry.signalQuality > 0.05);
  } else {
    // Probe local Python bridge
    try {
      const bridgeRes = await fetch("http://127.0.0.1:5001/health", {
        signal: AbortSignal.timeout(400),
        cache: "no-store",
      });
      if (bridgeRes.ok) {
        const bridgeData = await bridgeRes.json();
        isBridgeOnline = true;
        isEsp32Online = Boolean(bridgeData.esp32Online);
        isAdsConnected = Boolean(bridgeData.adsConnected);
        if (bridgeData.esp32Url) esp32Url = bridgeData.esp32Url;
      }
    } catch {
      isBridgeOnline = false;
    }

    // Direct probe fallback to ESP32 if bridge wasn't reachable or reported offline
    if (!isEsp32Online) {
      try {
        const espRes = await fetch(`${esp32Url}/health`, {
          headers: { "X-API-Key": "demo-device-key" },
          signal: AbortSignal.timeout(400),
          cache: "no-store",
        });
        if (espRes.ok) {
          const espData = await espRes.json();
          isEsp32Online = true;
          isAdsConnected = Boolean(espData.adsConnected);
        }
      } catch {
        // unreachable
      }
    }
  }

  // Determine unambiguous, human-readable hardware status
  let hardwareStatus: "OFFLINE" | "SIMULATED_STANDBY" | "HARDWARE_READY" | "STREAMING_REAL" | "STREAMING_SIMULATED";
  let statusMessage: string;

  if (isActivelyStreaming) {
    if (isAdsConnected) {
      hardwareStatus = "STREAMING_REAL";
      statusMessage = "Live Real EEG • ADS1115 Active";
    } else {
      hardwareStatus = "STREAMING_SIMULATED";
      statusMessage = "Live Stream • Simulation Fallback (No ADC)";
    }
  } else if (isEsp32Online) {
    if (isAdsConnected) {
      hardwareStatus = "HARDWARE_READY";
      statusMessage = "Hardware Online • ADS1115 ADC Ready";
    } else {
      hardwareStatus = "SIMULATED_STANDBY";
      statusMessage = "ESP32 Online • No ADS1115 (Simulation Mode)";
    }
  } else {
    hardwareStatus = "OFFLINE";
    statusMessage = "Hardware Offline (ESP32 Unreachable)";
  }

  return NextResponse.json({
    telemetry: isActivelyStreaming ? telemetry : null,
    isHardwareOnline: isEsp32Online || isActivelyStreaming,
    isBridgeOnline,
    isEsp32Online,
    isAdsConnected,
    isStreaming: isActivelyStreaming,
    hardwareStatus,
    statusMessage,
    esp32Url,
    lastSeenMs,
  });
}
