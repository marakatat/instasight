import { NextRequest, NextResponse } from "next/server";
import { deviceStore } from "@/lib/device/deviceStore";

/**
 * GET /api/device/session-metrics?deviceId=esp32-eeg-01&sessionId=session_123
 * Returns computed EEG frequency band powers, ERD, and movement intention timeline for a session.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get("deviceId")?.trim() || "esp32-eeg-01";
  const sessionId = searchParams.get("sessionId")?.trim();

  const metrics = deviceStore.getSessionMetrics(deviceId, sessionId || undefined);

  return NextResponse.json(metrics);
}
