/*
 * =========================================================================
 *  InstaSight - ESP32 EEG Dual-Channel Streamer (Next.js Direct HTTP Architecture)
 * =========================================================================
 *
 * Features:
 * 1. ADS1115 16-bit ADC sampling (Channel 0: Frontal 'F', Channel 1: Occipital 'O')
 * 2. Persistent Storage (NVS via Preferences): saves Wi-Fi SSID, Password & Next.js Server Host/Port
 * 3. Fallback AP & Web Portal (http://192.168.4.1) with full diagnostic failure reason reporting
 * 4. Station Web Configuration (http://<ESP32_IP>/):
 *    - When connected to Wi-Fi, hosts a clean, simple web page to view status and change
 *      the Next.js server URL/port/deviceId without restarting or re-entering Wi-Fi credentials!
 * 5. Direct HTTP Client connection to Next.js Route Handlers (NO Python / FastAPI needed):
 *    - Polls: GET /api/device/commands?deviceId=<dev_id> (receives START_STREAM / STOP_STREAM)
 *    - Streams: POST /api/device/telemetry (sends batched raw microvolt EEG samples)
 * 6. Detailed Wi-Fi Diagnostic & Event Reason Logging
 * 7. BOOT Button (GPIO 0) hold for 3 seconds to reset Wi-Fi settings & re-enter AP mode
 * 8. Status LED indication (GPIO 2 built-in LED):
 *    - Fast Blink (100ms): No Wi-Fi saved & Access Point active
 *    - Slow Blink (600ms): Wi-Fi credentials saved but cannot connect / connecting
 *    - Static ON: Connected to Wi-Fi network & synchronized with Next.js
 *
 * Required Arduino / PlatformIO Libraries:
 * - Adafruit ADS1X15 (by Adafruit)
 * - ArduinoJson (by Benoit Blanchon, v6 or v7)
 * =========================================================================
 */

#include <Wire.h>
#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>
#include <Adafruit_ADS1X15.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>

// ----------------- Pin & Hardware Configuration -----------------
#define I2C_SDA_PIN 21
#define I2C_SCL_PIN 22
#define BOOT_BUTTON_PIN 0  // Built-in BOOT button on standard ESP32 boards
#define LED_PIN 2          // Built-in status LED (GPIO 2 on most ESP32 dev boards)

// ----------------- Sampling Configuration -----------------------
#define SAMPLE_RATE_HZ 250                             // 250 SPS matching ADS1115 rate
#define SAMPLE_INTERVAL_US (1000000 / SAMPLE_RATE_HZ)  // 4000 microseconds
#define BATCH_SIZE 25                                  // Send batch every 25 samples (~100 ms)

// ----------------- Global Objects & State -----------------------
Adafruit_ADS1115 ads;
Preferences prefs;
WebServer server(80);
DNSServer dnsServer;

// Stored Settings
String wifi_ssid = "";
String wifi_password = "";
String server_host = "192.168.1.100";  // Next.js server LAN IP
int server_port = 3000;                // Next.js default port
String device_id = "esp32-demo-01";

// Streaming & Command State
bool is_streaming = false;
String active_session_id = "";
unsigned long lastCommandPollTime = 0;

// Runtime flags
bool in_ap_mode = false;
bool ads_available = false;
unsigned long lastSampleTime = 0;
unsigned long sequenceCounter = 0;
unsigned long buttonPressStart = 0;
bool buttonHeld = false;
unsigned long lastLedToggle = 0;
bool ledState = false;

// Diagnostic & Connection Failure Tracking
int last_disconnect_reason = 0;
String last_disconnect_desc = "";
String last_failed_ssid = "";
int last_target_rssi = -999;
bool last_target_found_in_scan = false;
bool connection_failed_flag = false;
int last_wifi_status = 0;

// AP Configuration
const char* AP_SSID = "InstaSight-ESP32-Setup";
const IPAddress apIP(192, 168, 4, 1);
const byte DNS_PORT = 53;

// Sample buffers for Frontal (F) and Occipital (O)
float batch_buffer_f[BATCH_SIZE];
float batch_buffer_o[BATCH_SIZE];
int sample_index = 0;

// =========================================================================
//  Wi-Fi Diagnostic Helpers & Reason Code Decoders
// =========================================================================
const char* getAuthModeName(wifi_auth_mode_t authMode) {
  switch (authMode) {
    case WIFI_AUTH_OPEN: return "OPEN";
    case WIFI_AUTH_WEP: return "WEP";
    case WIFI_AUTH_WPA_PSK: return "WPA_PSK";
    case WIFI_AUTH_WPA2_PSK: return "WPA2_PSK";
    case WIFI_AUTH_WPA_WPA2_PSK: return "WPA_WPA2_PSK";
    case WIFI_AUTH_WPA2_ENTERPRISE: return "WPA2_ENTERPRISE";
    case WIFI_AUTH_WPA3_PSK: return "WPA3_PSK";
    case WIFI_AUTH_WPA2_WPA3_PSK: return "WPA2_WPA3_PSK";
    case WIFI_AUTH_WAPI_PSK: return "WAPI_PSK";
    default: return "UNKNOWN";
  }
}

