import { NextRequest, NextResponse } from "next/server";
import { deviceStore } from "@/lib/device/deviceStore";

/**
 * GET /api/device/config?deviceId=esp32-eeg-01
 * Retrieves current ESP32 URL and connection status
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get("deviceId")?.trim() || "esp32-eeg-01";
  const esp32Url = deviceStore.getEsp32Url(deviceId);

  return NextResponse.json({
    ok: true,
    deviceId,
    esp32Url,
  });
}

/**
 * POST /api/device/config
 * Updates the target ESP32 IP/URL and informs the local Python bridge
 * Payload: { esp32Url: "192.168.1.50", deviceId?: "esp32-eeg-01" }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rawUrl = typeof body.esp32Url === "string" ? body.esp32Url.trim() : "";
    const deviceId = typeof body.deviceId === "string" ? body.deviceId.trim() : "esp32-eeg-01";

    if (!rawUrl) {
      return NextResponse.json({ ok: false, error: "Missing esp32Url parameter" }, { status: 400 });
    }

    // Save in Next.js in-memory store
    const normalizedUrl = deviceStore.setEsp32Url(deviceId, rawUrl);

    let bridgeUpdated = false;
    let bridgeError: string | null = null;
    let esp32Reachable = false;
    let esp32Details: any = null;

    // 1. Inform local Python Bridge if running
    try {
      const bridgeRes = await fetch("http://127.0.0.1:5001/set-esp32", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ esp32Url: normalizedUrl }),
        signal: AbortSignal.timeout(3000),
      });

      if (bridgeRes.ok) {
        bridgeUpdated = true;
        const bridgeData = await bridgeRes.json();
        esp32Reachable = true;
        esp32Details = bridgeData.device;
      } else {
        const errData = await bridgeRes.json().catch(() => ({}));
        bridgeError = errData.error || `Bridge returned HTTP ${bridgeRes.status}`;
      }
    } catch (err: any) {
      bridgeError = err.message || "Bridge unreachable";
    }

    // 2. Direct probe if bridge wasn't reachable
    if (!esp32Reachable) {
      try {
        const espRes = await fetch(`${normalizedUrl}/health`, {
          headers: { "X-API-Key": "demo-device-key" },
          signal: AbortSignal.timeout(2000),
          cache: "no-store",
        });

        if (espRes.ok) {
          esp32Reachable = true;
          esp32Details = await espRes.json();
        }
      } catch (e: any) {
        // unreachable
      }
    }

    return NextResponse.json({
      ok: true,
      esp32Url: normalizedUrl,
      deviceId,
      esp32Reachable,
      bridgeUpdated,
      bridgeError,
      device: esp32Details,
    });
  } catch (error: any) {
    console.error("Error in /api/device/config:", error);
    return NextResponse.json({ ok: false, error: error.message || "Internal server error" }, { status: 500 });
  }
}
