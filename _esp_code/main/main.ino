#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_ADS1X15.h>

// =========================================================================
//  InstaSight - ESP32 EEG Server & Web Wi-Fi Configuration
// =========================================================================
//  Architecture:
//  - Starts in Station mode if credentials exist in NVS.
//  - If no credentials or connection fails, starts AP ("InstaSight-ESP32-Setup" at 192.168.4.1).
//  - Web portal on port 80 handles both AP setup and live Station status.
//  - Protected against FreeRTOS stack overflow, WDT resets, and route re-entry.
// =========================================================================

// ---------- Hardware Pins ----------
#define I2C_SDA_PIN 21
#define I2C_SCL_PIN 22
#define LED_PIN 2

// ---------- AP Configuration ----------
const char* AP_SSID = "InstaSight-ESP32-Setup";
const char* AP_PASS = ""; // Open AP
const IPAddress AP_IP(192, 168, 4, 1);
const IPAddress AP_NETMASK(255, 255, 255, 0);
const byte DNS_PORT = 53;

// ---------- API Security & Identity ----------
const char* API_KEY = "demo-device-key";
const char* DEVICE_ID = "esp32-eeg-01";

// ---------- EEG Configuration ----------
const uint16_t SAMPLE_RATE = 250;
const uint32_t SAMPLE_INTERVAL_US = 1000000UL / SAMPLE_RATE;

const uint16_t BUFFER_SIZE = 500;
float eegBuffer[BUFFER_SIZE];
uint16_t eegCount = 0;

// ---------- Global State & Storage ----------
Preferences prefs;
WebServer server(80);
DNSServer dnsServer;
Adafruit_ADS1115 ads;

String wifiSsid = "";
String wifiPassword = "";

bool isApMode = false;
bool recording = false;
String sessionId = "";
uint32_t sequence = 0;
uint32_t droppedSamples = 0;
uint32_t nextSampleTime = 0;
bool adsAvailable = false;
bool routesConfigured = false;
bool serverRunning = false;

// Diagnostics
volatile int lastDisconnectReason = 0;
unsigned long disconnectStartTime = 0;
unsigned long lastLedBlinkTime = 0;
bool ledState = false;

const char* headerKeys[] = {
  "X-API-Key"
};

// =========================================================================
//  Disconnect Reason Decoder
// =========================================================================
String getDisconnectReasonDescription(int reason) {
  switch (reason) {
    case 0:   return "No error / Initializing";
    case 1:   return "UNSPECIFIED: General Wi-Fi subsystem error.";
    case 2:   return "AUTH_EXPIRE: Authentication expired by router.";
    case 3:   return "AUTH_LEAVE: Deauthenticated because sending STA is leaving.";
    case 4:   return "ASSOC_EXPIRE: Association expired due to inactivity.";
    case 5:   return "ASSOC_TOOMANY: Router has reached maximum client capacity.";
    case 6:   return "NOT_AUTHED: Class 2 frame received from nonauthenticated STA.";
    case 7:   return "NOT_ASSOCED: Class 3 frame received from nonassociated STA.";
    case 8:   return "ASSOC_LEAVE: Deassociated because sending STA is leaving.";
    case 9:   return "ASSOC_NOT_AUTHED: Association requested before authentication was complete.";
    case 15:  return "4WAY_HANDSHAKE_TIMEOUT: Handshake timed out. WRONG PASSWORD or weak signal.";
    case 200: return "BEACON_TIMEOUT: Lost router beacon. Weak signal or router went offline.";
    case 201: return "NO_AP_FOUND: Target SSID was not found. Verify router has 2.4 GHz active.";
    case 202: return "AUTH_FAIL: Password rejected by router (Authentication Failure).";
    case 203: return "ASSOC_FAIL: Association failed. Router rejected device.";
    case 204: return "HANDSHAKE_TIMEOUT: 4-Way Handshake timeout. Check Wi-Fi password.";
    case 205: return "CONNECTION_FAIL: Internal station connection failure.";
    default:  return "Error code " + String(reason) + ": Unable to connect to AP.";
  }
}

// =========================================================================
//  Storage Helpers (NVS)
// =========================================================================
void loadCredentials() {
  prefs.begin("instasight", true);
  wifiSsid = prefs.getString("ssid", "");
  wifiPassword = prefs.getString("pass", "");
  prefs.end();

  Serial.print("[NVS] Loaded SSID: ");
  Serial.println(wifiSsid.length() > 0 ? wifiSsid : "(None saved)");
}