const char* getDisconnectReasonText(uint8_t reason) {
  switch (reason) {
    case 1: return "UNSPECIFIED (General Wi-Fi connection failure)";
    case 2: return "AUTH_EXPIRE (Authentication expired by router)";
    case 3: return "AUTH_LEAVE (Deauthenticated - sending station leaving)";
    case 4: return "ASSOC_EXPIRE (Disassociated due to inactivity)";
    case 5: return "ASSOC_TOOMANY (Disassociated - router reached max client limit)";
    case 6: return "NOT_AUTHED (Class 2 frame received from non-authenticated STA)";
    case 7: return "NOT_ASSOCED (Class 3 frame received from non-associated STA)";
    case 8: return "ASSOC_LEAVE (Disassociated - station leaving)";
    case 9: return "ASSOC_NOT_AUTHED (Association requested before auth)";
    case 10: return "DISASSOC_PWRCAP_BAD (Power capability info rejected by router)";
    case 11: return "DISASSOC_SUPCHAN_BAD (Supported channels unacceptable)";
    case 12: return "IE_INVALID (Information element invalid)";
    case 13: return "MIC_FAILURE (Michael MIC failure on WPA packet)";
    case 14: return "4WAY_HANDSHAKE_TIMEOUT (WPA 4-Way Handshake timed out - WRONG PASSWORD or interference)";
    case 15: return "GROUP_KEY_UPDATE_TIMEOUT (Group key handshake timeout)";
    case 16: return "IE_IN_4WAY_DIFFERS (Information element differs in 4-way handshake)";
    case 17: return "GROUP_CIPHER_INVALID (Group cipher suite invalid)";
    case 18: return "PAIRWISE_CIPHER_INVALID (Pairwise cipher suite invalid)";
    case 19: return "AKMP_INVALID (AKM suite invalid)";
    case 20: return "UNSUPP_RSN_IE_VERSION (Unsupported RSN IE version)";
    case 21: return "INVALID_RSN_IE_CAP (Invalid RSN IE capabilities)";
    case 22: return "802_1X_AUTH_FAILED (802.1X authentication failed)";
    case 23: return "CIPHER_SUITE_REJECTED (Cipher suite rejected by router)";
    case 24: return "BEACON_TIMEOUT (Lost router beacon packets - weak signal or router moved)";
    case 200: return "BEACON_TIMEOUT (Lost beacons - check distance to router)";
    case 201: return "NO_AP_FOUND (Target SSID not found - check 2.4GHz band / range / SSID spelling)";
    case 202: return "AUTH_FAIL (Authentication failed - WRONG PASSWORD)";
    case 203: return "ASSOC_FAIL (Association failed - router refused connection / MAC filter active)";
    case 204: return "HANDSHAKE_TIMEOUT (Handshake timeout - WRONG PASSWORD or weak signal)";
    case 205: return "CONNECTION_FAIL (Failed to establish link with router)";
    case 206: return "AP_TSF_RESET (AP TSF reset)";
    case 207: return "ROAMING (Station roaming)";
    default: return "UNKNOWN_REASON_CODE";
  }
}

const char* getWiFiStatusText(wl_status_t status) {
  switch (status) {
    case WL_IDLE_STATUS: return "IDLE_STATUS (In transition)";
    case WL_NO_SSID_AVAIL: return "NO_SSID_AVAIL (Target SSID not reachable)";
    case WL_SCAN_COMPLETED: return "SCAN_COMPLETED";
    case WL_CONNECTED: return "CONNECTED";
    case WL_CONNECT_FAILED: return "CONNECT_FAILED (Connection failed)";
    case WL_CONNECTION_LOST: return "CONNECTION_LOST (Link lost)";
    case WL_DISCONNECTED: return "DISCONNECTED";
    default: return "UNKNOWN_STATUS";
  }
}

// Low-level ESP32 Wi-Fi Event Callback
void onWiFiEvent(WiFiEvent_t event, WiFiEventInfo_t info) {
  switch (event) {
    case ARDUINO_EVENT_WIFI_STA_START:
      Serial.printf("[WiFi Event] Station mode started (MAC: %s)\n", WiFi.macAddress().c_str());
      break;
    case ARDUINO_EVENT_WIFI_STA_CONNECTED:
      Serial.printf("\n[WiFi Event] 🔗 Associated with AP '%s'\n", (const char*)info.wifi_sta_connected.ssid);
      Serial.printf("             Channel: %d | BSSID: %02X:%02X:%02X:%02X:%02X:%02X\n",
                    info.wifi_sta_connected.channel,
                    info.wifi_sta_connected.bssid[0], info.wifi_sta_connected.bssid[1],
                    info.wifi_sta_connected.bssid[2], info.wifi_sta_connected.bssid[3],
                    info.wifi_sta_connected.bssid[4], info.wifi_sta_connected.bssid[5]);
      break;
    case ARDUINO_EVENT_WIFI_STA_GOT_IP:
      Serial.println("\n[WiFi Event] ✅ IP Address assigned via DHCP!");
      Serial.printf("             IP:      %s\n", IPAddress(info.got_ip.ip_info.ip.addr).toString().c_str());
      Serial.printf("             Mask:    %s\n", IPAddress(info.got_ip.ip_info.netmask.addr).toString().c_str());
      Serial.printf("             Gateway: %s\n", IPAddress(info.got_ip.ip_info.gw.addr).toString().c_str());
      Serial.printf("             DNS:     %s\n", WiFi.dnsIP().toString().c_str());
      connection_failed_flag = false;
      break;
    case ARDUINO_EVENT_WIFI_STA_DISCONNECTED:
      {
        uint8_t reason = info.wifi_sta_disconnected.reason;
        last_disconnect_reason = reason;
        last_disconnect_desc = getDisconnectReasonText(reason);
        connection_failed_flag = true;
        Serial.printf("\n[WiFi Event] ❌ Disconnected from AP (Reason Code: %d)\n", reason);
        Serial.printf("             Diagnosis: %s\n", last_disconnect_desc.c_str());
        break;
      }
    case ARDUINO_EVENT_WIFI_AP_START:
      Serial.printf("[WiFi Event] 📡 SoftAP Active (SSID: '%s', IP: %s)\n", AP_SSID, apIP.toString().c_str());
      break;
    case ARDUINO_EVENT_WIFI_AP_STACONNECTED:
      Serial.printf("\n[WiFi Event] 📱 Client connected to ESP32 AP (Client MAC: %02X:%02X:%02X:%02X:%02X:%02X)\n",
                    info.wifi_ap_staconnected.mac[0], info.wifi_ap_staconnected.mac[1],
                    info.wifi_ap_staconnected.mac[2], info.wifi_ap_staconnected.mac[3],
                    info.wifi_ap_staconnected.mac[4], info.wifi_ap_staconnected.mac[5]);
      break;
    case ARDUINO_EVENT_WIFI_AP_STADISCONNECTED:
      Serial.printf("\n[WiFi Event] 📱 Client disconnected from ESP32 AP (Client MAC: %02X:%02X:%02X:%02X:%02X:%02X)\n",
                    info.wifi_ap_stadisconnected.mac[0], info.wifi_ap_stadisconnected.mac[1],
                    info.wifi_ap_stadisconnected.mac[2], info.wifi_ap_stadisconnected.mac[3],
                    info.wifi_ap_stadisconnected.mac[4], info.wifi_ap_stadisconnected.mac[5]);
      break;
    default:
      break;
  }
}

