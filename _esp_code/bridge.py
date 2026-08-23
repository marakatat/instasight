"""
InstaSight - Python Phone Bridge Simulator & Device Manager
==========================================================
Acts as a bridge between ESP32 EEG devices on the local Wi-Fi network and the online web app.

Features:
- Complete transfer logging (ESP32 <-> Bridge <-> Online Web App).
- Accumulates session EEG samples during recording and uploads the full dataset on STOP.
- Automatically saves a local JSON recording snapshot for every session.
- Configurable online WebApp URL directly from the Web UI dashboard.
- Local network subnet scanner to automatically discover nearby ESP32 EEG units.
- Web UI on port 5001 for device discovery, manual IP, live stream monitoring, and live transfer log console.
"""

import os
import json
import time
import socket
import threading
import logging
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Optional, List, Dict

import requests
from flask import Flask, jsonify, request, render_template_string

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S"
)
logger = logging.getLogger("PhoneBridge")

# Suppress noisy werkzeug access logs for routine status/health polling
class PollingFilter(logging.Filter):
    def filter(self, record):
        msg = record.getMessage()
        return not ("/status HTTP" in msg or "/health HTTP" in msg or "/logs HTTP" in msg)

logging.getLogger("werkzeug").addFilter(PollingFilter())

app = Flask(__name__)

# Recordings directory
RECORDINGS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "recordings")
os.makedirs(RECORDINGS_DIR, exist_ok=True)

# Configuration defaults
ESP32_URL = os.environ.get("ESP32_URL", "http://192.168.155.39").rstrip("/")
WEBAPP_EEG_URL = os.environ.get("WEBAPP_EEG_URL", "http://localhost:3000/api/eeg").strip()
WEBAPP_COMMAND_URL = os.environ.get("WEBAPP_COMMAND_URL", "http://localhost:3000/api/device/commands/next").strip()
DEVICE_ID = os.environ.get("DEVICE_ID", "esp32-eeg-01")
DEVICE_KEY = os.environ.get("DEVICE_KEY", "demo-device-key")
BRIDGE_TOKEN = os.environ.get("BRIDGE_TOKEN", "demo-bridge-token")
BRIDGE_PORT = int(os.environ.get("PORT", "5001"))

# Bridge state & session buffers
current_session_id: Optional[str] = None
session_start_time: Optional[str] = None
session_samples_buffer: List[float] = []
session_packets_buffer: List[Dict] = []
recording: bool = False
last_command_id: Optional[str] = None
packets_forwarded: int = 0
total_samples_sent: int = 0
last_packet_time: Optional[str] = None
state_lock = threading.Lock()

# Circular buffer for live web UI transfer logs (keeps last 100 entries)
transfer_logs = deque(maxlen=100)


def add_log(direction: str, message: str, level: str = "info"):
    now_str = datetime.now().strftime("%H:%M:%S.%f")[:-3]
    entry = {
        "timestamp": now_str,
        "direction": direction,
        "message": message,
        "level": level
    }
    with state_lock:
        transfer_logs.append(entry)

    prefix = f"[{direction}]" if direction else "[Bridge]"
    if level == "error":
        logger.error(f"{prefix} {message}")
    elif level == "warning":
        logger.warning(f"{prefix} {message}")
    else:
        logger.info(f"{prefix} {message}")


def esp_headers() -> dict:
    return {
        "X-API-Key": DEVICE_KEY
    }


def get_local_subnets() -> List[str]:
    subnets = []
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        parts = local_ip.split(".")
        if len(parts) == 4:
            subnets.append(f"{parts[0]}.{parts[1]}.{parts[2]}")
    except Exception:
        pass

    fallbacks = ["192.168.155", "192.168.1", "192.168.0", "192.168.4"]
    for fb in fallbacks:
        if fb not in subnets:
            subnets.append(fb)
    return subnets


