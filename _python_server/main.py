"""
InstaSight Python Backend Server
Real-Time EEG Signal Processing, ESP32 Wi-Fi Ingestion, and Multimodal Next.js Bridge
"""

import asyncio
import socket
import logging
from typing import Dict, Any, List, Set, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from signal_processing import EEGProcessor
from feedback_engine import evaluate_multimodal_feedback
from simulator import EEGSyntheticGenerator

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("InstaSight")

# Initialize Signal Processor
eeg_processor = EEGProcessor(fs=250.0)

# Global State
latest_eeg_data: Dict[str, Any] = {
    "deviceId": "esp32-default",
    "signalQuality": 0.85,
    "motorAttemptProbability": 0.65,
    "confidence": 0.88,
    "erdPercentage": 14.5,
    "isAttemptDetected": True,
    "bands": {"delta": 3.2, "theta": 4.1, "alpha": 5.4, "mu": 2.8, "beta": 7.6, "gamma": 1.2},
    "filteredPreview": [],
    "timestamp": 0
}

# Simulator instance
simulator = EEGSyntheticGenerator(sample_rate=250, batch_size=25)
simulator_task: Optional[asyncio.Task] = None


class ConnectionManager:
    """Manages active WebSockets for both ESP32 hardware and Next.js Web Clients."""
    def __init__(self):
        self.esp_connections: Dict[str, WebSocket] = {}
        self.client_connections: Set[WebSocket] = set()

    async def connect_esp(self, device_id: str, websocket: WebSocket):
        await websocket.accept()
        self.esp_connections[device_id] = websocket
        logger.info(f"ESP32 Connected: {device_id} (Total ESPs: {len(self.esp_connections)})")

    def disconnect_esp(self, device_id: str):
        if device_id in self.esp_connections:
            del self.esp_connections[device_id]
            logger.info(f"ESP32 Disconnected: {device_id}")

    async def connect_client(self, websocket: WebSocket):
        await websocket.accept()
        self.client_connections.add(websocket)
        logger.info(f"Next.js Web Client Connected (Total Web Clients: {len(self.client_connections)})")

    def disconnect_client(self, websocket: WebSocket):
        self.client_connections.discard(websocket)
        logger.info(f"Next.js Web Client Disconnected (Remaining: {len(self.client_connections)})")

    async def broadcast_to_clients(self, payload: Dict[str, Any]):
        """Broadcast live EEG or feedback data to all connected Next.js web clients."""
        if not self.client_connections:
            return

        dead_connections = set()
        for client in self.client_connections:
            try:
                await client.send_json(payload)
            except Exception:
                dead_connections.add(client)

        for dead in dead_connections:
            self.disconnect_client(dead)


manager = ConnectionManager()


def get_local_ip_addresses() -> List[str]:
    """Helper to discover local LAN IPs to easily configure ESP32 Wi-Fi endpoints."""
    ips = []
    try:
        # Get primary outward IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.1)
        s.connect(("8.8.8.8", 80))
        primary_ip = s.getsockname()[0]
        s.close()
        ips.append(primary_ip)
    except Exception:
        pass

    try:
        for info in socket.getaddrinfo(socket.gethostname(), None):
            ip = info[4][0]
            if ip not in ips and not ip.startswith("127.") and ":" not in ip:
                ips.append(ip)
    except Exception:
        pass

    if not ips:
        ips.append("127.0.0.1")

    return ips


async def handle_simulated_packet(packet: dict):
    """Callback for synthetic EEG generator."""
    global latest_eeg_data
    samples = packet.get("samples", [])
    device_id = packet.get("deviceId", "esp32-simulated-01")

    # Process samples
    processed = eeg_processor.process_packet(samples)
    latest_eeg_data = {
        "deviceId": device_id,
        "sequence": packet.get("sequence", 0),
        "timestamp": packet.get("timestamp", 0),
        "source": "simulated",
        **processed
    }

    # Broadcast to Next.js clients
    await manager.broadcast_to_clients({
        "type": "eeg_telemetry",
        "data": latest_eeg_data
    })


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Start simulator in background so the app immediately streams telemetry
    global simulator_task
    logger.info("Starting default simulated EEG feed...")
    simulator_task = asyncio.create_task(simulator.start(handle_simulated_packet))
    yield
    # Shutdown
    simulator.stop()
    if simulator_task:
        simulator_task.cancel()