// 2.4 GHz RF Environment Scanner & Target Network Diagnostics
void performDiagnosticScan(const String& targetSsid) {
  Serial.println("\n==========================================================================");
  Serial.println("🔍 [Wi-Fi Diagnostic] Scanning 2.4 GHz RF Environment...");
  Serial.println("==========================================================================");

  int n = WiFi.scanNetworks(false, true);  // active scan, show hidden
  last_target_found_in_scan = false;
  last_target_rssi = -999;

  if (n == 0) {
    Serial.println("⚠️ [Wi-Fi Diagnostic] No 2.4 GHz Wi-Fi networks found in range!");
  } else {
    Serial.printf("📡 [Wi-Fi Diagnostic] Found %d network(s) in range:\n", n);
    Serial.println("--------------------------------------------------------------------------");
    Serial.printf(" %-3s | %-22s | %-8s | %-4s | %-15s | %s\n", "#", "SSID", "RSSI", "CHAN", "SECURITY", "BSSID");
    Serial.println("--------------------------------------------------------------------------");

    bool targetFound = false;
    int targetRssi = -999;
    int targetChan = 0;
    String targetSec = "";

    for (int i = 0; i < n; ++i) {
      String ssid = WiFi.SSID(i);
      int rssi = WiFi.RSSI(i);
      int chan = WiFi.channel(i);
      wifi_auth_mode_t auth = WiFi.encryptionType(i);
      String bssid = WiFi.BSSIDstr(i);
      const char* authStr = getAuthModeName(auth);

      bool isTarget = (targetSsid.length() > 0 && ssid == targetSsid);
      if (isTarget) {
        targetFound = true;
        targetRssi = rssi;
        targetChan = chan;
        targetSec = authStr;
      }

      Serial.printf(" %-3d | %-22.22s | %4d dBm | %-4d | %-15s | %s %s\n",
                    i + 1,
                    (ssid.length() > 0 ? ssid.c_str() : "<Hidden>"),
                    rssi,
                    chan,
                    authStr,
                    bssid.c_str(),
                    (isTarget ? " <== [TARGET MATCH]" : ""));
    }
    Serial.println("--------------------------------------------------------------------------");

    last_target_found_in_scan = targetFound;
    last_target_rssi = targetRssi;

    if (targetSsid.length() > 0) {
      if (targetFound) {
        Serial.printf("✅ [Target Analysis] Target SSID '%s' IS VISIBLE!\n", targetSsid.c_str());
        Serial.printf("   - Signal Strength: %d dBm ", targetRssi);
        if (targetRssi >= -60) Serial.println("(Excellent signal > -60 dBm)");
        else if (targetRssi >= -70) Serial.println("(Good signal -60..-70 dBm)");
        else if (targetRssi >= -80) Serial.println("(Fair/Weak signal - potential packet drops)");
        else Serial.println("(Very weak signal < -80 dBm - connection drops likely)");
        Serial.printf("   - Channel:         %d (2.4 GHz Band)\n", targetChan);
        Serial.printf("   - Encryption:      %s\n", targetSec.c_str());
      } else {
        Serial.println("❌ [Target Analysis] ⚠️ CRITICAL: Target SSID was NOT FOUND in scan!");
        Serial.printf("   - Searched SSID:   '%s' (Length: %d chars)\n", targetSsid.c_str(), (int)targetSsid.length());
        Serial.println("   - Probable Causes:");
        Serial.println("     1. Wi-Fi router is operating on 5 GHz ONLY (ESP32 only supports 2.4 GHz).");
        Serial.println("     2. Router is out of range or powered off.");
        Serial.println("     3. SSID is hidden (broadcast disabled).");
        Serial.println("     4. Typo or leading/trailing whitespace in SSID name.");
      }
    }
  }
  WiFi.scanDelete();
  Serial.println("==========================================================================\n");
}

// =========================================================================
//  Status LED Indicator
// =========================================================================
void updateStatusLED() {
  unsigned long currentMillis = millis();

  // 1. AP Mode is active -> NEVER allow Static ON
  if (in_ap_mode) {
    if (wifi_ssid.length() == 0) {
      // Blinking Fast (100ms): No credentials saved & AP setup active
      if (currentMillis - lastLedToggle >= 100) {
        lastLedToggle = currentMillis;
        ledState = !ledState;
        digitalWrite(LED_PIN, ledState ? HIGH : LOW);
      }
    } else {
      // Blinking Slow (600ms): Credentials saved but connection failed (fallback AP)
      if (currentMillis - lastLedToggle >= 600) {
        lastLedToggle = currentMillis;
        ledState = !ledState;
        digitalWrite(LED_PIN, ledState ? HIGH : LOW);
      }
    }
    return;
  }

  // 2. Station (STA) Mode
  if (WiFi.status() == WL_CONNECTED) {
    // Static ON: Successfully connected to router Wi-Fi
    digitalWrite(LED_PIN, HIGH);
    ledState = true;
  } else if (wifi_ssid.length() == 0) {
    // Blinking Fast (100ms): No Wi-Fi saved
    if (currentMillis - lastLedToggle >= 100) {
      lastLedToggle = currentMillis;
      ledState = !ledState;
      digitalWrite(LED_PIN, ledState ? HIGH : LOW);
    }
  } else {
    // Blinking Slow (600ms): Wi-Fi credentials saved, actively connecting / retrying
    if (currentMillis - lastLedToggle >= 600) {
      lastLedToggle = currentMillis;
      ledState = !ledState;
      digitalWrite(LED_PIN, ledState ? HIGH : LOW);
    }
  }
}

// =========================================================================
//  Unique Hardware Device ID Generator
// =========================================================================
String getHardwareDeviceId() {
  uint64_t chipid = ESP.getEfuseMac();
  char devName[32];
  snprintf(devName, sizeof(devName), "instasight-%04X%04X", (uint16_t)(chipid >> 32), (uint16_t)chipid);
  return String(devName);
}