def probe_device(ip_prefix: str, host_num: int) -> Optional[Dict]:
    target_ip = f"http://{ip_prefix}.{host_num}"
    try:
        res = requests.get(
            f"{target_ip}/health",
            headers={"X-API-Key": DEVICE_KEY},
            timeout=0.35
        )
        if res.status_code == 200:
            data = res.json()
            if data.get("deviceId") or data.get("ok"):
                return {
                    "ip": target_ip,
                    "deviceId": data.get("deviceId", "esp32-eeg"),
                    "mode": data.get("mode", "STA"),
                    "wifiRssi": data.get("wifiRssi", 0),
                    "recording": data.get("recording", False),
                    "sampleRate": data.get("sampleRate", 250),
                    "sessionId": data.get("sessionId", "")
                }
    except Exception:
        pass
    return None


def scan_local_network() -> List[Dict]:
    discovered = []
    subnets = get_local_subnets()
    primary_subnet = subnets[0] if subnets else "192.168.1"

    add_log("NetworkScan", f"Scanning subnet {primary_subnet}.1-254 for ESP32 devices...")

    with ThreadPoolExecutor(max_workers=60) as executor:
        futures = [executor.submit(probe_device, primary_subnet, host) for host in range(1, 255)]
        for f in futures:
            result = f.result()
            if result:
                discovered.append(result)
                add_log("NetworkScan", f"Discovered device {result['deviceId']} at {result['ip']} (RSSI: {result['wifiRssi']} dBm)")

    # Also test the currently configured ESP32_URL if not in scanned list
    if ESP32_URL and not any(d["ip"] == ESP32_URL for d in discovered):
        try:
            res = requests.get(f"{ESP32_URL}/health", headers={"X-API-Key": DEVICE_KEY}, timeout=0.5)
            if res.status_code == 200:
                data = res.json()
                discovered.append({
                    "ip": ESP32_URL,
                    "deviceId": data.get("deviceId", DEVICE_ID),
                    "mode": data.get("mode", "STA"),
                    "wifiRssi": data.get("wifiRssi", 0),
                    "recording": data.get("recording", False),
                    "sampleRate": data.get("sampleRate", 250),
                    "sessionId": data.get("sessionId", "")
                })
        except Exception:
            pass

    add_log("NetworkScan", f"Scan complete. Found {len(discovered)} active device(s).")
    return discovered


def start_esp_recording(session_id: str) -> dict:
    global current_session_id, recording, session_start_time, session_samples_buffer, session_packets_buffer

    add_log("Bridge -> ESP32", f"POST {ESP32_URL}/start?session_id={session_id}")

    t0 = time.time()
    response = requests.post(
        f"{ESP32_URL}/start",
        params={"session_id": session_id},
        headers=esp_headers(),
        timeout=4
    )
    latency_ms = int((time.time() - t0) * 1000)
    response.raise_for_status()

    with state_lock:
        current_session_id = session_id
        session_start_time = datetime.now(timezone.utc).isoformat()
        session_samples_buffer = []
        session_packets_buffer = []
        recording = True

    data = response.json()
    add_log("ESP32 -> Bridge", f"HTTP {response.status_code} ({latency_ms}ms) - Recording started: {data}")
    return data


