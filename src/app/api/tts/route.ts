import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { text } = await req.json();

    if (!text) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY || process.env.ELEVENLABS_KEY;

    if (!apiKey) {
      console.error("ELEVENLABS_KEY is not configured.");
      return NextResponse.json({ error: "ELEVENLABS_KEY is not configured" }, { status: 500 });
    }

    // Default to "Sarah" (Standard pre-made voice for free tier)
    const voiceId = process.env.ELEVENLABS_VOICE_ID || "EXAVITQu4vr4xnSDxMaL"; 

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_turbo_v2", // Ultra low-latency model optimized for real-time
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("ElevenLabs API Error:", errorData);
      return NextResponse.json({ error: "Failed to generate TTS" }, { status: response.status });
    }

    // Return the audio stream directly to the client
    return new NextResponse(response.body, {
      headers: {
        "Content-Type": "audio/mpeg",
      },
    });

  } catch (error) {
    console.error("TTS Route Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