// =========================================================================
//  Persistent Settings Management (NVS / Preferences)
// =========================================================================
void loadPreferences() {
  String defaultDevId = getHardwareDeviceId();
  prefs.begin("instasight", true);  // read-only
  wifi_ssid = prefs.getString("ssid", "");
  wifi_password = prefs.getString("pass", "");
  server_host = prefs.getString("host", "192.168.1.100");
  server_port = prefs.getInt("port", 3000);
  device_id = prefs.getString("dev_id", defaultDevId);
  if (device_id.length() == 0 || device_id == "esp32-demo-01") {
    device_id = defaultDevId;
  }
  prefs.end();

  Serial.println("\n[Config] Loaded from NVS Flash:");
  Serial.printf(" - Stored SSID:        '%s' (Length: %d)\n", wifi_ssid.c_str(), (int)wifi_ssid.length());
  Serial.printf(" - Stored Pass Length: %d chars\n", (int)wifi_password.length());
  Serial.printf(" - Next.js Server:     http://%s:%d\n", server_host.c_str(), server_port);
  Serial.printf(" - Unique Device ID:   %s\n", device_id.c_str());
}

void savePreferences(const String& ssid, const String& pass, const String& host, int port, const String& devId) {
  prefs.begin("instasight", false);  // read-write
  prefs.putString("ssid", ssid);
  prefs.putString("pass", pass);
  prefs.putString("host", host);
  prefs.putInt("port", port);
  prefs.putString("dev_id", devId);
  prefs.end();

  wifi_ssid = ssid;
  wifi_password = pass;
  server_host = host;
  server_port = port;
  device_id = devId;

  Serial.println("[Config] Settings saved to Flash!");
}

void saveServerPreferences(const String& host, int port, const String& devId) {
  prefs.begin("instasight", false);  // read-write
  prefs.putString("host", host);
  prefs.putInt("port", port);
  prefs.putString("dev_id", devId);
  prefs.end();

  server_host = host;
  server_port = port;
  device_id = devId;

  Serial.printf("[Config] Updated Target URL: http://%s:%d (DevID: %s)\n", server_host.c_str(), server_port, device_id.c_str());
}

void clearPreferences() {
  prefs.begin("instasight", false);
  prefs.clear();
  prefs.end();
  wifi_ssid = "";
  wifi_password = "";
  connection_failed_flag = false;
  last_disconnect_reason = 0;
  last_disconnect_desc = "";
  last_failed_ssid = "";
  is_streaming = false;
  Serial.println("[Config] Stored Wi-Fi settings cleared!");
}

// =========================================================================
//  Connection Failure Diagnostic Formatter (for HTML Webpage)
// =========================================================================
String getConnectionFailureHtml() {
  if (!connection_failed_flag && wifi_ssid.length() == 0) {
    return "";
  }

  String target = last_failed_ssid.length() > 0 ? last_failed_ssid : wifi_ssid;
  if (target.length() == 0 && !connection_failed_flag) {
    return "";
  }

  String reasonBadge = "";
  String reasonTitle = "";
  String reasonExplanation = "";
  String scanText = "";
  String actionTip = "";

  if (last_disconnect_reason > 0) {
    reasonBadge = "Code " + String(last_disconnect_reason);
    reasonTitle = getDisconnectReasonText(last_disconnect_reason);
  } else {
    reasonBadge = "TIMEOUT (20s)";
    reasonTitle = "Connection timed out before association completed";
  }

  if (last_disconnect_reason == 202 || last_disconnect_reason == 14 || last_disconnect_reason == 204) {
    reasonExplanation = "The router rejected the authentication handshake. This usually indicates an incorrect Wi-Fi password.";
    actionTip = "<strong>Action:</strong> Re-enter the Wi-Fi password carefully. Check for uppercase/lowercase letters or extra spaces.";
  } else if (last_disconnect_reason == 201 || (!last_target_found_in_scan && target.length() > 0)) {
    reasonExplanation = "The target SSID was not found in range by the ESP32 2.4 GHz radio.";
    actionTip = "<strong>Action:</strong> Ensure your router has a dedicated <strong>2.4 GHz band</strong> enabled (ESP32 does not support 5 GHz). Move the ESP32 closer to the router.";
  } else if (last_disconnect_reason == 203 || last_disconnect_reason == 5) {
    reasonExplanation = "The router refused the association request (possible MAC address filtering or maximum client limit reached).";
    actionTip = "<strong>Action:</strong> Check your router admin page to ensure MAC address filtering is disabled and DHCP pool has available IP addresses.";
  } else if (last_disconnect_reason == 24 || last_disconnect_reason == 200) {
    reasonExplanation = "Lost beacon packets from router. The Wi-Fi signal is too weak or experiencing severe RF interference.";
    actionTip = "<strong>Action:</strong> Move the ESP32 closer to your Wi-Fi router or reposition away from metal obstacles.";
  } else {
    reasonExplanation = "Failed to establish Wi-Fi link with router (Status: " + String(getWiFiStatusText((wl_status_t)last_wifi_status)) + ").";
    actionTip = "<strong>Action:</strong> Verify the network credentials and ensure the router is online and broadcasting on 2.4 GHz.";
  }

  if (target.length() > 0) {
    if (last_target_found_in_scan) {
      String signalQuality = "";
      if (last_target_rssi >= -60) signalQuality = "Excellent (> -60 dBm)";
      else if (last_target_rssi >= -70) signalQuality = "Good (-60..-70 dBm)";
      else if (last_target_rssi >= -80) signalQuality = "Weak (-70..-80 dBm)";
      else signalQuality = "Very Weak (< -80 dBm)";

      scanText = "Detected in 2.4GHz scan (" + String(last_target_rssi) + " dBm &middot; " + signalQuality + ")";
    } else {
      scanText = "<span style='color:#f87171;font-weight:600;'>NOT detected in 2.4GHz scan</span> (Check 2.4GHz band / range)";
    }
  }

  String html = "<div class='error-box'>"
                "<div class='error-header'>"
                "<span class='error-icon'>⚠️</span>"
                "<div>"
                "<div class='error-title'>Wi-Fi Connection Could Not Be Established</div>"
                "<div class='error-subtitle'>ESP32 failed to connect to &lsquo;<strong>"
                + (target.length() > 0 ? target : "(None)") + "</strong>&rsquo; and switched to Setup AP mode.</div>"
                                                              "</div>"
                                                              "</div>"
                                                              "<div class='error-details'>"
                                                              "<div class='detail-row'><span class='detail-label'>Failure Code:</span> <span class='badge-code'>"
                + reasonBadge + "</span></div>"
                                "<div class='detail-row'><span class='detail-label'>Reason:</span> <span class='detail-value'>"
                + reasonTitle + "</span></div>";

  if (reasonExplanation.length() > 0) {
    html += "<div class='detail-row'><span class='detail-label'>Diagnosis:</span> <span class='detail-value'>" + reasonExplanation + "</span></div>";
  }

  if (scanText.length() > 0) {
    html += "<div class='detail-row'><span class='detail-label'>2.4GHz Scan:</span> <span class='detail-value'>" + scanText + "</span></div>";
  }

  html += "</div>"
          "<div class='error-tip'>"
          + actionTip + "</div>"
                        "</div>";

  return html;
}