def stop_esp_recording() -> dict:
    global current_session_id, recording, session_start_time, session_samples_buffer, session_packets_buffer

    saved_session_id = current_session_id or f"session_{int(time.time())}"
    add_log("Bridge -> ESP32", f"POST {ESP32_URL}/stop")

    t0 = time.time()
    try:
        response = requests.post(
            f"{ESP32_URL}/stop",
            headers=esp_headers(),
            timeout=4
        )
        latency_ms = int((time.time() - t0) * 1000)
        data = response.json() if response.status_code == 200 else {}
        add_log("ESP32 -> Bridge", f"HTTP {response.status_code} ({latency_ms}ms) - Stop acknowledged: {data}")
    except Exception as e:
        add_log("BridgeError", f"Error stopping ESP32: {e}", level="warning")
        data = {"ok": False, "error": str(e)}

    # Final buffer drain from ESP32 to capture trailing samples
    try:
        final_packet = read_eeg_from_esp()
        if final_packet and final_packet.get("sampleCount", 0) > 0:
            samples = final_packet.get("samples", [])
            with state_lock:
                session_samples_buffer.extend(samples)
                session_packets_buffer.append(final_packet)
            add_log("ESP32 -> Bridge", f"Final buffer drain captured {len(samples)} samples.")
    except Exception:
        pass

    with state_lock:
        recording = False
        all_samples = list(session_samples_buffer)
        all_packets = list(session_packets_buffer)
        started_at = session_start_time
        current_session_id = None

    # 1. Save complete session recording to local JSON file
    stopped_at = datetime.now(timezone.utc).isoformat()
    session_record = {
        "sessionId": saved_session_id,
        "deviceId": DEVICE_ID,
        "sampleRate": 250,
        "sampleCount": len(all_samples),
        "packetCount": len(all_packets),
        "startedAt": started_at,
        "stoppedAt": stopped_at,
        "samples": all_samples,
        "source": "esp32-phone-bridge"
    }

    local_filepath = os.path.join(RECORDINGS_DIR, f"{saved_session_id}.json")
    try:
        with open(local_filepath, "w") as f:
            json.dump(session_record, f, indent=2)
        add_log("LocalStorage", f"Session saved locally to {local_filepath} ({len(all_samples)} samples)")
    except Exception as save_err:
        add_log("LocalStorageError", f"Failed writing local session file: {save_err}", level="error")

    # 2. Forward full session recording payload to online web app
    if WEBAPP_EEG_URL:
        add_log("Bridge -> WebApp", f"Uploading complete session dataset ({len(all_samples)} samples) to {WEBAPP_EEG_URL}...")
        try:
            t_up0 = time.time()
            res = requests.post(
                WEBAPP_EEG_URL,
                json=session_record,
                headers={
                    "Authorization": f"Bearer {BRIDGE_TOKEN}",
                    "Content-Type": "application/json"
                },
                timeout=10
            )
            up_latency_ms = int((time.time() - t_up0) * 1000)
            add_log("Bridge -> WebApp", f"HTTP {res.status_code} ({up_latency_ms}ms) - Final session upload successful!")
        except Exception as up_err:
            add_log("BridgeError", f"Failed uploading final session to WebApp: {up_err}", level="error")

    return {
        "ok": True,
        "sessionId": saved_session_id,
        "sampleCount": len(all_samples),
        "localFile": local_filepath,
        "espResponse": data
    }


def read_eeg_from_esp() -> dict:
    t0 = time.time()
    response = requests.get(
        f"{ESP32_URL}/eeg",
        headers=esp_headers(),
        timeout=3
    )
    latency_ms = int((time.time() - t0) * 1000)
    response.raise_for_status()
    packet = response.json()

    sample_count = packet.get("sampleCount", 0)
    seq = packet.get("sequence", 0)
    samples = packet.get("samples", [])
    preview = [round(s, 3) for s in samples[:3]]

    if sample_count > 0:
        add_log("ESP32 -> Bridge", f"GET /eeg (HTTP {response.status_code}, {latency_ms}ms): seq={seq}, count={sample_count}, preview={preview}...")

    return packet


def forward_eeg_to_webapp(eeg_packet: dict) -> requests.Response:
    global packets_forwarded, total_samples_sent, last_packet_time

    samples = eeg_packet.get("samples", [])
    seq = eeg_packet.get("sequence", 0)
    sid = eeg_packet.get("sessionId") or current_session_id

    # Accumulate samples into session buffer
    with state_lock:
        session_samples_buffer.extend(samples)
        session_packets_buffer.append(eeg_packet)

    payload = {
        "deviceId": DEVICE_ID,
        "sessionId": sid,
        "sequence": seq,
        "deviceTimeMs": eeg_packet.get("deviceTimeMs", 0),
        "sampleRate": eeg_packet.get("sampleRate", 250),
        "samples": samples,
        "sampleCount": len(samples),
        "droppedSamples": eeg_packet.get("droppedSamples", 0),
        "receivedAt": datetime.now(timezone.utc).isoformat(),
        "source": "esp32-phone-bridge"
    }

    t0 = time.time()
    response = requests.post(
        WEBAPP_EEG_URL,
        json=payload,
        headers={
            "Authorization": f"Bearer {BRIDGE_TOKEN}",
            "Content-Type": "application/json"
        },
        timeout=5
    )
    latency_ms = int((time.time() - t0) * 1000)
    response.raise_for_status()

    with state_lock:
        packets_forwarded += 1
        total_samples_sent += len(samples)
        last_packet_time = datetime.now().strftime("%H:%M:%S")

    add_log("Bridge -> WebApp", f"POST {WEBAPP_EEG_URL} (HTTP {response.status_code}, {latency_ms}ms): seq={seq}, count={len(samples)}, session={sid}")
    return response


