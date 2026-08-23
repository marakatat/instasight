#include <WiFi.h>
#include <WebServer.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_ADS1X15.h>

// =========================================================================
//  InstaSight - ESP32 EEG Local HTTP Server
// =========================================================================
//  Architecture:
//    ESP32 (Local HTTP Server) <-> Python Phone Bridge <-> Online Web App
//
//  Endpoints provided by ESP32:
//    GET  /health           - Device connectivity and WiFi stats
//    GET  /status           - Current recording state & buffer stats (X-API-Key)
//    POST /start?session_id - Starts recording for given session (X-API-Key)
//    POST /stop             - Stops recording and clears buffer (X-API-Key)
//    GET  /eeg              - Returns buffered samples & clears buffer (X-API-Key)
// =========================================================================

// ---------- Wi-Fi Configuration ----------
const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// ---------- API Security & Identity ----------
const char* API_KEY = "demo-device-key";
const char* DEVICE_ID = "esp32-eeg-01";

// ---------- Hardware / I2C Pins ----------
#define I2C_SDA_PIN 21
#define I2C_SCL_PIN 22
#define LED_PIN 2

// ---------- EEG Configuration ----------
const uint16_t SAMPLE_RATE = 250;                               // 250 Hz (SPS)
const uint32_t SAMPLE_INTERVAL_US = 1000000UL / SAMPLE_RATE;    // 4000 microseconds

const uint16_t BUFFER_SIZE = 500;
float eegBuffer[BUFFER_SIZE];
uint16_t eegCount = 0;

// ---------- State Variables ----------
bool recording = false;
String sessionId = "";
uint32_t sequence = 0;
uint32_t droppedSamples = 0;
uint32_t nextSampleTime = 0;
bool adsAvailable = false;

WebServer server(80);
Adafruit_ADS1115 ads;

const char* headerKeys[] = {
  "X-API-Key"
};

// ---------- Helpers ----------
void sendJsonResponse(int statusCode, const String& jsonStr) {
  server.send(statusCode, "application/json", jsonStr);
}

bool authorized() {
  if (server.hasHeader("X-API-Key")) {
    return server.header("X-API-Key") == API_KEY;
  }
  return false;
}

void handleUnauthorized() {
  StaticJsonDocument<256> response;
  response["ok"] = false;
  response["error"] = "unauthorized";
  String out;
  serializeJson(response, out);
  sendJsonResponse(401, out);
}

void clearBuffer() {
  eegCount = 0;
  droppedSamples = 0;
}

// Read sample from ADS1115 if available, otherwise synthetic EEG
float readEegSample() {
  if (adsAvailable) {
    // Read Channel 0 single-ended or differential (0-1)
    int16_t raw = ads.readADC_SingleEnded(0);
    // ADS1115 default gain +/- 6.144V: 0.1875mV per LSB -> in mV
    float millivolts = raw * 0.1875f;
    return millivolts;
  }

  // Realistic Synthetic EEG Demo Signal (Alpha wave ~10Hz + baseline noise)
  float t = millis() / 1000.0f;
  float alphaWave = 0.05f * sinf(2.0f * 3.14159f * 10.0f * t);
  float noise = (float)random(-50, 50) / 1000.0f;
  return 0.20f + alphaWave + noise;
}

// ---------- Route Handlers ----------

void handleHealth() {
  StaticJsonDocument<512> response;
  response["ok"] = true;
  response["deviceId"] = DEVICE_ID;
  response["ip"] = WiFi.localIP().toString();
  response["wifiRssi"] = WiFi.RSSI();
  response["recording"] = recording;
  response["sessionId"] = sessionId;
  response["adsConnected"] = adsAvailable;
  response["sampleRate"] = SAMPLE_RATE;

  String out;
  serializeJson(response, out);
  sendJsonResponse(200, out);
}

void handleStatus() {
  if (!authorized()) {
    handleUnauthorized();
    return;
  }

  StaticJsonDocument<512> response;
  response["ok"] = true;
  response["deviceId"] = DEVICE_ID;
  response["recording"] = recording;
  response["sessionId"] = sessionId;
  response["sampleRate"] = SAMPLE_RATE;
  response["bufferedSamples"] = eegCount;
  response["sequence"] = sequence;
  response["droppedSamples"] = droppedSamples;

  String out;
  serializeJson(response, out);
  sendJsonResponse(200, out);
}