// =========================================================================
//  Station HTML Web Page: Simple Target Server & Command URL Configuration
// =========================================================================
String getStationConfigPageHtml() {
  String statusBadge = is_streaming
                         ? "<span style='background:#065f46;color:#6ee7b7;padding:3px 8px;border-radius:6px;font-weight:bold;font-size:11px;'>🟢 STREAMING</span>"
                         : "<span style='background:#334155;color:#94a3b8;padding:3px 8px;border-radius:6px;font-weight:bold;font-size:11px;'>⚪ IDLE (Waiting)</span>";

  String html = "<!DOCTYPE html><html lang='en'><head>"
                "<meta charset='UTF-8'><meta name='viewport' content='width=device-width, initial-scale=1.0'>"
                "<title>InstaSight ESP32 - Server Config</title>"
                "<style>"
                "* { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }"
                "body { background: #0f172a; color: #f8fafc; margin: 0; padding: 20px; display: flex; justify-content: center; align-items: center; min-height: 100vh; }"
                ".card { background: #1e293b; padding: 28px; border-radius: 20px; width: 100%; max-width: 480px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); border: 1px solid #334155; }"
                "h1 { font-size: 20px; margin-top: 0; color: #38bdf8; display: flex; align-items: center; justify-content: space-between; }"
                ".status-box { background: rgba(15, 23, 42, 0.6); border: 1px solid #334155; border-radius: 12px; padding: 12px 14px; margin-bottom: 20px; font-size: 12px; color: #cbd5e1; line-height: 1.6; }"
                ".status-row { display: flex; justify-content: space-between; align-items: center; margin: 3px 0; }"
                "label { display: block; font-size: 13px; font-weight: 600; color: #cbd5e1; margin-bottom: 6px; margin-top: 14px; }"
                "input { width: 100%; padding: 12px 14px; background: #0f172a; border: 1px solid #475569; border-radius: 10px; color: #fff; font-size: 14px; }"
                "input:focus { outline: none; border-color: #38bdf8; ring: 2px solid #38bdf8; }"
                ".row { display: flex; gap: 12px; }"
                "button { margin-top: 22px; width: 100%; padding: 13px; background: linear-gradient(135deg, #0284c7, #2563eb); border: none; border-radius: 12px; color: white; font-weight: bold; font-size: 15px; cursor: pointer; transition: opacity 0.2s; }"
                "button:hover { opacity: 0.9; }"
                ".hint { font-size: 11px; color: #64748b; margin-top: 6px; }"
                ".endpoints { margin-top: 18px; padding-top: 14px; border-top: 1px solid #334155; font-size: 11px; color: #94a3b8; word-break: break-all; }"
                "</style></head><body>"
                "<div class='card'>"
                "<h1><span>🧠 InstaSight Target</span> "
                + statusBadge + "</h1>"
                                "<div class='status-box'>"
                                "<div class='status-row'><span>Wi-Fi Network:</span> <strong style='color:#38bdf8;'>"
                + wifi_ssid + "</strong></div>"
                              "<div class='status-row'><span>ESP32 IP:</span> <strong style='color:#4ade80;'>"
                + WiFi.localIP().toString() + "</strong></div>"
                                              "<div class='status-row'><span>Signal Strength:</span> <span>"
                + String(WiFi.RSSI()) + " dBm</span></div>"
                                        "<div class='status-row'><span>ADS1115 Sensor:</span> <span>"
                + (ads_available ? "✅ 250 SPS Active" : "⚠️ Disconnected") + "</span></div>"
                                                                                 "</div>"
                                                                                 "<form action='/update_server' method='POST'>"
                                                                                 "<label>Next.js Server Host / LAN IP</label>"
                                                                                 "<input type='text' name='server_host' value='"
                + server_host + "' placeholder='e.g. 192.168.1.100' required>"
                                "<div class='hint'>IP address of the computer running Next.js</div>"
                                "<div class='row'>"
                                "<div style='flex:1;'>"
                                "<label>Port</label>"
                                "<input type='number' name='server_port' value='"
                + String(server_port) + "' required>"
                                        "</div>"
                                        "<div style='flex:2;'>"
                                        "<label>Device ID</label>"
                                        "<input type='text' name='device_id' value='"
                + device_id + "' required>"
                              "</div>"
                              "</div>"
                              "<button type='submit'>Save Target URL</button>"
                              "</form>"
                              "<div class='endpoints'>"
                              "<strong>Active Target Endpoints:</strong><br>"
                              "&bull; Commands: <span style='color:#38bdf8;'>http://"
                + server_host + ":" + String(server_port) + "/api/device/commands?deviceId=" + device_id + "</span><br>"
                                                                                                           "&bull; Telemetry: <span style='color:#38bdf8;'>http://"
                + server_host + ":" + String(server_port) + "/api/device/telemetry</span>"
                                                            "</div>"
                                                            "</div></body></html>";

  return html;
}

void handleStationRoot() {
  server.send(200, "text/html", getStationConfigPageHtml());
}

