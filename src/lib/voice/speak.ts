let currentAudio: HTMLAudioElement | null = null;
let currentAbortController: AbortController | null = null;

export async function speak(text: string) {
  if (typeof window === "undefined") return;

  // Cancel any currently playing audio
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }

  // Cancel any ongoing fetch
  if (currentAbortController) {
    currentAbortController.abort();
  }
  const abortController = new AbortController();
  currentAbortController = abortController;

  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: abortController.signal,
    });

    if (!res.ok) {
      console.warn("ElevenLabs TTS failed, falling back to browser TTS.");
      fallbackSpeak(text);
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    
    // Check again before playing, in case another fetch finished first
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    }

    currentAudio = new Audio(url);
    
    currentAudio.onended = () => {
      URL.revokeObjectURL(url);
      if (currentAudio?.src === url) {
        currentAudio = null;
      }
    };

    await currentAudio.play();
  } catch (err: any) {
    if (err.name === "AbortError") {
      // Expected behavior when a new voice cue interrupts an old one that was still loading/buffering
      return;
    }
    console.error("Audio playback error:", err);
    fallbackSpeak(text);
  }
}

function fallbackSpeak(text: string) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.85;
  utterance.pitch = 1;
  utterance.volume = 1;
  window.speechSynthesis.speak(utterance);
}
