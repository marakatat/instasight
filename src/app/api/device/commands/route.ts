import { NextRequest, NextResponse } from "next/server";
import { deviceStore } from "@/lib/device/deviceStore";

/**
 * GET /api/device/commands?deviceId=esp32-demo-01
 * Polled by ESP32 to check for START_STREAM / STOP_STREAM / IDLE commands
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get("deviceId") || "esp32-demo-01";

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
 * Body: { deviceId?: string, type: "START_STREAM" | "STOP_STREAM" | "IDLE", sessionId?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const deviceId = body.deviceId || "esp32-demo-01";
    const type = body.type || body.command || "IDLE";
    const sessionId = body.sessionId;

    if (!["START_STREAM", "STOP_STREAM", "IDLE"].includes(type)) {
      return NextResponse.json(
        { error: "Invalid command type. Must be START_STREAM, STOP_STREAM, or IDLE" },
        { status: 400 }
      );
    }

    const command = deviceStore.setCommand(deviceId, type, sessionId);

    return NextResponse.json({
      success: true,
      activeCommand: command,
    });
  } catch (error) {
    console.error("Error setting device command:", error);
    return NextResponse.json({ error: "Failed to process command" }, { status: 500 });
  }
}