void handleUpdateServer() {
  String host = server.arg("server_host");
  int port = server.arg("server_port").toInt();
  String dev = server.arg("device_id");

  host.trim();
  dev.trim();
  if (port <= 0) port = 3000;
  if (dev.length() == 0) dev = getHardwareDeviceId();
  if (host.length() == 0) host = "192.168.1.100";

  saveServerPreferences(host, port, dev);

  String response = "<!DOCTYPE html><html lang='en'><head><meta charset='UTF-8'>"
                    "<meta http-equiv='refresh' content='2;url=/'>"
                    "<style>body{background:#0f172a;color:#fff;font-family:-apple-system,BlinkMacSystemFont,sans-serif;text-align:center;padding:50px;}"
                    ".badge{background:#059669;color:#ecfdf5;padding:6px 14px;border-radius:20px;display:inline-block;font-weight:bold;margin-bottom:12px;}"
                    "</style></head><body>"
                    "<div class='badge'>✅ Target URL Updated!</div>"
                    "<h2>Now listening to Next.js at:</h2>"
                    "<p style='color:#38bdf8;font-size:18px;font-family:monospace;'>http://"
                    + host + ":" + String(port) + "</p>"
                                                  "<p style='color:#94a3b8;font-size:13px;'>Device ID: <strong>"
                    + dev + "</strong></p>"
                            "<p style='color:#64748b;font-size:12px;margin-top:20px;'>Redirecting back...</p>"
                            "</body></html>";

  server.send(200, "text/html", response);
}

// =========================================================================
//  AP Captive Portal HTML Web Page
// =========================================================================
String getSetupPageHtml() {
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
                ".card { background: #1e293b; padding: 32px; border-radius: 20px; width: 100%; max-width: 520px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); border: 1px solid #334155; }"
                "h1 { font-size: 24px; margin-top: 0; color: #38bdf8; display: flex; align-items: center; gap: 10px; }"
                "p { color: #94a3b8; font-size: 14px; margin-bottom: 20px; line-height: 1.5; }"
                "label { display: block; font-size: 13px; font-weight: 600; color: #cbd5e1; margin-bottom: 6px; margin-top: 16px; }"
                "input, select { width: 100%; padding: 12px 14px; background: #0f172a; border: 1px solid #475569; border-radius: 10px; color: #fff; font-size: 14px; }"
                "input:focus, select:focus { outline: none; border-color: #38bdf8; ring: 2px solid #38bdf8; }"
                ".row { display: flex; gap: 12px; }"
                "button { margin-top: 24px; width: 100%; padding: 14px; background: linear-gradient(135deg, #0284c7, #2563eb); border: none; border-radius: 12px; color: white; font-weight: bold; font-size: 16px; cursor: pointer; transition: opacity 0.2s; }"
                "button:hover { opacity: 0.9; }"
                ".note { background: #334155; padding: 10px; border-radius: 8px; font-size: 12px; color: #94a3b8; margin-top: 16px; }"
                ".error-box { background: rgba(239, 68, 68, 0.12); border: 1px solid #ef4444; border-left: 5px solid #ef4444; border-radius: 14px; padding: 16px 18px; margin-bottom: 24px; font-size: 13px; line-height: 1.5; color: #e2e8f0; }"
                ".error-header { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 12px; }"
                ".error-icon { font-size: 22px; line-height: 1; }"
                ".error-title { color: #f87171; font-size: 15px; font-weight: 700; margin-bottom: 2px; }"
                ".error-subtitle { color: #94a3b8; font-size: 12px; }"
                ".error-details { background: rgba(15, 23, 42, 0.65); border-radius: 8px; padding: 10px 12px; margin-bottom: 10px; border: 1px solid rgba(239, 68, 68, 0.25); }"
                ".detail-row { margin: 4px 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; font-size: 12px; }"
                ".detail-label { font-weight: 600; color: #cbd5e1; min-width: 85px; }"
                ".detail-value { color: #f1f5f9; }"
                ".badge-code { background: #991b1b; color: #fef2f2; padding: 2px 7px; border-radius: 4px; font-size: 11px; font-weight: 700; font-family: monospace; }"
                ".error-tip { background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.35); border-radius: 8px; padding: 10px 12px; font-size: 12px; color: #fde68a; line-height: 1.4; }"
                "</style></head><body>"
                "<div class='card'>"
                "<h1>🧠 InstaSight ESP32</h1>"
                "<p>Configure Wi-Fi & Next.js Server connection for direct HTTP EEG streaming.</p>"
                + getConnectionFailureHtml() + "<form action='/save' method='POST'>"
                                               "<label>Select Nearby 2.4GHz Network</label>"
                                               "<select name='ssid_select' id='ssid_select' onchange='document.getElementById(\"ssid\").value = this.value;'>"
                                               "<option value=''>-- Select Network --</option>"
                + networkOptions + "</select>"
                                   "<label>Network SSID (or type manually)</label>"
                                   "<input type='text' id='ssid' name='ssid' value='"
                + wifi_ssid + "' placeholder='Network Name'>"
                              "<label>Wi-Fi Password</label>"
                              "<input type='password' name='password' value='"
                + wifi_password + "' placeholder='Password (leave empty if open)'>"
                                  "<label>Next.js Web Server Host / LAN IP</label>"
                                  "<input type='text' name='server_host' value='"
                + server_host + "' placeholder='e.g. 192.168.1.100' required>"
                                "<div class='row'>"
                                "<div style='flex:1;'>"
                                "<label>Port</label>"
                                "<input type='number' name='server_port' value='"
                + String(server_port) + "' placeholder='3000' required>"
                                        "</div>"
                                        "<div style='flex:2;'>"
                                        "<label>Device ID</label>"
                                        "<input type='text' name='device_id' value='"
                + device_id + "' required>"
                              "</div>"
                              "</div>"
                              "<div class='note'>⚠️ ESP32 only supports <strong>2.4 GHz</strong> Wi-Fi networks (not 5 GHz).</div>"
                              "<button type='submit'>Save & Connect</button>"
                              "</form></div></body></html>";

  return html;
}

void handleRoot() {
  server.send(200, "text/html", getSetupPageHtml());
}

void handleSave() {
  String ssid = server.arg("ssid");
  String ssid_select = server.arg("ssid_select");
  String pass = server.arg("password");
  String host = server.arg("server_host");
  int port = server.arg("server_port").toInt();
  String dev = server.arg("device_id");

  if (ssid.length() == 0 && ssid_select.length() > 0) {
    ssid = ssid_select;
  }
  ssid.trim();
  host.trim();
  dev.trim();

  if (port <= 0) port = 3000;
  if (dev.length() == 0) dev = getHardwareDeviceId();

  Serial.printf("\n[Save] Received Config - SSID: '%s', Host: '%s:%d', DevID: '%s'\n", ssid.c_str(), host.c_str(), port, dev.c_str());
  savePreferences(ssid, pass, host, port, dev);

  String response = "<!DOCTYPE html><html><head><meta charset='UTF-8'>"
                    "<meta http-equiv='refresh' content='4;url=/'>"
                    "<style>body{background:#0f172a;color:#fff;font-family:sans-serif;text-align:center;padding:50px;}</style>"
                    "</head><body>"
                    "<h2>✅ Settings Saved!</h2>"
                    "<p>Connecting to <strong>"
                    + (ssid.length() > 0 ? ssid : "(None)") + "</strong> and linking to Next.js at <strong>http://" + host + ":" + String(port) + "</strong>...</p>"
                                                                                                                                                  "<p>ESP32 is restarting now.</p>"
                                                                                                                                                  "</body></html>";

  server.send(200, "text/html", response);
  delay(1500);
  ESP.restart();
}

