/*
 * InstaSight - ESP32 EEG Streamer
 * Reads analog ADC or ADS1115 sensor values and streams JSON batches
 * over Wi-Fi via WebSockets to the local FastAPI Python backend.
 *
 * Dependencies (Arduino IDE / PlatformIO):
 * - ArduinoJson (by Benoit Blanchon)
 * - WebSockets (by Markus Sattler)
 */

#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

// ================= USER CONFIGURATION =================
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Replace with your laptop's local LAN IP address (found via /api/status or `ip a` / `ipconfig`)
const char* SERVER_HOST   = "192.168.1.100"; 
const int   SERVER_PORT   = 8000;
const char* DEVICE_ID     = "esp32-demo-01";

// Analog Pin for EEG / ADS1115 signal (GPIO 34 ADC1)
const int EEG_PIN          = 34;

// Sampling configuration: 250 Hz sample rate, send batch every 25 samples (100 ms)
const int SAMPLE_RATE_HZ   = 250;
const int SAMPLE_INTERVAL_US = 1000000 / SAMPLE_RATE_HZ; // 4000 microseconds
const int BATCH_SIZE       = 25;
// ======================================================

WebSocketsClient webSocket;
unsigned long lastSampleTime = 0;
float sampleBuffer[BATCH_SIZE];
int sampleIndex = 0;
unsigned long sequenceCounter = 0;

void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch(type) {
    case WStype_DISCONNECTED:
      Serial.println("[WS] Disconnected from Python server");
      break;
    case WStype_CONNECTED:
      Serial.printf("[WS] Connected to ws://%s:%d/ws/eeg/%s\n", SERVER_HOST, SERVER_PORT, DEVICE_ID);
      break;
    case WStype_TEXT:
      // Feedback/telemetry acknowledgment from Python server
      Serial.printf("[WS RX] %s\n", payload);
      break;
    case WStype_BIN:
    case WStype_ERROR:
      break;
  }
}

void sendBatch() {
  StaticJsonDocument<1024> doc;
  doc["deviceId"] = DEVICE_ID;
  doc["sequence"] = ++sequenceCounter;
  
  JsonArray samplesArray = doc.createNestedArray("samples");
  for (int i = 0; i < BATCH_SIZE; i++) {
    samplesArray.add(sampleBuffer[i]);
  }

  String jsonOutput;
  serializeJson(doc, jsonOutput);
  webSocket.sendTXT(jsonOutput);
  
  sampleIndex = 0;
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n--- InstaSight ESP32 EEG Streamer ---");

  // Configure ADC (12-bit resolution: 0 - 4095)
  analogReadResolution(12);
  pinMode(EEG_PIN, INPUT);

  // Connect to Wi-Fi
  Serial.printf("Connecting to Wi-Fi: %s", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n[WiFi] Connected! IP: " + WiFi.localIP().toString());

  // Configure WebSocket Client
  String wsPath = String("/ws/eeg/") + DEVICE_ID;
  webSocket.begin(SERVER_HOST, SERVER_PORT, wsPath.c_str());
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(2000);
}

void loop() {
  webSocket.loop();

  unsigned long currentMicros = micros();
  if (currentMicros - lastSampleTime >= SAMPLE_INTERVAL_US) {
    lastSampleTime = currentMicros;

    // Read analog voltage (0 to 3.3V centered around 1.65V)
    int rawAdc = analogRead(EEG_PIN);
    float voltage = (rawAdc / 4095.0) * 3.3;
    // Microvolts relative to mid-rail
    float microvolts = (voltage - 1.65) * 1000.0;

    sampleBuffer[sampleIndex++] = microvolts;

    if (sampleIndex >= BATCH_SIZE) {
      if (webSocket.isConnected()) {
        sendBatch();
      } else {
        sampleIndex = 0; // reset if not connected
      }
    }
  }
}