# ---------- Background Polling Loops ----------

def eeg_polling_loop():
    add_log("Worker", "EEG polling thread initialized.")
    while True:
        try:
            is_rec = False
            with state_lock:
                is_rec = recording

            if is_rec:
                packet = read_eeg_from_esp()
                if packet.get("sampleCount", 0) > 0:
                    forward_eeg_to_webapp(packet)

        except requests.exceptions.RequestException as net_err:
            add_log("WorkerError", f"ESP32 read error: {net_err}", level="warning")
        except Exception as error:
            add_log("WorkerError", f"EEG bridge error: {error}", level="error")

        time.sleep(0.1)


def command_polling_loop():
    global last_command_id
    add_log("Worker", "Command polling thread initialized.")

    while True:
        try:
            response = requests.get(
                WEBAPP_COMMAND_URL,
                params={"deviceId": DEVICE_ID},
                headers={"Authorization": f"Bearer {BRIDGE_TOKEN}"},
                timeout=5
            )

            if response.status_code == 200:
                command = response.json()
                command_id = command.get("commandId") or command.get("id")
                command_type = (command.get("command") or command.get("type") or "").upper()
                session_id = command.get("sessionId") or "cloud-session"

                if command_id and command_id != last_command_id:
                    add_log("WebApp -> Bridge", f"Received command from cloud: {command_type} (id={command_id}, session={session_id})")

                    if command_type in ("START", "START_STREAM"):
                        try:
                            start_esp_recording(session_id)
                        except Exception as e:
                            add_log("BridgeError", f"Failed starting ESP recording: {e}", level="error")

                    elif command_type in ("STOP", "STOP_STREAM"):
                        try:
                            stop_esp_recording()
                        except Exception as e:
                            add_log("BridgeError", f"Failed stopping ESP recording: {e}", level="error")

                    last_command_id = command_id

        except requests.exceptions.RequestException:
            pass
        except Exception as error:
            add_log("WorkerError", f"Command polling error: {error}", level="error")

        time.sleep(3.0)


# =========================================================================
#  Flask Web Dashboard & API Endpoints
# =========================================================================

