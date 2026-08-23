import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

/**
 * GET /api/device/pair
 * Retrieves the currently paired ESP32 device ID for the logged-in user.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("device_id, full_name, role")
      .eq("id", user.id)
      .single();

    if (profileError) {
      return NextResponse.json(
        { error: "Failed to load profile" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      deviceId: profile?.device_id || null,
      profile,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/device/pair
 * Pairs a unique ESP32 device ID with the logged-in user's account.
 * Enforces uniqueness across all profiles.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const rawDeviceId = typeof body.deviceId === "string" ? body.deviceId.trim() : "";

    if (!rawDeviceId) {
      return NextResponse.json(
        { error: "A valid device ID is required." },
        { status: 400 }
      );
    }

    // Check if deviceId is already paired to another user
    const { data: existing, error: queryError } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("device_id", rawDeviceId)
      .maybeSingle();

    if (queryError) {
      return NextResponse.json(
        { error: "Database error checking device ownership." },
        { status: 500 }
      );
    }

    if (existing && existing.id !== user.id) {
      return NextResponse.json(
        {
          error: `Device ID "${rawDeviceId}" is already paired with another account.`,
        },
        { status: 409 }
      );
    }

    // Update current profile
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ device_id: rawDeviceId })
      .eq("id", user.id);

    if (updateError) {
      if (updateError.code === "23505") {
        return NextResponse.json(
          {
            error: `Device ID "${rawDeviceId}" is already claimed by another user.`,
          },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: updateError.message || "Failed to pair device." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      deviceId: rawDeviceId,
      message: `Device "${rawDeviceId}" paired successfully.`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/device/pair
 * Unlinks the paired device ID from the user's account.
 */
export async function DELETE() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ device_id: null })
      .eq("id", user.id);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message || "Failed to unpair device." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Device unpaired successfully.",
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
