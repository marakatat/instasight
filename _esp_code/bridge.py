"""
InstaSight - Python Phone Bridge Simulator
=========================================
Acts as a bridge between the ESP32 on the local Wi-Fi network and the online web app.

Architecture:
  ESP32 (LAN) <--- HTTP ---> Python Phone Bridge (LAN) <--- HTTPS ---> Online Web App (Cloud/Public)

Usage:
  python bridge.py
"""

import os
import time
import threading
import logging
from datetime import datetime, timezone
from typing import Optional

import requests
from flask import Flask, jsonify, request

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S"
)
logger = logging.getLogger("PhoneBridge")

app = Flask(__name__)

# Configuration via environment variables
ESP32_URL = os.environ.get("ESP32_URL", "http://192.168.1.42").rstrip("/")
WEBAPP_EEG_URL = os.environ.get("WEBAPP_EEG_URL", "http://localhost:3000/api/eeg")
WEBAPP_COMMAND_URL = os.environ.get("WEBAPP_COMMAND_URL", "http://localhost:3000/api/device/commands/next")
DEVICE_ID = os.environ.get("DEVICE_ID", "esp32-eeg-01")
DEVICE_KEY = os.environ.get("DEVICE_KEY", "demo-device-key")
BRIDGE_TOKEN = os.environ.get("BRIDGE_TOKEN", "demo-bridge-token")
BRIDGE_PORT = int(os.environ.get("PORT", "5001"))

# Bridge runtime state
current_session_id: Optional[str] = None
recording: bool = False
last_command_id: Optional[str] = None
state_lock = threading.Lock()


def esp_headers() -> dict:
    return {
        "X-API-Key": DEVICE_KEY
    }


def start_esp_recording(session_id: str) -> dict:
    global current_session_id, recording
    logger.info(f"Issuing START to ESP32 ({ESP32_URL}) for session: {session_id}")

    response = requests.post(
        f"{ESP32_URL}/start",
        params={"session_id": session_id},
        headers=esp_headers(),
        timeout=4
    )
    response.raise_for_status()

    with state_lock:
        current_session_id = session_id
        recording = True

    data = response.json()
    logger.info(f"ESP32 recording started successfully: {data}")
    return data


def stop_esp_recording() -> dict:
    global current_session_id, recording
    logger.info(f"Issuing STOP to ESP32 ({ESP32_URL})")

    response = requests.post(
        f"{ESP32_URL}/stop",
        headers=esp_headers(),
        timeout=4
    )
    response.raise_for_status()

    with state_lock:
        current_session_id = None
        recording = False

    data = response.json()
    logger.info(f"ESP32 recording stopped successfully: {data}")
    return data


def read_eeg_from_esp() -> dict:
    response = requests.get(
        f"{ESP32_URL}/eeg",
        headers=esp_headers(),
        timeout=3
    )
    response.raise_for_status()
    return response.json()


def forward_eeg_to_webapp(eeg_packet: dict) -> requests.Response:
    payload = {
        "deviceId": DEVICE_ID,
        "sessionId": eeg_packet.get("sessionId") or current_session_id,
        "sequence": eeg_packet.get("sequence", 0),
        "deviceTimeMs": eeg_packet.get("deviceTimeMs", 0),
        "sampleRate": eeg_packet.get("sampleRate", 250),
        "samples": eeg_packet.get("samples", []),
        "sampleCount": eeg_packet.get("sampleCount", 0),
        "droppedSamples": eeg_packet.get("droppedSamples", 0),
        "receivedAt": datetime.now(timezone.utc).isoformat(),
        "source": "esp32-bridge"
    }

    response = requests.post(
        WEBAPP_EEG_URL,
        json=payload,
        headers={
            "Authorization": f"Bearer {BRIDGE_TOKEN}",
            "Content-Type": "application/json"
        },
        timeout=5
    )
    response.raise_for_status()
    return response


