import { NextRequest, NextResponse } from "next/server";
import { deviceStore } from "@/lib/device/deviceStore";

/**
 * GET /api/device/commands?deviceId=esp32-demo-01
 * Polled by ESP32 to check for START_STREAM / STOP_STREAM / IDLE commands
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get("deviceId")?.trim();

  if (!deviceId) {
    return NextResponse.json({ error: "Missing required deviceId" }, { status: 400 });
  }

  const command = deviceStore.getCommand(deviceId);

  return NextResponse.json({
    command: command.command,
    sessionId: command.sessionId || null,
    deviceId: command.deviceId,
    sampleRate: command.sampleRate || 250,
    batchSize: command.batchSize || 25,
    timestamp: command.updatedAt,
  });
}

/**
 * POST /api/device/commands
 * Called by Next.js client (ExerciseSession) when patient starts/stops an exercise session
 * Body: { deviceId: string, type: "START_STREAM" | "STOP_STREAM" | "IDLE", sessionId?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const deviceId = typeof body.deviceId === "string" ? body.deviceId.trim() : "";
    const type = body.type || body.command || "IDLE";
    const sessionId = body.sessionId;

    if (!deviceId) {
      return NextResponse.json({ error: "Missing required deviceId" }, { status: 400 });
    }

    if (!["START_STREAM", "STOP_STREAM", "IDLE"].includes(type)) {
      return NextResponse.json(
        { error: "Invalid command type. Must be START_STREAM, STOP_STREAM, or IDLE" },
        { status: 400 }
      );
    }

    const command = deviceStore.setCommand(deviceId, type, sessionId);

    // Also attempt direct local communication to the Python Bridge on port 5001
    const bridgeBaseUrl = process.env.BRIDGE_URL || "http://127.0.0.1:5001";
    let bridgeDirectResponse: any = null;

    try {
      if (type === "START_STREAM") {
        const bridgeRes = await fetch(`${bridgeBaseUrl}/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: sessionId || `session_${Date.now()}` }),
          signal: AbortSignal.timeout(1500),
        });
        if (bridgeRes.ok) {
          bridgeDirectResponse = await bridgeRes.json();
        }
      } else if (type === "STOP_STREAM") {
        const bridgeRes = await fetch(`${bridgeBaseUrl}/stop`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(1500),
        });
        if (bridgeRes.ok) {
          bridgeDirectResponse = await bridgeRes.json();
        }
      }
    } catch {
      // Bridge may be running on remote IP or will pick up via fallback polling
    }

    return NextResponse.json({
      success: true,
      activeCommand: command,
      bridgeDirect: bridgeDirectResponse ? { ok: true, data: bridgeDirectResponse } : { ok: false, mode: "queued" },
    });
  } catch (error) {
    console.error("Error setting device command:", error);
    return NextResponse.json({ error: "Failed to process command" }, { status: 500 });
  }
}

