# InstaSight Python Backend Service

A high-performance Python + FastAPI backend designed for real-time EEG signal processing, ESP32 hardware telemetry ingestion over local Wi-Fi, and real-time synchronization with cloud-hosted Next.js web applications.

---

## 🏛️ Architecture Overview

```text
┌───────────────────────────────┐
│     ESP32 (Hardware ADC)      │
│  - Reads EEG/ADS1115 sensor   │
│  - Batches samples (250 Hz)   │
└───────────────┬───────────────┘
                │ Wi-Fi WebSocket (`ws://<LAPTOP_LAN_IP>:8000/ws/eeg/{deviceId}`)
                ▼
┌────────────────────────────────────────────────────────┐
│             Local Python FastAPI Service               │
│                                                        │
│  ├── Signal Processing:                                │
│  │   - Baseline removal & 0.5-45 Hz Bandpass filter    │
│  │   - 50 Hz Notch filter (powerline hum reduction)    │
│  │   - Welch/FFT Frequency Band Power (Mu, Beta, etc.) │
│  │   - Signal Quality Index (SQI) evaluation           │
│  │   - Event-Related Desynchronization (ERD) calculation│
│  │                                                     │
│  ├── Motor Attempt Classifier:                         │
│  │   - Detects neural intention score (0.0 to 1.0)     │
│  │                                                     │
│  ├── Multimodal Feedback Engine:                       │
│  │   - Merges EEG motor intent + Pose joint angles     │
│  │   - Generates actionable clinical voice prompts     │
│  │                                                     │
│  └── Built-in Synthetic EEG Generator (for testing)    │
└───────────────┬────────────────────────────────────────┘
                │ WebSocket (`ws://localhost:8000/ws/stream`) / HTTP REST
                ▼
┌───────────────────────────────┐
│     Next.js Web Application   │
│   (Cloud-hosted or Local)     │
│  - Live EEG waveform & intent │
│  - Real-time Pose tracking    │
│  - Audio coaching & charts    │
└───────────────────────────────┘
```

---

## 🚀 Quickstart

### 1. Setup Environment
```bash
cd python_server

# Activate the virtual environment
source venv/bin/activate

# (Optional) Install dependencies if needed:
pip install -r requirements.txt
```

### 2. Start the Server
```bash
python main.py
# Or directly via uvicorn:
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

The server binds to `0.0.0.0` so devices on your Wi-Fi network (like the ESP32) can reach it using your laptop's local IP (e.g. `192.168.x.x:8000`), while the browser connects via `localhost:8000` or local IP.

---

## 🔌 API Reference

### WebSockets

| Endpoint | Purpose | Direction |
|---|---|---|
| `ws://<HOST>:8000/ws/eeg/{device_id}` | ESP32 hardware streaming | ESP32 ➔ Python (receives raw batches) |
| `ws://<HOST>:8000/ws/client/{client_id}` | Next.js browser stream | Python ➔ Next.js (real-time telemetry & feedback) |
| `ws://<HOST>:8000/ws/stream` | Default Next.js live telemetry | Python ➔ Next.js (broadcasts metrics) |

#### ESP32 WebSocket Packet Format:
```json
{
  "deviceId": "esp32-demo-01",
  "sequence": 1024,
  "samples": [12.4, 15.1, -8.2, -18.4, 22.0]
}
```

#### Client WebSocket Broadcast Format:
```json
{
  "type": "eeg_telemetry",
  "data": {
    "deviceId": "esp32-demo-01",
    "sequence": 1024,
    "signalQuality": 0.92,
    "motorAttemptProbability": 0.78,
    "confidence": 0.86,
    "erdPercentage": 22.4,
    "isAttemptDetected": true,
    "bands": {
      "delta": 3.2,
      "theta": 4.1,
      "alpha": 5.4,
      "mu": 2.1,
      "beta": 8.4,
      "gamma": 1.2
    },
    "filteredPreview": [-1.2, 0.4, 2.1, 1.8]
  }
}
```

---

### REST Endpoints

#### 1. Server Status & LAN IP helper
- **`GET /api/status`**
  - Returns server health, active ESP32 connections, and your laptop's detected LAN IP addresses.

#### 2. Get Latest EEG Reading
- **`GET /api/eeg/latest`**
  - Fetches the most recent processed EEG metrics.

#### 3. Ingest EEG Packet (HTTP fallback)
- **`POST /api/eeg/packet`**
  - Ingests raw samples over standard HTTP.

#### 4. Multimodal Feedback (Pose + EEG)
- **`POST /api/feedback/combine`**
  - Combines computer vision pose angles with live EEG to generate clinical feedback.
```json
{
  "sessionId": "session_001",
  "exerciseId": "right_arm_raise",
  "videoTimeMs": 3200,
  "pose": {
    "shoulderAngle": 62.5,
    "elbowAngle": 168.0,
    "movementDurationMs": 1400,
    "rangeOfMotion": 62.5,
    "poseConfidence": 0.95,
    "repetitionNumber": 2,
    "exercisePhase": "holding"
  }
}
```

#### 5. Simulator Controls
- **`POST /api/simulator/start`**: Starts the synthetic ESP32 EEG generator.
- **`POST /api/simulator/stop`**: Stops the synthetic EEG generator.

---

## 🌐 Connecting from Next.js (Cloud-Hosted or Local)

When your Next.js app is hosted on the cloud (Vercel, etc.), users can connect their browser to the local Python instance running on their machine:

Set in `.env.local` or Next.js config:
```env
NEXT_PUBLIC_PYTHON_SERVER_URL=http://localhost:8000
NEXT_PUBLIC_PYTHON_WS_URL=ws://localhost:8000/ws/stream
```

Because FastAPI is configured with permissive CORS (`allow_origins=["*"]`), cross-origin requests from your cloud domain work seamlessly.