HTML_DASHBOARD = """
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>InstaSight - Phone Bridge Device Manager</title>
  <style>
    :root {
      --bg: #0a0a0a;
      --card: #141414;
      --border: #262626;
      --text: #f3f4f6;
      --muted: #888;
      --accent: #fff;
      --green: #10b981;
      --red: #ef4444;
      --amber: #f59e0b;
      --blue: #38bdf8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
      background: var(--bg);
      color: var(--text);
      padding: 24px;
      line-height: 1.5;
    }
    .container { max-width: 840px; margin: 0 auto; }
    header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border);
    }
    .badge {
      display: inline-block;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      padding: 3px 8px;
      border-radius: 4px;
      background: var(--border);
      color: #fff;
    }
    .badge.online { background: #064e3b; color: #34d399; }
    .badge.rec { background: #7f1d1d; color: #f87171; }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 20px;
      margin-bottom: 20px;
    }
    h2 { font-size: 16px; font-weight: 600; margin-bottom: 12px; color: #fff; }
    .row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; border-bottom: 1px solid #1c1c1c; }
    .row:last-child { border-bottom: none; }
    .label { color: var(--muted); }
    .val { font-family: monospace; font-weight: 600; }
    input[type="text"] {
      width: 100%;
      padding: 12px;
      background: #0f0f0f;
      border: 1px solid var(--border);
      color: #fff;
      border-radius: 6px;
      font-family: monospace;
      font-size: 14px;
      margin-bottom: 10px;
    }
    input[type="text"]:focus { outline: none; border-color: #fff; }
    .btn-group { display: flex; gap: 10px; }
    button {
      padding: 10px 16px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
    }
    .btn-primary { background: #fff; color: #000; }
    .btn-primary:hover { background: #e5e5e5; }
    .btn-secondary { background: #262626; color: #fff; }
    .btn-secondary:hover { background: #333; }
    .btn-danger { background: var(--red); color: #fff; }
    .btn-success { background: var(--green); color: #000; }
    button:disabled {
      opacity: 0.35;
      cursor: not-allowed;
      pointer-events: none;
    }
    .device-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px;
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 6px;
      margin-bottom: 10px;
    }
    .device-info { font-size: 13px; }
    .device-ip { font-family: monospace; font-weight: 700; color: #fff; font-size: 14px; }
    .device-meta { color: var(--muted); font-size: 11px; margin-top: 2px; }
    .log-box {
      background: #050505;
      border: 1px solid #222;
      border-radius: 8px;
      padding: 14px;
      height: 240px;
      overflow-y: auto;
      font-family: monospace;
      font-size: 12px;
      line-height: 1.6;
    }
    .log-entry { margin-bottom: 4px; word-break: break-all; }
    .log-time { color: #555; margin-right: 6px; }
    .log-dir { font-weight: bold; margin-right: 6px; }
    .dir-esp32 { color: #38bdf8; }
    .dir-webapp { color: #34d399; }
    .dir-scan { color: #fbbf24; }
    .dir-err { color: #f87171; }
    .spinner {
      display: inline-block;
      width: 14px;
      height: 14px;
      border: 2px solid rgba(255,255,255,0.3);
      border-radius: 50%;
      border-top-color: #fff;
      animation: spin 0.8s linear infinite;
      margin-right: 6px;
      vertical-align: middle;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <span class="badge online">PHONE BRIDGE ACTIVE</span>
        <h1 style="font-size: 22px; margin-top: 6px;">InstaSight Device & Transfer Manager</h1>
        <p style="color: var(--muted); font-size: 12px;">Local Phone Simulator • HTTP Translator • Real-Time Logger</p>
      </div>
      <div style="text-align: right;">
        <span class="badge" id="recBadge">IDLE</span>
      </div>
    </header>

    <!-- Active Connected Device Card -->
    <div class="card">
      <h2>Active Connection & Telemetry Stats</h2>
      <div class="row">
        <span class="label">Target ESP32 URL</span>
        <span class="val" id="dispEspUrl">{{ esp32_url }}</span>
      </div>
      <div class="row">
        <span class="label">ESP32 Reachability</span>
        <span class="val" id="dispConnStatus">Checking...</span>
      </div>
      <div class="row">
        <span class="label">Packets Forwarded</span>
        <span class="val" id="dispPackets">{{ packets_forwarded }} pkts (<span id="dispSamples">{{ total_samples_sent }}</span> samples)</span>
      </div>
      <div class="row">
        <span class="label">Current Session Samples</span>
        <span class="val" id="dispSessionSamples">0 samples</span>
      </div>

      <div class="btn-group" style="margin-top: 16px;">
        <button class="btn-success" id="startBtn" onclick="triggerStart()">Start Recording</button>
        <button class="btn-danger" id="stopBtn" onclick="triggerStop()" disabled>Stop & Upload Recording</button>
        <button class="btn-secondary" onclick="refreshStatus()">Refresh Status</button>
      </div>
    </div>

    <!-- WebApp Target Configuration Card -->
    <div class="card">
      <h2>Online Web App URL Configuration</h2>
      <p style="color: var(--muted); font-size: 12px; margin-bottom: 12px;">
        Destination endpoint where EEG telemetry and completed session recordings are posted.
      </p>
      <input type="text" id="webappUrlInput" placeholder="http://localhost:3000/api/eeg" value="{{ webapp_eeg_url }}">
      <div class="btn-group">
        <button class="btn-primary" onclick="setWebappUrl()">Update WebApp URL →</button>
      </div>
    </div>

    <!-- Live Data Transfer Log Console -->
    <div class="card">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
        <h2>Live Data Transfer Stream</h2>
        <button class="btn-secondary" style="padding: 4px 10px; font-size: 11px;" onclick="clearLogs()">Clear Console</button>
      </div>
      <div class="log-box" id="logBox">
        <div style="color: #666; font-style: italic;">Waiting for incoming data transfers...</div>
      </div>
    </div>

    <!-- Network Discovery Card -->
    <div class="card">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <h2>Discovered Network Devices</h2>
        <button class="btn-primary" id="scanBtn" onclick="runNetworkScan()">
          <span id="scanBtnText">Scan Local Network (2.4G)</span>
        </button>
      </div>
      <p style="color: var(--muted); font-size: 12px; margin-bottom: 14px;">
        Scans your local Wi-Fi subnet for active ESP32 EEG streaming units.
      </p>

      <div id="deviceList">
        <p style="color: #666; font-size: 13px; font-style: italic;">Click "Scan Local Network" to search for connected ESP32 boards.</p>
      </div>
    </div>

    <!-- Manual IP Configuration Card -->
    <div class="card">
      <h2>Manual ESP32 IP Connection</h2>
      <p style="color: var(--muted); font-size: 12px; margin-bottom: 12px;">
        Enter the IP address shown in your ESP32 serial monitor if auto-discovery is bypassed.
      </p>
      <input type="text" id="manualIpInput" placeholder="http://192.168.155.39" value="{{ esp32_url }}">
      <div class="btn-group">
        <button class="btn-primary" onclick="setManualIp()">Connect to IP →</button>
      </div>
    </div>
  </div>

  <script>
    async function refreshStatus() {
      try {
        const res = await fetch('/status');
        const data = await res.json();
        document.getElementById('dispEspUrl').innerText = data.esp32Url;
        document.getElementById('dispPackets').innerText = data.packetsForwarded + ' pkts (' + data.totalSamples + ' samples)';
        document.getElementById('dispSessionSamples').innerText = (data.currentSessionSamples || 0) + ' samples in memory';
        
        const recBadge = document.getElementById('recBadge');
        const startBtn = document.getElementById('startBtn');
        const stopBtn = document.getElementById('stopBtn');

        if (data.recording) {
          if (startBtn) startBtn.disabled = true;
          if (stopBtn) stopBtn.disabled = false;
          recBadge.className = 'badge rec';
          recBadge.innerText = 'RECORDING (' + (data.sessionId || 'active') + ')';
        } else {
          if (startBtn) startBtn.disabled = false;
          if (stopBtn) stopBtn.disabled = true;
          recBadge.className = 'badge';
          recBadge.innerText = 'IDLE';
        }

        // Test ESP32 health
        const hRes = await fetch('/health');
        const hData = await hRes.json();
        document.getElementById('dispConnStatus').innerText = hData.esp32Online ? 'Online (HTTP 200 OK)' : 'Unreachable / Check IP';
        document.getElementById('dispConnStatus').style.color = hData.esp32Online ? '#34d399' : '#f87171';
      } catch (err) {
        console.error('Status fetch error:', err);
      }
    }

    async function fetchLogs() {
      try {
        const res = await fetch('/logs');
        const data = await res.json();
        const logs = data.logs || [];
        const box = document.getElementById('logBox');

        if (logs.length > 0) {
          box.innerHTML = '';
          logs.forEach(l => {
            let colorClass = 'dir-esp32';
            if (l.direction.includes('WebApp')) colorClass = 'dir-webapp';
            else if (l.direction.includes('Scan')) colorClass = 'dir-scan';
            else if (l.level === 'error' || l.level === 'warning') colorClass = 'dir-err';

            const div = document.createElement('div');
            div.className = 'log-entry';
            div.innerHTML = `<span class="log-time">[${l.timestamp}]</span><span class="log-dir ${colorClass}">[${l.direction}]</span><span>${escapeHtml(l.message)}</span>`;
            box.appendChild(div);
          });
          box.scrollTop = box.scrollHeight;
        }
      } catch (e) {
        console.error('Log fetch error:', e);
      }
    }

    function escapeHtml(text) {
      return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    function clearLogs() {
      document.getElementById('logBox').innerHTML = '<div style="color: #666; font-style: italic;">Console cleared.</div>';
    }

    async function setWebappUrl() {
      const url = document.getElementById('webappUrlInput').value.trim();
      if (!url) return;
      try {
        const res = await fetch('/set-webapp-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ webappUrl: url })
        });
        const data = await res.json();
        if (data.ok) {
          refreshStatus();
          fetchLogs();
        }
      } catch (err) {
        console.error('Failed setting WebApp URL:', err);
      }
    }

    async function runNetworkScan() {
      const btn = document.getElementById('scanBtn');
      const btnText = document.getElementById('scanBtnText');
      const list = document.getElementById('deviceList');

      btn.disabled = true;
      btnText.innerHTML = '<span class="spinner"></span>Scanning Subnet...';
      list.innerHTML = '<p style="color: var(--muted); font-size: 13px;"><span class="spinner"></span>Probing local network IPs...</p>';

      try {
        const res = await fetch('/scan');
        const data = await res.json();
        const devices = data.devices || [];

        if (devices.length === 0) {
          list.innerHTML = '<p style="color: #ef4444; font-size: 13px;">No ESP32 devices found on this subnet. Make sure the ESP32 is powered on and connected to the same Wi-Fi network.</p>';
        } else {
          list.innerHTML = '';
          devices.forEach(dev => {
            const div = document.createElement('div');
            div.className = 'device-item';
            div.innerHTML = `
              <div class="device-info">
                <div class="device-ip">${dev.ip}</div>
                <div class="device-meta">Device: <strong>${dev.deviceId}</strong> • RSSI: ${dev.wifiRssi} dBm • Mode: ${dev.mode}</div>
              </div>
              <button class="btn-primary" onclick="connectToScanned('${dev.ip}')">Connect</button>
            `;
            list.appendChild(div);
          });
        }
      } catch (err) {
        list.innerHTML = '<p style="color: #ef4444; font-size: 13px;">Scan failed: ' + err.message + '</p>';
      } finally {
        btn.disabled = false;
        btnText.innerText = 'Scan Local Network (2.4G)';
        refreshStatus();
        fetchLogs();
      }
    }

    async function setManualIp() {
      const ip = document.getElementById('manualIpInput').value.trim();
      if (!ip) return;
      await connectToScanned(ip);
    }

    async function connectToScanned(ip) {
      try {
        const res = await fetch('/set-esp32', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ esp32Url: ip })
        });
        const data = await res.json();
        refreshStatus();
        fetchLogs();
      } catch (err) {
        console.error('Failed setting ESP32 IP:', err);
      }
    }

    async function triggerStart() {
      const session = 'session_' + Date.now();
      const startBtn = document.getElementById('startBtn');
      const stopBtn = document.getElementById('stopBtn');
      if (startBtn) startBtn.disabled = true;
      if (stopBtn) stopBtn.disabled = false;

      try {
        await fetch('/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: session })
        });
        refreshStatus();
        fetchLogs();
      } catch (err) {
        console.error('Failed starting recording:', err);
        refreshStatus();
      }
    }

    async function triggerStop() {
      const startBtn = document.getElementById('startBtn');
      const stopBtn = document.getElementById('stopBtn');
      if (stopBtn) stopBtn.disabled = true;

      try {
        await fetch('/stop', { method: 'POST' });
        refreshStatus();
        fetchLogs();
      } catch (err) {
        console.error('Failed stopping recording:', err);
        refreshStatus();
      }
    }

    refreshStatus();
    fetchLogs();
    setInterval(refreshStatus, 3000);
    setInterval(fetchLogs, 1500);
  </script>
</body>
</html>
"""


