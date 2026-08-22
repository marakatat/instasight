/*
 * =========================================================================
 *  InstaSight - ESP32 EEG Dual-Channel Streamer with Wi-Fi Captive Portal
 * =========================================================================
 *
 * Features:
 * 1. ADS1115 16-bit ADC sampling (Channel 0: Frontal 'F', Channel 1: Occipital 'O')
 * 2. Persistent Storage (NVS via Preferences): saves Wi-Fi SSID, Password & Server URL
 * 3. Fallback AP & Web Portal (http://192.168.4.1) for zero-code Wi-Fi / Server setup
 * 4. Wi-Fi Auto-Scan nearby networks in setup portal
 * 5. High-speed WebSocket client streaming batched EEG data to local/cloud Python backend
 * 6. Continuous Serial logging (F,raw and O,raw) for live debugging
 * 7. BOOT Button (GPIO 0) hold for 3 seconds to reset Wi-Fi settings & re-enter AP mode
 *
 * Required Arduino / PlatformIO Libraries:
 * - Adafruit ADS1X15 (by Adafruit)
 * - ArduinoJson (by Benoit Blanchon, v6 or v7)
 * - WebSockets (by Markus Sattler)
 * =========================================================================
 */

#include <Wire.h>
#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>
#include <Adafruit_ADS1X15.h>
#include <ArduinoJson.h>
#include <WebSocketsClient.h>

// ----------------- Pin & Hardware Configuration -----------------
#define I2C_SDA_PIN      21
#define I2C_SCL_PIN      22
#define BOOT_BUTTON_PIN  0    // Built-in BOOT button on standard ESP32 boards
#define LED_PIN          2    // Built-in status LED (GPIO 2 on most ESP32 dev boards)

// ----------------- Sampling Configuration -----------------------
#define SAMPLE_RATE_HZ     250   // 250 SPS matching ADS1115 rate
#define SAMPLE_INTERVAL_US (1000000 / SAMPLE_RATE_HZ) // 4000 microseconds
#define BATCH_SIZE         25    // Send batch every 25 samples (~100 ms)

// ----------------- Global Objects & State -----------------------
Adafruit_ADS1115 ads;
Preferences prefs;
WebServer server(80);
DNSServer dnsServer;
WebSocketsClient webSocket;

// Stored Settings
String wifi_ssid       = "";
String wifi_password   = "";
String server_host     = "192.168.1.100"; // Default laptop LAN IP
int    server_port     = 8000;
String device_id       = "esp32-demo-01";

// Runtime flags
bool in_ap_mode        = false;
bool ads_available     = false;
unsigned long lastSampleTime = 0;
unsigned long sequenceCounter = 0;
unsigned long buttonPressStart = 0;
bool buttonHeld        = false;

// Sample buffers for Frontal (F) and Occipital (O)
float batch_buffer_f[BATCH_SIZE];
float batch_buffer_o[BATCH_SIZE];
int sample_index = 0;

// AP Configuration
const char* AP_SSID = "InstaSight-ESP32-Setup";
const IPAddress apIP(192, 168, 4, 1);
const byte DNS_PORT = 53;

// =========================================================================
//  Persistent Settings Management (NVS / Preferences)
// =========================================================================
void loadPreferences() {
  prefs.begin("instasight", true); // read-only
  wifi_ssid     = prefs.getString("ssid", "");
  wifi_password = prefs.getString("pass", "");
  server_host   = prefs.getString("host", "192.168.1.100");
  server_port   = prefs.getInt("port", 8000);
  device_id     = prefs.getString("dev_id", "esp32-demo-01");
  prefs.end();

  Serial.println("\n[Config] Loaded from Flash:");
  Serial.printf(" - SSID:      '%s'\n", wifi_ssid.c_str());
  Serial.printf(" - Server:    %s:%d\n", server_host.c_str(), server_port);
  Serial.printf(" - Device ID: %s\n", device_id.c_str());
}

