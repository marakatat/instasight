// Simulate a minimal upload to see the exact error
const { FormData } = require("undici");
const fetch = require("node:http").request;

// Use native fetch
async function testUpload() {
  const body = new globalThis.FormData();
  body.append("sessionId", "test_session_debug_" + Date.now());
  body.append("exerciseId", "right_arm_raise");
  body.append("events", JSON.stringify([{
    id: "test-id-1",
    sessionId: "test_session",
    videoTimeMs: 5000,
    createdAt: new Date().toISOString(),
    repetitionNumber: 1,
    suggestion: "Good job",
    clinicalNote: "Test note",
    severity: "info",
    reasonCodes: ["TEST"],
    evidence: { poseConfidence: 0.9 },
    confidence: 0.9,
    modelName: "test",
    modelVersion: "1.0",
    source: "ai",
    therapistReviewed: false
  }]));

  const res = await fetch("http://localhost:3000/api/sessions/upload", {
    method: "POST",
    body: body,
  });
  const data = await res.json();
  console.log("Status:", res.status);
  console.log("Response:", JSON.stringify(data, null, 2));
}

testUpload().catch(console.error);