void startAccessPoint() {
  in_ap_mode = true;
  digitalWrite(LED_PIN, LOW);
  ledState = false;
  lastLedToggle = millis();

  WiFi.disconnect(true);
  delay(100);
  WiFi.mode(WIFI_AP);
  WiFi.softAPConfig(apIP, apIP, IPAddress(255, 255, 255, 0));
  WiFi.softAP(AP_SSID);

  dnsServer.start(DNS_PORT, "*", apIP);  // Captive portal redirection

  server.on("/", handleRoot);
  server.on("/save", HTTP_POST, handleSave);
  server.onNotFound(handleRoot);
  server.begin();

  Serial.println("\n==========================================================================");
  Serial.println("🚨 [AP Mode] SETUP ACCESS POINT ACTIVE");
  Serial.printf("📡 AP SSID:      %s\n", AP_SSID);
  Serial.printf("🌐 Setup IP:     http://%s (or http://192.168.4.1)\n", apIP.toString().c_str());
  Serial.printf("💡 Status LED:   %s\n", (wifi_ssid.length() == 0 ? "⚡ FAST BLINK (No saved Wi-Fi)" : "⏳ SLOW BLINK (Saved Wi-Fi failed to connect)"));
  if (wifi_ssid.length() > 0) {
    Serial.printf("ℹ️ Saved SSID:   '%s' (Check credentials or 2.4GHz range)\n", wifi_ssid.c_str());
  }
  Serial.println("Connect to Wi-Fi 'InstaSight-ESP32-Setup' on your phone/laptop to configure.");
  Serial.println("==========================================================================\n");
}

void startStationWebServer() {
  in_ap_mode = false;
  server.on("/", handleStationRoot);
  server.on("/update_server", HTTP_POST, handleUpdateServer);
  server.onNotFound(handleStationRoot);
  server.begin();

  Serial.println("\n==========================================================================");
  Serial.println("🌐 [Station Web Server] ONLINE & ACCESSIBLE");
  Serial.printf("🔗 Configuration Page: http://%s/\n", WiFi.localIP().toString().c_str());
  Serial.printf("🎯 Target Server:     http://%s:%d\n", server_host.c_str(), server_port);
  Serial.printf("🆔 Device ID:         %s\n", device_id.c_str());
  Serial.println("Open the IP above in your browser to change the target Next.js server URL.");
  Serial.println("==========================================================================\n");
}

// =========================================================================
//  HTTP Client: Command Polling & Telemetry Streaming
// =========================================================================

// Polls Next.js: GET /api/device/commands?deviceId=<dev_id>
void pollDeviceCommand() {
  if (WiFi.status() != WL_CONNECTED || in_ap_mode) return;

  HTTPClient http;
  String url = "http://" + server_host + ":" + String(server_port) + "/api/device/commands?deviceId=" + device_id;
  http.begin(url);
  http.setTimeout(1500);

  int httpCode = http.GET();
  if (httpCode == HTTP_CODE_OK) {
    String payload = http.getString();
    StaticJsonDocument<512> doc;
    DeserializationError error = deserializeJson(doc, payload);
    if (!error) {
      const char* cmd = doc["command"];
      const char* sessId = doc["sessionId"];

      if (cmd != nullptr) {
        if (strcmp(cmd, "START_STREAM") == 0) {
          if (!is_streaming) {
            Serial.printf("[HTTP] ▶️ START_STREAM received from Next.js! Session ID: %s\n", sessId ? sessId : "none");
            is_streaming = true;
            active_session_id = sessId ? sessId : "";
            sequenceCounter = 0;
            sample_index = 0;
          }
        } else if (strcmp(cmd, "STOP_STREAM") == 0 || strcmp(cmd, "IDLE") == 0) {
          if (is_streaming) {
            Serial.println("[HTTP] ⏹️ STOP_STREAM received from Next.js! Halting EEG stream.");
            is_streaming = false;
            active_session_id = "";
          }
        }
      }
    }
  }
  http.end();
}

// Sends Batch: POST /api/device/telemetry
void sendBatchHttp() {
  if (WiFi.status() != WL_CONNECTED || in_ap_mode) {
    sample_index = 0;
    return;
  }

  HTTPClient http;
  String url = "http://" + server_host + ":" + String(server_port) + "/api/device/telemetry";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(800);

  // Build JSON payload
  StaticJsonDocument<2048> doc;
  doc["deviceId"] = device_id;
  if (active_session_id.length() > 0) {
    doc["sessionId"] = active_session_id;
  }
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

  int httpCode = http.POST(jsonOutput);
  if (httpCode == HTTP_CODE_OK) {
    String response = http.getString();
    // Check if server response requested stop
    if (response.indexOf("STOP_STREAM") >= 0 || response.indexOf("IDLE") >= 0) {
      Serial.println("[HTTP] Server response requested STOP_STREAM.");
      is_streaming = false;
    }
  } else {
    Serial.printf("[HTTP] POST telemetry failed, code: %d\n", httpCode);
  }

  http.end();
  sample_index = 0;
}