void savePreferences(const String& ssid, const String& pass, const String& host, int port, const String& devId) {
  prefs.begin("instasight", false); // read-write
  prefs.putString("ssid", ssid);
  prefs.putString("pass", pass);
  prefs.putString("host", host);
  prefs.putInt("port", port);
  prefs.putString("dev_id", devId);
  prefs.end();

  wifi_ssid     = ssid;
  wifi_password = pass;
  server_host   = host;
  server_port   = port;
  device_id     = devId;

  Serial.println("[Config] Settings saved to Flash!");
}

void clearPreferences() {
  prefs.begin("instasight", false);
  prefs.clear();
  prefs.end();
  Serial.println("[Config] Settings cleared!");
}

// =========================================================================
//  HTML Web Portal for Configuration (Captive Portal)
// =========================================================================
String getSetupPageHtml() {
  // Scan for networks
  int n = WiFi.scanNetworks();
  String networkOptions = "";
  for (int i = 0; i < n; ++i) {
    String ssid = WiFi.SSID(i);
    int rssi = WiFi.RSSI(i);
    networkOptions += "<option value='" + ssid + "'>" + ssid + " (" + String(rssi) + " dBm)</option>";
  }

  String html = "<!DOCTYPE html><html lang='en'><head>"
    "<meta charset='UTF-8'><meta name='viewport' content='width=device-width, initial-scale=1.0'>"
    "<title>InstaSight ESP32 Setup</title>"
    "<style>"
    "* { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }"
    "body { background: #0f172a; color: #f8fafc; margin: 0; padding: 20px; display: flex; justify-content: center; align-items: center; min-height: 100vh; }"
    ".card { background: #1e293b; padding: 32px; border-radius: 20px; width: 100%; max-width: 480px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); border: 1px solid #334155; }"
    "h1 { font-size: 24px; margin-top: 0; color: #38bdf8; display: flex; align-items: center; gap: 10px; }"
    "p { color: #94a3b8; font-size: 14px; margin-bottom: 24px; line-height: 1.5; }"
    "label { display: block; font-size: 13px; font-weight: 600; color: #cbd5e1; margin-bottom: 6px; margin-top: 16px; }"
    "input, select { width: 100%; padding: 12px 14px; background: #0f172a; border: 1px solid #475569; border-radius: 10px; color: #fff; font-size: 14px; }"
    "input:focus, select:focus { outline: none; border-color: #38bdf8; ring: 2px solid #38bdf8; }"
    ".row { display: flex; gap: 12px; }"
    "button { margin-top: 24px; width: 100%; padding: 14px; background: linear-gradient(135deg, #0284c7, #2563eb); border: none; border-radius: 12px; color: white; font-weight: bold; font-size: 16px; cursor: pointer; transition: opacity 0.2s; }"
    "button:hover { opacity: 0.9; }"
    ".badge { display: inline-block; background: #0284c7; color: white; padding: 2px 8px; border-radius: 6px; font-size: 12px; font-weight: normal; }"
    "</style></head><body>"
    "<div class='card'>"
    "<h1>🧠 InstaSight ESP32</h1>"
    "<p>Configure Wi-Fi and the Python Backend Server connection for real-time EEG streaming.</p>"
    "<form action='/save' method='POST'>"
    "<label>Select Wi-Fi Network</label>"
    "<select name='ssid_select' onchange='document.getElementById(\"ssid\").value = this.value;'>"
    "<option value=''>-- Select Nearby Network --</option>" + networkOptions + "</select>"
    "<label>Or Manual SSID</label>"
    "<input type='text' id='ssid' name='ssid' value='" + wifi_ssid + "' placeholder='Network Name' required>"
    "<label>Wi-Fi Password</label>"
    "<input type='password' name='password' value='" + wifi_password + "' placeholder='Password'>"
    "<label>Python Server Host / LAN IP</label>"
    "<input type='text' name='server_host' value='" + server_host + "' placeholder='e.g. 192.168.1.100' required>"
    "<div class='row'>"
    "<div style='flex:1;'>"
    "<label>Port</label>"
    "<input type='number' name='server_port' value='" + String(server_port) + "' required>"
    "</div>"
    "<div style='flex:2;'>"
    "<label>Device ID</label>"
    "<input type='text' name='device_id' value='" + device_id + "' required>"
    "</div>"
    "</div>"
    "<button type='submit'>Save & Connect to Backend</button>"
    "</form></div></body></html>";

  return html;
}