void handleStart() {
  if (!authorized()) {
    handleUnauthorized();
    return;
  }

  // Accept session_id from query param or POST arg
  String sId = "";
  if (server.hasArg("session_id")) {
    sId = server.arg("session_id");
  } else if (server.hasArg("sessionId")) {
    sId = server.arg("sessionId");
  }

  if (sId.length() == 0) {
    StaticJsonDocument<256> response;
    response["ok"] = false;
    response["error"] = "missing session_id";
    String out;
    serializeJson(response, out);
    sendJsonResponse(400, out);
    return;
  }

  sessionId = sId;
  recording = true;
  sequence = 0;
  clearBuffer();
  nextSampleTime = micros();

  digitalWrite(LED_PIN, HIGH);

  StaticJsonDocument<512> response;
  response["ok"] = true;
  response["event"] = "recording_started";
  response["deviceId"] = DEVICE_ID;
  response["sessionId"] = sessionId;
  response["sampleRate"] = SAMPLE_RATE;
  response["startedAtMs"] = millis();

  String out;
  serializeJson(response, out);
  sendJsonResponse(200, out);
}

void handleStop() {
  if (!authorized()) {
    handleUnauthorized();
    return;
  }

  recording = false;
  digitalWrite(LED_PIN, LOW);

  StaticJsonDocument<512> response;
  response["ok"] = true;
  response["event"] = "recording_stopped";
  response["deviceId"] = DEVICE_ID;
  response["sessionId"] = sessionId;
  response["sequence"] = sequence;
  response["stoppedAtMs"] = millis();

  String out;
  serializeJson(response, out);
  sendJsonResponse(200, out);

  sessionId = "";
  clearBuffer();
}

void handleEeg() {
  if (!authorized()) {
    handleUnauthorized();
    return;
  }

  StaticJsonDocument<8192> response;
  response["ok"] = true;
  response["deviceId"] = DEVICE_ID;
  response["sessionId"] = sessionId;
  response["recording"] = recording;
  response["sequence"] = sequence;
  response["sampleRate"] = SAMPLE_RATE;
  response["deviceTimeMs"] = millis();

  JsonArray samples = response.createNestedArray("samples");
  for (uint16_t i = 0; i < eegCount; i++) {
    samples.add(eegBuffer[i]);
  }

  response["sampleCount"] = eegCount;
  response["droppedSamples"] = droppedSamples;

  sequence++;
  clearBuffer();

  String out;
  serializeJson(response, out);
  sendJsonResponse(200, out);
}

void handleNotFound() {
  StaticJsonDocument<256> response;
  response["ok"] = false;
  response["error"] = "endpoint_not_found";
  String out;
  serializeJson(response, out);
  sendJsonResponse(404, out);
}

// ---------- Wi-Fi Connection ----------
void connectToWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.print("Connecting to Wi-Fi");
  uint8_t retries = 0;
  while (WiFi.status() != WL_CONNECTED && retries < 40) {
    delay(500);
    Serial.print(".");
    retries++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[Wi-Fi] Connected!");
    Serial.print("[Wi-Fi] ESP32 IP Address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\n[Wi-Fi] Connection pending / timed out. Server still starting on STA.");
  }
}

// ---------- Web Server Setup ----------
void setupRoutes() {
  server.collectHeaders(headerKeys, 1);

  server.on("/health", HTTP_GET, handleHealth);
  server.on("/status", HTTP_GET, handleStatus);
  server.on("/start", HTTP_POST, handleStart);
  server.on("/stop", HTTP_POST, handleStop);
  server.on("/eeg", HTTP_GET, handleEeg);
  server.onNotFound(handleNotFound);

  server.begin();
  Serial.println("[HTTP] Server listening on port 80");
}

// ---------- Sampling Loop ----------
void sampleEegIfRequired() {
  if (!recording) {
    return;
  }

  uint32_t now = micros();
  if ((int32_t)(now - nextSampleTime) >= 0) {
    nextSampleTime += SAMPLE_INTERVAL_US;

    if (eegCount < BUFFER_SIZE) {
      eegBuffer[eegCount] = readEegSample();
      eegCount++;
    } else {
      droppedSamples++;
    }
  }
}

// ---------- Main Setup & Loop ----------
void setup() {
  Serial.begin(115200);
  delay(500);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  randomSeed(analogRead(0));

  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  if (ads.begin(0x48)) {
    adsAvailable = true;
    ads.setGain(GAIN_ONE); // +/- 4.096V 1 bit = 0.125mV
    Serial.println("[ADS1115] Initialized successfully.");
  } else {
    adsAvailable = false;
    Serial.println("[ADS1115] Not detected at 0x48. Using simulated EEG sensor mode.");
  }

  connectToWifi();
  setupRoutes();
}

void loop() {
  server.handleClient();
  sampleEegIfRequired();
}