// =========================================================================
//  Setup
// =========================================================================
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n\n==========================================================================");
  Serial.println("🧠 --- InstaSight ESP32 Dual-Channel EEG Streamer (Next.js Direct) ---");
  Serial.println("==========================================================================");

  pinMode(BOOT_BUTTON_PIN, INPUT_PULLUP);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  // Register Wi-Fi Event Handler for detailed reason logging
  WiFi.onEvent(onWiFiEvent);

  // 1. Initialize I2C and ADS1115 ADC
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  if (!ads.begin()) {
    Serial.println("⚠️ Warning: ADS1115 not found on I2C (check pins 21/22 and ADDR pin).");
    ads_available = false;
  } else {
    Serial.println("✅ ADS1115 initialized successfully.");
    ads.setGain(GAIN_ONE);                 // +/- 4.096V range (0.125mV/bit)
    ads.setDataRate(RATE_ADS1115_250SPS);  // 250 Samples per second
    ads_available = true;
  }

  // 2. Load stored settings from NVS
  loadPreferences();

  // 3. Connect to Wi-Fi if credentials exist
  if (wifi_ssid.length() > 0) {
    last_failed_ssid = wifi_ssid;
    last_disconnect_reason = 0;
    last_disconnect_desc = "";
    connection_failed_flag = false;

    Serial.println("\n==========================================================================");
    Serial.println("🌐 [WiFi Init] Initiating Wi-Fi Connection Sequence...");
    Serial.printf(" - Stored SSID:        '%s' (Length: %d)\n", wifi_ssid.c_str(), (int)wifi_ssid.length());
    Serial.printf(" - Stored Pass Length: %d chars\n", (int)wifi_password.length());
    Serial.printf(" - Next.js Server:     http://%s:%d\n", server_host.c_str(), server_port);
    Serial.printf(" - Device ID:          %s\n", device_id.c_str());
    Serial.printf(" - Station MAC:        %s\n", WiFi.macAddress().c_str());
    Serial.println("==========================================================================");

    // Perform RF scan first to verify target router visibility and signal
    performDiagnosticScan(wifi_ssid);

    Serial.printf("[WiFi] Calling WiFi.begin('%s', '***') ...\n", wifi_ssid.c_str());
    WiFi.disconnect(true);
    delay(150);
    WiFi.mode(WIFI_STA);
    WiFi.setSleep(false);  // Prevents modem sleep connection drops
    WiFi.begin(wifi_ssid.c_str(), wifi_password.c_str());

    unsigned long startAttempt = millis();
    unsigned long lastStatusPrint = 0;
    Serial.print("[WiFi] Connecting to AP");

    // 20 second timeout for router DHCP / WPA handshake
    while (WiFi.status() != WL_CONNECTED && millis() - startAttempt < 20000) {
      updateStatusLED();
      if (millis() - lastStatusPrint >= 1000) {
        lastStatusPrint = millis();
        int elapsedSec = (millis() - startAttempt) / 1000;
        Serial.printf(" [%ds.. status=%d]", elapsedSec, (int)WiFi.status());
      }
      delay(20);
    }
    Serial.println();

    last_wifi_status = (int)WiFi.status();

    if (WiFi.status() == WL_CONNECTED) {
      connection_failed_flag = false;
      Serial.println("\n==========================================================================");
      Serial.println("✅ [WiFi] Successfully connected and online!");
      Serial.printf(" - Local IP:       %s\n", WiFi.localIP().toString().c_str());
      Serial.printf(" - Subnet:         %s\n", WiFi.subnetMask().toString().c_str());
      Serial.printf(" - Gateway:        %s\n", WiFi.gatewayIP().toString().c_str());
      Serial.printf(" - DNS Server:     %s\n", WiFi.dnsIP().toString().c_str());
      Serial.printf(" - Signal:         %d dBm\n", WiFi.RSSI());
      Serial.printf(" - Next.js Target: http://%s:%d\n", server_host.c_str(), server_port);
      Serial.println("==========================================================================\n");

      // Start Station Web Server on port 80 (http://<localIP>/) for changing target URL
      startStationWebServer();

      // Test initial connection poll to Next.js API
      pollDeviceCommand();
    } else {
      connection_failed_flag = true;
      Serial.println("\n==========================================================================");
      Serial.printf("❌ [WiFi] Connection timed out after 20s! Final Status: %d (%s)\n", (int)WiFi.status(), getWiFiStatusText((wl_status_t)WiFi.status()));
      Serial.println(" - Fallback: Starting Setup Access Point...");
      Serial.println("==========================================================================\n");
      startAccessPoint();
    }
  } else {
    connection_failed_flag = false;
    Serial.println("\n[WiFi] No saved credentials found in flash memory. Starting Access Point...");
    startAccessPoint();
  }

  updateStatusLED();
  Serial.println("--- Setup Completed ---");
}

// =========================================================================
//  Main Loop
// =========================================================================
void loop() {
  // 1. Maintain Status LED according to Wi-Fi state
  updateStatusLED();

  // 2. Handle Web Server (works in both AP mode and Station mode)
  if (in_ap_mode) {
    dnsServer.processNextRequest();
  }
  server.handleClient();

  // 3. Command Polling in Station Mode
  if (!in_ap_mode && WiFi.status() == WL_CONNECTED) {
    unsigned long now = millis();
    unsigned long pollInterval = is_streaming ? 3000 : 1000;
    if (now - lastCommandPollTime >= pollInterval) {
      lastCommandPollTime = now;
      pollDeviceCommand();
    }
  }

  // 4. Check BOOT Button (Hold for 3s to reset settings & force AP mode)
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

  // 5. Sample ADS1115 at 250 Hz (stream active only when commanded by Next.js)
  unsigned long currentMicros = micros();
  if (currentMicros - lastSampleTime >= SAMPLE_INTERVAL_US) {
    lastSampleTime = currentMicros;

    int16_t raw_f = 0;
    int16_t raw_o = 0;

    if (ads_available) {
      raw_f = ads.readADC_SingleEnded(0);
      raw_o = ads.readADC_SingleEnded(1);
    }

    // Only process & send samples when streaming is active
    if (!in_ap_mode && WiFi.status() == WL_CONNECTED && is_streaming) {
      // Convert raw ADC readings to microvolts (+/- 4.096V range: 0.125mV = 125 uV per LSB)
      float uV_f = raw_f * 125.0f / 1000.0f;
      float uV_o = raw_o * 125.0f / 1000.0f;

      batch_buffer_f[sample_index] = uV_f;
      batch_buffer_o[sample_index] = uV_o;
      sample_index++;

      // When batch is full (25 samples = ~100ms), send HTTP POST batch to Next.js API
      if (sample_index >= BATCH_SIZE) {
        sendBatchHttp();
      }
    } else {
      sample_index = 0;
    }
  }
}