void handleRoot() {
  server.send(200, "text/html", getSetupPageHtml());
}

void handleSave() {
  String ssid = server.arg("ssid");
  String pass = server.arg("password");
  String host = server.arg("server_host");
  int port    = server.arg("server_port").toInt();
  String dev  = server.arg("device_id");

  if (port <= 0) port = 8000;
  if (dev.length() == 0) dev = "esp32-demo-01";

  savePreferences(ssid, pass, host, port, dev);

  String response = "<!DOCTYPE html><html><head><meta charset='UTF-8'>"
    "<meta http-equiv='refresh' content='4;url=/'>"
    "<style>body{background:#0f172a;color:#fff;font-family:sans-serif;text-align:center;padding:50px;}</style>"
    "</head><body>"
    "<h2>✅ Settings Saved!</h2>"
    "<p>Connecting to <strong>" + ssid + "</strong> and streaming to <strong>" + host + ":" + String(port) + "</strong>...</p>"
    "<p>ESP32 will restart now.</p>"
    "</body></html>";

  server.send(200, "text/html", response);
  delay(1500);
  ESP.restart();
}

void startAccessPoint() {
  in_ap_mode = true;
  WiFi.mode(WIFI_AP);
  WiFi.softAPConfig(apIP, apIP, IPAddress(255, 255, 255, 0));
  WiFi.softAP(AP_SSID);

  dnsServer.start(DNS_PORT, "*", apIP); // Captive portal redirection

  server.on("/", handleRoot);
  server.on("/save", HTTP_POST, handleSave);
  server.onNotFound(handleRoot); // Redirect any captive portal query to setup page
  server.begin();

  Serial.println("\n=======================================================");
  Serial.println("❌ Wi-Fi not connected! Started Setup Access Point.");
  Serial.printf("📡 AP SSID:  %s\n", AP_SSID);
  Serial.printf("🌐 Setup IP: http://%s\n", apIP.toString().c_str());
  Serial.println("Connect to the Wi-Fi network and open the setup page.");
  Serial.println("=======================================================\n");
}

// =========================================================================
//  WebSocket Client Handling
// =========================================================================
void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      Serial.println("[WS] Disconnected from Python Server");
      digitalWrite(LED_PIN, LOW);
      break;
    case WStype_CONNECTED:
      Serial.printf("[WS] Connected to ws://%s:%d/ws/eeg/%s\n", server_host.c_str(), server_port, device_id.c_str());
      digitalWrite(LED_PIN, HIGH);
      break;
    case WStype_TEXT:
      // Feedback or acknowledgment from Python server
      Serial.printf("[WS RX] %s\n", payload);
      break;
    case WStype_BIN:
    case WStype_ERROR:
      break;
  }
}

void sendBatch() {
  if (!webSocket.isConnected()) return;

  // Build JSON payload
  StaticJsonDocument<2048> doc;
  doc["deviceId"] = device_id;
  doc["sequence"] = ++sequenceCounter;

  // Frontal channel samples (F)
  JsonArray samplesArrayF = doc.createNestedArray("samples");
  for (int i = 0; i < BATCH_SIZE; i++) {
    samplesArrayF.add(batch_buffer_f[i]);
  }

  // Occipital channel samples (O)
  JsonArray samplesArrayO = doc.createNestedArray("samples_o");
  for (int i = 0; i < BATCH_SIZE; i++) {
    samplesArrayO.add(batch_buffer_o[i]);
  }

  String jsonOutput;
  serializeJson(doc, jsonOutput);
  webSocket.sendTXT(jsonOutput);

  sample_index = 0;
}

