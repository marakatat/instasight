import { NextRequest, NextResponse } from "next/server";
import { deviceStore } from "@/lib/device/deviceStore";

/**
 * GET /api/device/commands/next?deviceId=esp32-eeg-01
 * Polled by the Python Phone Bridge to fetch the next pending command.
 *
 * Response:
 * {
 *   "commandId": "cmd-1700000000",
 *   "command": "START" | "STOP" | "NONE",
 *   "sessionId": "session-123",
 *   "deviceId": "esp32-eeg-01"
 * }
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get("deviceId")?.trim() || "esp32-eeg-01";

  const command = deviceStore.getCommand(deviceId);

  let commandType: "START" | "STOP" | "NONE" = "NONE";
  if (command.command === "START_STREAM") {
    commandType = "START";
  } else if (command.command === "STOP_STREAM") {
    commandType = "STOP";
  }

  return NextResponse.json({
    commandId: `cmd-${command.updatedAt}`,
    command: commandType,
    sessionId: command.sessionId || null,
    deviceId: command.deviceId,
    updatedAt: command.updatedAt,
  });
}