void saveCredentials(const String& ssid, const String& pass) {
  prefs.begin("instasight", false);
  prefs.putString("ssid", ssid);
  prefs.putString("pass", pass);
  prefs.end();

  wifiSsid = ssid;
  wifiPassword = pass;
  Serial.println("[NVS] Saved Wi-Fi credentials for: " + ssid);
}

void clearCredentials() {
  prefs.begin("instasight", false);
  prefs.clear();
  prefs.end();

  wifiSsid = "";
  wifiPassword = "";
  Serial.println("[NVS] Credentials cleared.");
}

// =========================================================================
//  Helpers
// =========================================================================
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

float readEegSample() {
  if (adsAvailable) {
    int16_t raw = ads.readADC_SingleEnded(0);
    return raw * 0.1875f;
  }
  float t = millis() / 1000.0f;
  float alphaWave = 0.05f * sinf(2.0f * 3.14159f * 10.0f * t);
  float noise = (float)random(-50, 50) / 1000.0f;
  return 0.20f + alphaWave + noise;
}

// Lightweight Wi-Fi Event listener (no heavy allocations in ISR context)
void onWiFiEvent(WiFiEvent_t event, WiFiEventInfo_t info) {
  if (event == ARDUINO_EVENT_WIFI_STA_DISCONNECTED) {
    lastDisconnectReason = info.wifi_sta_disconnected.reason;
  }
}