// =========================================================================
//  Setup
// =========================================================================
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n--- InstaSight ESP32 Dual-Channel EEG Streamer ---");

  pinMode(BOOT_BUTTON_PIN, INPUT_PULLUP);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  // 1. Initialize I2C and ADS1115 ADC
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  if (!ads.begin()) {
    Serial.println("⚠️ Warning: ADS1115 not found on I2C (check pins 21/22 and ADDR pin).");
    ads_available = false;
  } else {
    Serial.println("✅ ADS1115 initialized successfully.");
    ads.setGain(GAIN_ONE);               // +/- 4.096V range (0.125mV/bit)
    ads.setDataRate(RATE_ADS1115_250SPS); // 250 Samples per second
    ads_available = true;
  }

  // 2. Load stored settings from NVS
  loadPreferences();

  // 3. Connect to Wi-Fi if credentials exist
  if (wifi_ssid.length() > 0) {
    Serial.printf("[WiFi] Connecting to '%s' ...", wifi_ssid.c_str());
    WiFi.mode(WIFI_STA);
    WiFi.begin(wifi_ssid.c_str(), wifi_password.c_str());

    unsigned long startAttempt = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - startAttempt < 10000) { // 10 sec timeout
      delay(300);
      Serial.print(".");
    }

    if (WiFi.status() == WL_CONNECTED) {
      Serial.println("\n[WiFi] ✅ Connected!");
      Serial.printf(" - Local IP: %s\n", WiFi.localIP().toString().c_str());

      // Configure WebSocket client
      String wsPath = String("/ws/eeg/") + device_id;
      webSocket.begin(server_host.c_str(), server_port, wsPath.c_str());
      webSocket.onEvent(webSocketEvent);
      webSocket.setReconnectInterval(2000);
      webSocket.enableHeartbeat(5000, 3000, 2);
    } else {
      Serial.println("\n[WiFi] ❌ Connection failed or timed out.");
      startAccessPoint();
    }
  } else {
    Serial.println("[WiFi] No saved credentials found.");
    startAccessPoint();
  }

  Serial.println("start");
}

// =========================================================================
//  Main Loop
// =========================================================================
void loop() {
  // 1. Handle AP Mode & Web Server if in Setup
  if (in_ap_mode) {
    dnsServer.processNextRequest();
    server.handleClient();
  } else {
    webSocket.loop();
  }

  // 2. Check BOOT Button (Hold for 3s to reset settings & force AP mode)
  if (digitalRead(BOOT_BUTTON_PIN) == LOW) {
    if (!buttonHeld) {
      buttonHeld = true;
      buttonPressStart = millis();
    } else if (millis() - buttonPressStart > 3000) {
      Serial.println("\n[Button] BOOT button held for 3s! Resetting Wi-Fi & starting AP...");
      clearPreferences();
      startAccessPoint();
      buttonHeld = false;
    }
  } else {
    buttonHeld = false;
  }

  // 3. Sample ADS1115 at 250 Hz
  unsigned long currentMicros = micros();
  if (currentMicros - lastSampleTime >= SAMPLE_INTERVAL_US) {
    lastSampleTime = currentMicros;

    int16_t raw_f = 0;
    int16_t raw_o = 0;

    if (ads_available) {
      raw_f = ads.readADC_SingleEnded(0);
      raw_o = ads.readADC_SingleEnded(1);
    }

    // Continuous Serial Output (as in user's original demo code)
    Serial.print("F,");
    Serial.println(raw_f);
    Serial.print("O,");
    Serial.println(raw_o);

    // Convert raw ADC readings to microvolts (+/- 4.096V range: 0.125mV = 125 uV per LSB)
    float uV_f = raw_f * 125.0f / 1000.0f;
    float uV_o = raw_o * 125.0f / 1000.0f;

    batch_buffer_f[sample_index] = uV_f;
    batch_buffer_o[sample_index] = uV_o;
    sample_index++;

    // When buffer is full, send WebSocket batch to Python server
    if (sample_index >= BATCH_SIZE) {
      if (!in_ap_mode && webSocket.isConnected()) {
        sendBatch();
      } else {
        sample_index = 0; // reset buffer
      }
    }
  }
}