@app.get("/")
def dashboard_page():
    return render_template_string(
        HTML_DASHBOARD,
        esp32_url=ESP32_URL,
        webapp_eeg_url=WEBAPP_EEG_URL,
        packets_forwarded=packets_forwarded,
        total_samples_sent=total_samples_sent
    )


@app.get("/logs")
def api_get_logs():
    with state_lock:
        return jsonify({
            "ok": True,
            "count": len(transfer_logs),
            "logs": list(transfer_logs)
        })


@app.get("/scan")
def api_scan_network():
    devices = scan_local_network()
    return jsonify({
        "ok": True,
        "count": len(devices),
        "devices": devices
    })


@app.post("/set-esp32")
def api_set_esp32():
    global ESP32_URL
    body = request.get_json(silent=True) or {}
    new_url = body.get("esp32Url", "").strip()

    if not new_url:
        return jsonify({"ok": False, "error": "Missing esp32Url"}), 400

    if not new_url.startswith("http://") and not new_url.startswith("https://"):
        new_url = f"http://{new_url}"

    new_url = new_url.rstrip("/")

    # Verify connection
    try:
        t0 = time.time()
        res = requests.get(f"{new_url}/health", headers={"X-API-Key": DEVICE_KEY}, timeout=3)
        latency_ms = int((time.time() - t0) * 1000)
        res.raise_for_status()
        health = res.json()
        add_log("Bridge", f"Verified connection to ESP32 at {new_url} ({latency_ms}ms, deviceId={health.get('deviceId')})")
    except Exception as e:
        add_log("BridgeError", f"Failed reaching ESP32 at {new_url}: {e}", level="error")
        return jsonify({"ok": False, "error": f"Failed reaching ESP32 at {new_url}: {e}"}), 502

    ESP32_URL = new_url
    return jsonify({
        "ok": True,
        "esp32Url": ESP32_URL,
        "device": health
    })