// =========================================================================
//  Web Portal HTML
// =========================================================================
void handleRootPage() {
  if (isApMode) {
    // Scan networks safely
    int n = WiFi.scanComplete();
    if (n < 0) {
      n = WiFi.scanNetworks(false, true);
    }

    String scanOptions = "";
    if (n > 0) {
      for (int i = 0; i < n; ++i) {
        String ssid = WiFi.SSID(i);
        int rssi = WiFi.RSSI(i);
        String sec = (WiFi.encryptionType(i) == WIFI_AUTH_OPEN) ? "Open" : "Encrypted";
        scanOptions += "<option value='" + ssid + "'>" + ssid + " (" + String(rssi) + " dBm, " + sec + ")</option>";
      }
    }

    String reasonDesc = getDisconnectReasonDescription(lastDisconnectReason);

    String page = "<!DOCTYPE html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>";
    page += "<title>InstaSight - Wi-Fi Setup</title>";
    page += "<style>";
    page += "body{font-family:-apple-system,BlinkMacSystemFont,monospace;background:#000;color:#fff;padding:24px;max-width:480px;margin:auto;}";
    page += ".card{background:#111;border:1px solid #262626;border-radius:12px;padding:24px;margin-bottom:16px;}";
    page += ".err-box{background:#2b1010;border:1px solid #ef4444;color:#fca5a5;padding:12px;border-radius:8px;font-size:12px;line-height:1.4;margin:16px 0;}";
    page += "label{display:block;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#888;margin:14px 0 6px 0;}";
    page += "input,select{width:100%;box-sizing:border-box;background:#1a1a1a;border:1px solid #333;color:#fff;padding:12px;border-radius:6px;font-size:14px;font-family:monospace;margin-bottom:8px;}";
    page += "input:focus,select:focus{outline:none;border-color:#fff;}";
    page += ".pw-wrapper{position:relative;display:flex;align-items:center;margin-bottom:8px;}";
    page += ".pw-wrapper input{margin-bottom:0;padding-right:44px;}";
    page += ".pw-toggle{position:absolute;right:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;user-select:none;}";
    page += ".pw-toggle:hover svg{stroke:#fff;}";
    page += ".btn{display:block;width:100%;box-sizing:border-box;text-align:center;padding:14px;background:#fff;color:#000;font-weight:bold;font-size:13px;letter-spacing:0.05em;border-radius:6px;border:none;cursor:pointer;margin-top:18px;text-decoration:none;}";
    page += ".badge{display:inline-block;padding:3px 8px;border-radius:4px;font-size:10px;letter-spacing:0.1em;text-transform:uppercase;font-weight:bold;background:#f59e0b;color:#000;}";
    page += "</style></head><body>";
    page += "<div class='card'>";
    page += "<span class='badge'>Setup Mode (AP)</span>";
    page += "<h2 style='margin:12px 0 4px 0;font-size:22px;'>Connect to Wi-Fi</h2>";
    page += "<p style='color:#666;font-size:12px;margin:0 0 16px 0;'>Device ID: <strong style='color:#fff;'>" + String(DEVICE_ID) + "</strong></p>";

    if (lastDisconnectReason != 0) {
      page += "<div class='err-box'><strong>Last Connection Notice:</strong><br>" + reasonDesc + "</div>";
    }

    page += "<form method='POST' action='/save'>";
    
    if (n > 0) {
      page += "<label>Detected Nearby 2.4 GHz Networks</label>";
      page += "<select onchange=\"document.getElementById('ssidInput').value = this.value;\">";
      page += "<option value=''>-- Choose Network --</option>" + scanOptions;
      page += "</select>";
    }

    page += "<label>Network Name (SSID)</label>";
    page += "<input type='text' id='ssidInput' name='ssid' value='" + wifiSsid + "' placeholder='e.g. MyHomeNetwork' required>";
    page += "<label>Password</label>";
    page += "<div class='pw-wrapper'>";
    page += "<input type='password' id='pwInput' name='password' placeholder='Enter password'>";
    page += "<span class='pw-toggle' onclick='togglePw()' title='Toggle Password Visibility'>";
    page += "<svg id='eyeIcon' width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='#888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>";
    page += "<path d='M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z'></path><circle cx='12' cy='12' r='3'></circle>";
    page += "</svg></span></div>";
    page += "<button type='submit' class='btn'>SAVE & CONNECT →</button>";
    page += "</form>";
    page += "</div>";
    page += "<p style='font-size:11px;color:#555;text-align:center;line-height:1.5;'>ESP32 connects to 2.4 GHz networks only.</p>";
    page += "<script>";
    page += "function togglePw(){";
    page += "var p=document.getElementById('pwInput');var e=document.getElementById('eyeIcon');";
    page += "if(p.type==='password'){";
    page += "p.type='text';";
    page += "e.innerHTML='<path d=\"M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24\"></path><line x1=\"1\" y1=\"1\" x2=\"23\" y2=\"23\"></line>';";
    page += "e.setAttribute('stroke','#fff');";
    page += "}else{";
    page += "p.type='password';";
    page += "e.innerHTML='<path d=\"M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8z\"></path><circle cx=\"12\" cy=\"12\" r=\"3\"></circle>';";
    page += "e.setAttribute('stroke','#888');";
    page += "}}";
    page += "</script>";
    page += "</body></html>";

    server.send(200, "text/html", page);
  } else {
    // Station Mode Dashboard
    String page = "<!DOCTYPE html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>";
    page += "<title>InstaSight ESP32 Dashboard</title>";
    page += "<style>";
    page += "body{font-family:-apple-system,BlinkMacSystemFont,monospace;background:#000;color:#fff;padding:24px;max-width:480px;margin:auto;}";
    page += ".card{background:#111;border:1px solid #262626;border-radius:12px;padding:24px;margin-bottom:16px;}";
    page += ".btn-danger{display:block;width:100%;box-sizing:border-box;text-align:center;padding:12px;background:#ef4444;color:#fff;font-weight:bold;border-radius:6px;text-decoration:none;font-size:12px;margin-top:16px;}";
    page += ".badge{display:inline-block;padding:3px 8px;border-radius:4px;font-size:10px;letter-spacing:0.1em;text-transform:uppercase;font-weight:bold;background:#10b981;color:#000;}";
    page += ".row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #222;font-size:13px;}";
    page += "</style></head><body>";
    page += "<div class='card'>";
    page += "<span class='badge'>Online & Ready</span>";
    page += "<h2 style='margin:12px 0 4px 0;'>ESP32 EEG Unit</h2>";
    page += "<p style='color:#666;font-size:12px;margin:0 0 16px 0;'>Device ID: <strong>" + String(DEVICE_ID) + "</strong></p>";
    page += "<div class='row'><span style='color:#888;'>Local IP</span><strong>" + WiFi.localIP().toString() + "</strong></div>";
    page += "<div class='row'><span style='color:#888;'>Wi-Fi SSID</span><strong>" + wifiSsid + "</strong></div>";
    page += "<div class='row'><span style='color:#888;'>Signal (RSSI)</span><strong>" + String(WiFi.RSSI()) + " dBm</strong></div>";
    page += "<div class='row'><span style='color:#888;'>Sensor Mode</span><strong>" + String(adsAvailable ? "ADS1115 (0x48)" : "Simulated Demo") + "</strong></div>";
    page += "<div class='row'><span style='color:#888;'>Sampling Rate</span><strong>" + String(SAMPLE_RATE) + " Hz</strong></div>";
    page += "<div class='row'><span style='color:#888;'>Recording</span><strong>" + String(recording ? "Active (" + sessionId + ")" : "Idle") + "</strong></div>";
    page += "<a href='/reset-wifi' onclick=\"return confirm('Reset Wi-Fi credentials and open setup portal?');\" class='btn-danger'>RESET WI-FI & ENTER SETUP</a>";
    page += "</div>";
    page += "</body></html>";

    server.send(200, "text/html", page);
  }
}

