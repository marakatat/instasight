fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    model: "google/some-random-nonsense-model-id:free",
    messages: [{ role: "user", content: "test" }]
  })
}).then(res => res.json()).then(data => console.log(JSON.stringify(data, null, 2)));