def eeg_polling_loop():
    logger.info("EEG polling thread started")
    while True:
        try:
            is_rec = False
            with state_lock:
                is_rec = recording

            if is_rec:
                packet = read_eeg_from_esp()
                sample_count = packet.get("sampleCount", 0)

                if sample_count > 0:
                    try:
                        forward_eeg_to_webapp(packet)
                        logger.debug(f"Forwarded {sample_count} samples (seq: {packet.get('sequence')})")
                    except Exception as forward_err:
                        logger.warning(f"Failed forwarding to webapp: {forward_err}")

        except requests.exceptions.RequestException as net_err:
            logger.debug(f"ESP32 polling network wait/error: {net_err}")
        except Exception as error:
            logger.error(f"EEG bridge error: {error}")

        time.sleep(0.1)


def command_polling_loop():
    global last_command_id
    logger.info("Command polling thread started")

    while True:
        try:
            response = requests.get(
                WEBAPP_COMMAND_URL,
                params={"deviceId": DEVICE_ID},
                headers={
                    "Authorization": f"Bearer {BRIDGE_TOKEN}"
                },
                timeout=5
            )

            if response.status_code == 200:
                command = response.json()
                command_id = command.get("commandId") or command.get("id")
                command_type = (command.get("command") or command.get("type") or "").upper()
                session_id = command.get("sessionId") or "cloud-session"

                if command_id and command_id != last_command_id:
                    if command_type in ("START", "START_STREAM"):
                        logger.info(f"Received START command from webapp for session: {session_id}")
                        try:
                            start_esp_recording(session_id)
                        except Exception as e:
                            logger.error(f"Failed to start ESP recording: {e}")

                    elif command_type in ("STOP", "STOP_STREAM"):
                        logger.info("Received STOP command from webapp")
                        try:
                            stop_esp_recording()
                        except Exception as e:
                            logger.error(f"Failed to stop ESP recording: {e}")

                    last_command_id = command_id

        except requests.exceptions.RequestException:
            # Silent retry when webapp server is offline or unreachable
            pass
        except Exception as error:
            logger.error(f"Command polling error: {error}")

        time.sleep(1.0)


# ---------- Local Flask Bridge Endpoints ----------

@app.get("/health")
def bridge_health():
    return jsonify({
        "status": "healthy",
        "service": "instasight-phone-bridge",
        "deviceId": DEVICE_ID,
        "esp32Url": ESP32_URL,
        "recording": recording,
        "sessionId": current_session_id
    })


@app.get("/status")
def bridge_status():
    return jsonify({
        "deviceId": DEVICE_ID,
        "esp32Url": ESP32_URL,
        "webappEegUrl": WEBAPP_EEG_URL,
        "webappCommandUrl": WEBAPP_COMMAND_URL,
        "recording": recording,
        "sessionId": current_session_id
    })


@app.post("/start")
def local_start():
    body = request.get_json(silent=True) or {}
    session_id = body.get("sessionId") or request.args.get("session_id") or "local-phone-session"

    try:
        result = start_esp_recording(session_id)
        return jsonify(result)
    except Exception as error:
        logger.error(f"Error executing local /start: {error}")
        return jsonify({
            "ok": False,
            "error": str(error)
        }), 502


@app.post("/stop")
def local_stop():
    try:
        result = stop_esp_recording()
        return jsonify(result)
    except Exception as error:
        logger.error(f"Error executing local /stop: {error}")
        return jsonify({
            "ok": False,
            "error": str(error)
        }), 502


if __name__ == "__main__":
    logger.info("=" * 60)
    logger.info("Starting InstaSight Phone Bridge Simulator")
    logger.info(f"Target ESP32 URL:        {ESP32_URL}")
    logger.info(f"Target WebApp EEG URL:    {WEBAPP_EEG_URL}")
    logger.info(f"Target WebApp Cmd URL:    {WEBAPP_COMMAND_URL}")
    logger.info(f"Device ID:                {DEVICE_ID}")
    logger.info(f"Bridge Local Port:        {BRIDGE_PORT}")
    logger.info("=" * 60)

    # Start background polling threads
    threading.Thread(target=eeg_polling_loop, daemon=True).start()
    threading.Thread(target=command_polling_loop, daemon=True).start()

    app.run(
        host="0.0.0.0",
        port=BRIDGE_PORT,
        debug=False
    )