void handleSaveWifi() {
  if (!server.hasArg("ssid")) {
    server.send(400, "text/plain", "Missing SSID parameter");
    return;
  }

  String newSsid = server.arg("ssid");
  String newPass = server.hasArg("password") ? server.arg("password") : "";
  newSsid.trim();
  newPass.trim();

  if (newSsid.length() == 0) {
    server.send(400, "text/plain", "SSID cannot be empty");
    return;
  }

  saveCredentials(newSsid, newPass);

  String resp = "<!DOCTYPE html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>";
  resp += "<body style='background:#000;color:#fff;font-family:monospace;text-align:center;padding:40px;'>";
  resp += "<h2 style='color:#10b981;'>Saved!</h2>";
  resp += "<p>Connecting to <strong>" + newSsid + "</strong>...</p>";
  resp += "<p style='color:#888;font-size:12px;'>Rebooting device. Please wait...</p>";
  resp += "</body></html>";

  server.send(200, "text/html", resp);
  delay(800);
  ESP.restart();
}

void handleResetWifi() {
  clearCredentials();
  server.send(200, "text/html", "<html><body style='background:#000;color:#fff;font-family:monospace;text-align:center;padding:40px;'><h3>Wi-Fi Forgotten</h3><p>Restarting in Setup mode...</p><script>setTimeout(()=>{window.location.href='http://192.168.4.1';}, 2500);</script></body></html>");
  delay(800);
  ESP.restart();
}

// =========================================================================
//  API Route Handlers
// =========================================================================
void handleHealth() {
  StaticJsonDocument<512> response;
  response["ok"] = true;
  response["deviceId"] = DEVICE_ID;
  response["mode"] = isApMode ? "AP_SETUP" : "STA_CONNECTED";
  response["ip"] = isApMode ? WiFi.softAPIP().toString() : WiFi.localIP().toString();
  response["wifiRssi"] = isApMode ? 0 : WiFi.RSSI();
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
  if (isApMode) {
    StaticJsonDocument<256> response;
    response["ok"] = false;
    response["error"] = "Cannot start recording in AP Setup mode.";
    String out;
    serializeJson(response, out);
    sendJsonResponse(503, out);
    return;
  }

  if (!authorized()) {
    handleUnauthorized();
    return;
  }

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
  if (isApMode) {
    StaticJsonDocument<256> response;
    response["ok"] = false;
    response["error"] = "Device in AP setup mode.";
    String out;
    serializeJson(response, out);
    sendJsonResponse(503, out);
    return;
  }

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
  if (isApMode) {
    server.sendHeader("Location", String("http://") + AP_IP.toString(), true);
    server.send(302, "text/plain", "");
    return;
  }
  StaticJsonDocument<256> response;
  response["ok"] = false;
  response["error"] = "endpoint_not_found";
  String out;
  serializeJson(response, out);
  sendJsonResponse(404, out);
}

// =========================================================================
//  Server & Routes Setup (Called ONCE in lifetime)
// =========================================================================
void setupRoutesOnce() {
  if (routesConfigured) return;

  server.collectHeaders(headerKeys, 1);
  server.on("/", HTTP_GET, handleRootPage);
  server.on("/save", HTTP_POST, handleSaveWifi);
  server.on("/reset-wifi", HTTP_GET, handleResetWifi);
  server.on("/health", HTTP_GET, handleHealth);
  server.on("/status", HTTP_GET, handleStatus);
  server.on("/start", HTTP_POST, handleStart);
  server.on("/stop", HTTP_POST, handleStop);
  server.on("/eeg", HTTP_GET, handleEeg);
  server.onNotFound(handleNotFound);

  routesConfigured = true;
}

void startWebServer() {
  setupRoutesOnce();
  if (!serverRunning) {
    server.begin();
    serverRunning = true;
  }
}