@app.post("/set-webapp-url")
def api_set_webapp_url():
    global WEBAPP_EEG_URL
    body = request.get_json(silent=True) or {}
    new_url = body.get("webappUrl", "").strip()

    if not new_url:
        return jsonify({"ok": False, "error": "Missing webappUrl"}), 400

    WEBAPP_EEG_URL = new_url
    add_log("Config", f"Online WebApp target URL updated to: {WEBAPP_EEG_URL}")

    return jsonify({
        "ok": True,
        "webappUrl": WEBAPP_EEG_URL
    })


@app.get("/status")
def bridge_status():
    with state_lock:
        buffered_count = len(session_samples_buffer)

    return jsonify({
        "deviceId": DEVICE_ID,
        "esp32Url": ESP32_URL,
        "webappEegUrl": WEBAPP_EEG_URL,
        "webappCommandUrl": WEBAPP_COMMAND_URL,
        "recording": recording,
        "sessionId": current_session_id,
        "currentSessionSamples": buffered_count,
        "packetsForwarded": packets_forwarded,
        "totalSamples": total_samples_sent,
        "lastPacketTime": last_packet_time
    })


@app.get("/health")
def bridge_health():
    esp_online = False
    ads_connected = False
    try:
        res = requests.get(f"{ESP32_URL}/health", headers={"X-API-Key": DEVICE_KEY}, timeout=1.5)
        if res.status_code == 200:
            esp_online = True
            data = res.json()
            ads_connected = bool(data.get("adsConnected", False))
    except Exception:
        esp_online = False

    return jsonify({
        "status": "healthy",
        "service": "instasight-phone-bridge",
        "deviceId": DEVICE_ID,
        "esp32Url": ESP32_URL,
        "esp32Online": esp_online,
        "adsConnected": ads_connected,
        "recording": recording,
        "sessionId": current_session_id
    })



