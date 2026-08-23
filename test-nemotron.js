const prompt = `You are a physical therapy AI. Provide a short verbal cue for the patient. Return ONLY a JSON object with a "suggestion" string field. No markdown. No other text.`;
const body = JSON.stringify({
  model: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  messages: [{ role: "user", content: prompt }]
});
fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
    "Content-Type": "application/json"
  },
  body
}).then(res => res.json()).then(data => console.log(JSON.stringify(data, null, 2)));