// =========================================================================
//  Network Mode Management
// =========================================================================
void switchToApMode() {
  if (isApMode) return;
  isApMode = true;

  WiFi.disconnect();
  delay(100);

  WiFi.mode(WIFI_AP_STA);
  WiFi.softAPConfig(AP_IP, AP_IP, AP_NETMASK);
  WiFi.softAP(AP_SSID, AP_PASS);

  dnsServer.setErrorReplyCode(DNSReplyCode::NoError);
  dnsServer.start(DNS_PORT, "*", AP_IP);

  startWebServer();

  Serial.println("\n" + String("=").substring(0, 50));
  Serial.println("[AP SETUP] Access Point Active: " + String(AP_SSID));
  Serial.println("[AP SETUP] Open http://" + AP_IP.toString() + " in browser");
  Serial.println(String("=").substring(0, 50));
}

void switchToStationMode() {
  isApMode = false;
  dnsServer.stop();
  WiFi.softAPdisconnect(true);
  WiFi.mode(WIFI_STA);

  startWebServer();

  Serial.println("\n[Station Mode] Connected! IP: " + WiFi.localIP().toString());
}

bool attemptStationConnection(uint32_t timeoutSeconds = 12) {
  if (wifiSsid.length() == 0) {
    Serial.println("[Wi-Fi] No credentials stored.");
    return false;
  }

  WiFi.mode(WIFI_STA);
  WiFi.softAPdisconnect(true);

  Serial.println("\n[Wi-Fi] Connecting to: " + wifiSsid);
  WiFi.begin(wifiSsid.c_str(), wifiPassword.c_str());

  uint32_t startMs = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - startMs) < (timeoutSeconds * 1000UL)) {
    delay(300);
    Serial.print(".");
    digitalWrite(LED_PIN, !digitalRead(LED_PIN));
  }

  if (WiFi.status() == WL_CONNECTED) {
    digitalWrite(LED_PIN, LOW);
    Serial.println("\n[Wi-Fi] Connected successfully!");
    Serial.print("[Wi-Fi] ESP32 Local IP: ");
    Serial.println(WiFi.localIP());
    Serial.print("[Wi-Fi] Signal (RSSI): ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");
    return true;
  }

  digitalWrite(LED_PIN, LOW);
  Serial.println("\n[Wi-Fi] Connection attempt timed out.");
  return false;
}

// =========================================================================
//  Sampling Loop
// =========================================================================
void sampleEegIfRequired() {
  if (!recording || isApMode) {
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

// =========================================================================
//  Main Setup & Loop
// =========================================================================
void setup() {
  Serial.begin(115200);
  delay(400);

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  randomSeed(analogRead(0));

  // Wi-Fi Event listener (safe & lightweight)
  WiFi.onEvent(onWiFiEvent);

  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  if (ads.begin(0x48)) {
    adsAvailable = true;
    ads.setGain(GAIN_ONE);
    Serial.println("[ADS1115] Initialized at 0x48.");
  } else {
    adsAvailable = false;
    Serial.println("[ADS1115] Not detected at 0x48. Using simulated EEG.");
  }

  // Load credentials from flash
  loadCredentials();

  // Try connecting
  bool connected = false;
  if (wifiSsid.length() > 0) {
    connected = attemptStationConnection(12);
  }

  if (connected) {
    switchToStationMode();
  } else {
    switchToApMode();
  }
}

void loop() {
  if (isApMode) {
    dnsServer.processNextRequest();
    server.handleClient();

    // Blink LED every 400ms in AP mode
    if (millis() - lastLedBlinkTime > 400) {
      lastLedBlinkTime = millis();
      ledState = !ledState;
      digitalWrite(LED_PIN, ledState ? HIGH : LOW);
    }
  } else {
    if (WiFi.status() == WL_CONNECTED) {
      disconnectStartTime = 0; // Reset disconnect counter
      server.handleClient();
      sampleEegIfRequired();
    } else {
      // Debounce connection loss: only switch to AP if disconnected continuously for > 8 seconds
      if (disconnectStartTime == 0) {
        disconnectStartTime = millis();
        Serial.println("\n[Wi-Fi] Transient connection loss detected, waiting...");
      } else if (millis() - disconnectStartTime > 8000) {
        Serial.println("\n[Wi-Fi] Persistent connection loss -> Switching to AP setup.");
        switchToApMode();
      }
      delay(50);
    }
  }
}