app = FastAPI(
    title="InstaSight EEG & Multimodal Backend",
    description="Bridge for ESP32 hardware streaming, real-time signal processing, and Next.js multimodal rehabilitation coaching.",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for Next.js (Local or Cloud-hosted like Vercel)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Pydantic Data Models ---

class EegPacketModel(BaseModel):
    deviceId: str = Field(default="esp32-demo-01", description="Identifier of the ESP32 unit")
    sequence: int = Field(default=0, description="Packet sequence counter")
    samples: List[float] = Field(..., description="List of raw microvolt or ADC float readings")
    overrideProbability: Optional[float] = Field(default=None, description="Optional manual intent override")


class PoseDataModel(BaseModel):
    shoulderAngle: Optional[float] = Field(default=None, description="Shoulder angle in degrees")
    elbowAngle: Optional[float] = Field(default=None, description="Elbow angle in degrees")
    movementDurationMs: Optional[int] = Field(default=2500, description="Movement time in ms")
    rangeOfMotion: Optional[float] = Field(default=None, description="Max ROM angle reached")
    poseConfidence: float = Field(default=0.9, description="MediaPipe detection confidence")
    repetitionNumber: Optional[int] = Field(default=1, description="Current rep number")
    exercisePhase: Optional[str] = Field(default="complete", description="Exercise phase")


class CombineFeedbackRequest(BaseModel):
    sessionId: str = Field(default="session_demo")
    exerciseId: str = Field(default="right_arm_raise")
    videoTimeMs: int = Field(default=0)
    pose: PoseDataModel
    eeg: Optional[Dict[str, Any]] = None


# --- WebSocket Endpoints ---

@app.websocket("/ws/eeg/{device_id}")
async def esp32_eeg_stream(websocket: WebSocket, device_id: str):
    """
    WebSocket endpoint for ESP32 hardware to stream raw/batched EEG readings.
    ESP32 sends JSON: {"sequence": 123, "samples": [0.1, 0.4, ...]}
    """
    await manager.connect_esp(device_id, websocket)
    global latest_eeg_data

    try:
        while True:
            packet = await websocket.receive_json()
            samples_f = packet.get("samples", [])
            samples_o = packet.get("samples_o", [])
            seq = packet.get("sequence", 0)

            # Signal processing on primary Frontal channel
            processed = eeg_processor.process_packet(samples_f)
            
            # If Occipital channel is also provided, process it for multi-channel insight
            processed_o = eeg_processor.process_packet(samples_o) if samples_o else None

            result = {
                "deviceId": device_id,
                "sequence": seq,
                "source": "esp32_hardware",
                **processed,
                "occipital": processed_o
            }

            latest_eeg_data = result

            # Send ack/result back to ESP32
            await websocket.send_json({
                "status": "ok",
                "sequence": seq,
                "signalQuality": processed["signalQuality"],
                "motorAttemptProbability": processed["motorAttemptProbability"]
            })

            # Broadcast live telemetry to all connected Next.js Web Clients
            await manager.broadcast_to_clients({
                "type": "eeg_telemetry",
                "data": result
            })

    except WebSocketDisconnect:
        manager.disconnect_esp(device_id)
    except Exception as e:
        logger.error(f"Error in ESP32 stream {device_id}: {e}")
        manager.disconnect_esp(device_id)


@app.websocket("/ws/client/{client_id}")
@app.websocket("/ws/stream")
async def nextjs_client_stream(websocket: WebSocket, client_id: str = "web-client"):
    """
    WebSocket endpoint for Next.js browser app to receive real-time EEG telemetry
    and combined exercise feedback events.
    """
    await manager.connect_client(websocket)

    # Immediately push latest cached telemetry to new client
    try:
        await websocket.send_json({
            "type": "initial_state",
            "data": latest_eeg_data
        })

        while True:
            # Keep connection alive and accept client commands if any
            msg = await websocket.receive_json()
            if msg.get("action") == "ping":
                await websocket.send_json({"type": "pong"})
            elif msg.get("action") == "get_latest":
                await websocket.send_json({"type": "eeg_telemetry", "data": latest_eeg_data})

    except WebSocketDisconnect:
        manager.disconnect_client(websocket)
    except Exception as e:
        logger.error(f"Error in web client stream {client_id}: {e}")
        manager.disconnect_client(websocket)


# --- REST Endpoints ---

@app.get("/api/status")
def get_server_status():
    """Returns server health, LAN IP configuration, active ESP32 connections, and Web clients."""
    lan_ips = get_local_ip_addresses()
    return {
        "status": "healthy",
        "lanIps": lan_ips,
        "espWsEndpoint": [f"ws://{ip}:8000/ws/eeg/<device_id>" for ip in lan_ips],
        "nextjsWsEndpoint": [f"ws://{ip}:8000/ws/client/<client_id>" for ip in lan_ips] + ["ws://localhost:8000/ws/stream"],
        "connectedEsps": list(manager.esp_connections.keys()),
        "connectedWebClients": len(manager.client_connections),
        "simulatorActive": simulator.is_running,
        "latestEegSummary": {
            "signalQuality": latest_eeg_data.get("signalQuality"),
            "motorAttemptProbability": latest_eeg_data.get("motorAttemptProbability"),
            "source": latest_eeg_data.get("source", "simulated")
        }
    }


@app.get("/api/eeg/latest")
def get_latest_eeg():
    """Retrieve the most recent EEG telemetry reading."""
    return latest_eeg_data


@app.post("/api/eeg/packet")
async def ingest_eeg_packet(packet: EegPacketModel):
    """
    HTTP POST alternative to send EEG batches (useful for HTTP-only microcontrollers or scripts).
    """
    global latest_eeg_data
    processed = eeg_processor.process_packet(packet.samples, override_prob=packet.overrideProbability)

    result = {
        "deviceId": packet.deviceId,
        "sequence": packet.sequence,
        "source": "http_api",
        **processed
    }
    latest_eeg_data = result

    # Broadcast to Next.js clients
    await manager.broadcast_to_clients({
        "type": "eeg_telemetry",
        "data": result
    })

    return result


@app.post("/api/feedback/combine")
async def combine_feedback(request: CombineFeedbackRequest):
    """
    Receives Pose features from Next.js (Camera tracker) and combines them with
    the latest real-time EEG state to produce targeted exercise coaching.
    """
    pose_dict = request.pose.model_dump()
    eeg_data = request.eeg if request.eeg is not None else latest_eeg_data

    feedback = evaluate_multimodal_feedback(
        pose=pose_dict,
        eeg=eeg_data,
        exercise_id=request.exerciseId,
        session_id=request.sessionId,
        video_time_ms=request.videoTimeMs
    )

    # Broadcast the combined feedback event over WebSocket to all subscribers
    await manager.broadcast_to_clients({
        "type": "feedback_event",
        "data": feedback
    })

    return feedback


@app.post("/api/simulator/start")
def start_simulator():
    """Start the synthetic EEG generator stream."""
    global simulator_task
    if not simulator.is_running:
        simulator_task = asyncio.create_task(simulator.start(handle_simulated_packet))
        return {"status": "started", "message": "Synthetic EEG generator running"}
    return {"status": "already_running"}


@app.post("/api/simulator/stop")
def stop_simulator():
    """Stop the synthetic EEG generator."""
    simulator.stop()
    return {"status": "stopped", "message": "Synthetic EEG generator stopped"}


if __name__ == "__main__":
    import uvicorn
    # Bind to 0.0.0.0 so ESP32 on the local Wi-Fi LAN can connect via laptop IP
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