@app.post("/start")
def local_start():
    body = request.get_json(silent=True) or {}
    session_id = body.get("sessionId") or request.args.get("session_id") or f"session_{int(time.time())}"
    add_log("LocalAPI", f"POST /start for session '{session_id}'")

    try:
        result = start_esp_recording(session_id)
        return jsonify(result)
    except Exception as error:
        add_log("LocalAPIError", f"Start failed: {error}", level="error")
        return jsonify({"ok": False, "error": str(error)}), 502


@app.post("/stop")
def local_stop():
    add_log("LocalAPI", "POST /stop -> Stopping recording, uploading dataset, and saving locally...")
    try:
        result = stop_esp_recording()
        return jsonify(result)
    except Exception as error:
        add_log("LocalAPIError", f"Stop failed: {error}", level="error")
        return jsonify({"ok": False, "error": str(error)}), 502


if __name__ == "__main__":
    add_log("Bridge", "=" * 60)
    add_log("Bridge", "Starting InstaSight Phone Bridge Simulator & Transfer Logger")
    add_log("Bridge", f"Target ESP32 URL:         {ESP32_URL}")
    add_log("Bridge", f"Target WebApp EEG URL:     {WEBAPP_EEG_URL}")
    add_log("Bridge", f"Target WebApp Command URL: {WEBAPP_COMMAND_URL}")
    add_log("Bridge", f"Dashboard Web UI:          http://localhost:{BRIDGE_PORT}")
    add_log("Bridge", "=" * 60)

    # Start background polling workers
    threading.Thread(target=eeg_polling_loop, daemon=True).start()
    threading.Thread(target=command_polling_loop, daemon=True).start()

    app.run(
        host="0.0.0.0",
        port=BRIDGE_PORT,
        debug=False
    )
