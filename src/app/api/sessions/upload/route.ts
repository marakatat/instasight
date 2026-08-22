import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const videoFile = formData.get("video") as File;
    const eventsString = formData.get("events") as string;

    if (!videoFile || !eventsString) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }

    const arrayBuffer = await videoFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Save to public directory for the hackathon trick so the frontend can read it instantly
    const publicDir = path.join(process.cwd(), "public");
    
    // Ensure public directory exists
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }

    // Overwrite the demo files
    fs.writeFileSync(path.join(publicDir, "demo-session.webm"), buffer);
    fs.writeFileSync(path.join(publicDir, "session-data.json"), eventsString);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Failed to upload" }, { status: 500 });
  }
}
