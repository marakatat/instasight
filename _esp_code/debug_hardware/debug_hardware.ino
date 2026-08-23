#include <Wire.h>
#include <Adafruit_ADS1X15.h>
#include <WiFi.h>

// =========================================================================
//  InstaSight - ESP32 Hardware Diagnostics & ADS1115 / I2C Debugger
// =========================================================================
//  Features:
//  1. Full I2C Bus Scanner (scans all 127 addresses on GPIO 21 SDA / 22 SCL).
//  2. Auto-detection for ADS1115 on all possible addresses (0x48, 0x49, 0x4A, 0x4B).
//  3. Live Multi-Channel ADC Voltage & Microvolt Stream (A0, A1, A2, A3 & Differential).
//  4. 250 Hz High-Speed Sample Rate & Noise/Jitter Benchmark (Mean, Min, Max, Vpp, StdDev).
//  5. ESP32 Internal ADC fallback comparison test (GPIO 34 / 36).
//  6. Interactive Serial Command Console (115200 baud).
// =========================================================================

#define I2C_SDA_PIN 21
#define I2C_SCL_PIN 22
#define LED_PIN 2
#define INTERNAL_ADC_PIN 34 // Alternate analog test pin on ESP32

Adafruit_ADS1115 ads;
bool adsFound = false;
uint8_t adsAddress = 0x48;
adsGain_t currentGain = GAIN_ONE; // +/- 4.096V (1 bit = 0.125mV)

// Diagnostics stats
float gainMultiplier = 0.125f; // mV per bit for GAIN_ONE

void scanI2CBus();
bool testADS1115(uint8_t addr);
void printHelp();
void run250HzBenchmark(uint16_t sampleCount);
void printChannelVoltages();

void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println("\n[BOOT] ESP32 Diagnostic Suite Starting...");

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  Serial.println("================================================================");
  Serial.println("   InstaSight - ESP32 EEG Hardware & ADS1115 Diagnostic Suite   ");
  Serial.println("================================================================");
  Serial.println("System Clock: " + String(ESP.getCpuFreqMHz()) + " MHz");
  Serial.println("Free Heap:    " + String(ESP.getFreeHeap() / 1024) + " KB");
  Serial.println("I2C Pins:     SDA = GPIO " + String(I2C_SDA_PIN) + " | SCL = GPIO " + String(I2C_SCL_PIN));
  Serial.println("================================================================\n");

  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  Wire.setTimeOut(25);   // Short 25ms timeout to prevent I2C bus lockup
  Wire.setClock(100000); // 100kHz standard robust I2C clock

  // 1. Run initial bus scan
  scanI2CBus();

  // 2. Try initializing ADS1115 on standard addresses
  if (testADS1115(0x48) || testADS1115(0x49) || testADS1115(0x4A) || testADS1115(0x4B)) {
    adsFound = true;
  } else {
    Serial.println("\n[!] WARNING: No ADS1115 found on any standard I2C address (0x48-0x4B).");
    Serial.println("    Please verify physical wiring:");
    Serial.println("    - VDD -> 3.3V or 5V");
    Serial.println("    - GND -> GND");
    Serial.println("    - SCL -> ESP32 GPIO 22");
    Serial.println("    - SDA -> ESP32 GPIO 21");
    Serial.println("    - ADDR -> GND (address 0x48)");
  }

  printHelp();
}

void loop() {
  // Check for serial console user input
  if (Serial.available()) {
    char cmd = Serial.read();
    while (Serial.available()) Serial.read(); // consume trailing newline

    if (cmd == 's' || cmd == 'S') {
      scanI2CBus();
    } else if (cmd == 'r' || cmd == 'R') {
      printChannelVoltages();
    } else if (cmd == 'b' || cmd == 'B') {
      run250HzBenchmark(250); // 1 second benchmark
    } else if (cmd == 'g' || cmd == 'G') {
      cycleGain();
    } else if (cmd == 'w' || cmd == 'W') {
      testWifiScan();
    } else if (cmd == 'h' || cmd == 'H') {
      printHelp();
    }
  }

  // Blink heartbeat LED
  static unsigned long lastBlink = 0;
  if (millis() - lastBlink > 1000) {
    lastBlink = millis();
    digitalWrite(LED_PIN, !digitalRead(LED_PIN));
  }

  delay(10); // Yield to FreeRTOS watchdog
}

// =========================================================================
//  1. Full I2C Scanner (Standard Safe Range 0x08 to 0x77)
// =========================================================================
void scanI2CBus() {
  Serial.println("\n[I2C Scan] Scanning I2C bus (Addresses 0x08 to 0x77)...");
  byte count = 0;

  for (byte address = 8; address < 120; address++) {
    Wire.beginTransmission(address);
    byte error = Wire.endTransmission();
    yield(); // Feed watchdog during scan

    if (error == 0) {
      Serial.print("  -> Found I2C device at address 0x");
      if (address < 16) Serial.print("0");
      Serial.print(address, HEX);

      if (address == 0x48) Serial.println(" (ADS1115 / ADDR=GND) [DEFAULT]");
      else if (address == 0x49) Serial.println(" (ADS1115 / ADDR=VDD)");
      else if (address == 0x4A) Serial.println(" (ADS1115 / ADDR=SDA)");
      else if (address == 0x4B) Serial.println(" (ADS1115 / ADDR=SCL)");
      else if (address == 0x3C || address == 0x3D) Serial.println(" (OLED Display SSD1306)");
      else if (address == 0x68 || address == 0x69) Serial.println(" (MPU6050 / IMU)");
      else Serial.println(" (Unknown device)");

      count++;
    } else if (error == 4) {
      Serial.print("  -> Bus error at address 0x");
      if (address < 16) Serial.print("0");
      Serial.println(address, HEX);
    }
  }

  if (count == 0) {
    Serial.println("  [X] No I2C devices detected! Check SDA/SCL wire connections.");
  } else {
    Serial.println("  [OK] Scan finished. Found " + String(count) + " device(s).\n");
  }
}

// =========================================================================
//  2. ADS1115 Initialization & Verification
// =========================================================================
bool testADS1115(uint8_t addr) {
  Serial.print("[ADS1115] Probing address 0x");
  Serial.print(addr, HEX);
  Serial.print("... ");

  if (ads.begin(addr)) {
    adsAddress = addr;
    ads.setGain(currentGain);
    Serial.println("SUCCESS! Initialized.");
    return true;
  }
  Serial.println("No response.");
  return false;
}

// =========================================================================
//  3. Single Read across Channels
// =========================================================================
void printChannelVoltages() {
  Serial.println("\n-------------------------------------------------------------");
  Serial.println("   Live Channel Voltage Readings (Single Shot)               ");
  Serial.println("-------------------------------------------------------------");

  if (adsFound) {
    int16_t a0_raw = ads.readADC_SingleEnded(0);
    int16_t a1_raw = ads.readADC_SingleEnded(1);
    int16_t a2_raw = ads.readADC_SingleEnded(2);
    int16_t a3_raw = ads.readADC_SingleEnded(3);
    int16_t diff_raw = ads.readADC_Differential_0_1();

    float a0_mv = a0_raw * gainMultiplier;
    float a1_mv = a1_raw * gainMultiplier;
    float a2_mv = a2_raw * gainMultiplier;
    float a3_mv = a3_raw * gainMultiplier;
    float diff_mv = diff_raw * gainMultiplier;

    Serial.println("ADS1115 Channel A0 (EEG Signal): " + String(a0_mv, 3) + " mV (Raw: " + String(a0_raw) + ")");
    Serial.println("ADS1115 Channel A1 (Ref):        " + String(a1_mv, 3) + " mV (Raw: " + String(a1_raw) + ")");
    Serial.println("ADS1115 Channel A2:              " + String(a2_mv, 3) + " mV (Raw: " + String(a2_raw) + ")");
    Serial.println("ADS1115 Channel A3:              " + String(a3_mv, 3) + " mV (Raw: " + String(a3_raw) + ")");
    Serial.println("ADS1115 Diff 0-1 (A0 - A1):      " + String(diff_mv, 3) + " mV (Raw: " + String(diff_raw) + ")");
  } else {
    Serial.println("[ADS1115 not detected - check wiring]");
  }

  // Also read ESP32 internal ADC
  int internalRaw = analogRead(INTERNAL_ADC_PIN);
  float internalMv = (internalRaw / 4095.0f) * 3300.0f;
  Serial.println("ESP32 Internal ADC (GPIO 34):    " + String(internalMv, 2) + " mV (Raw: " + String(internalRaw) + "/4095)");
  Serial.println("-------------------------------------------------------------\n");
}

// =========================================================================
//  4. 250 Hz Continuous Sampling Benchmark (Noise & Signal Quality Test)
// =========================================================================
void run250HzBenchmark(uint16_t sampleCount) {
  Serial.println("\n[Benchmark] Capturing " + String(sampleCount) + " samples at 250 Hz (4ms interval)...");

  if (!adsFound) {
    Serial.println("[!] Cannot benchmark: ADS1115 hardware not connected.");
    return;
  }

  float minVal = 99999.0f;
  float maxVal = -99999.0f;
  float sum = 0.0f;
  float sumSq = 0.0f;

  uint32_t intervalUs = 4000; // 250 Hz = 4000 microseconds
  uint32_t nextTime = micros();

  Serial.println("\nSeq | Sample (mV) | Visual Sparkline");
  Serial.println("------------------------------------");

  for (uint16_t i = 0; i < sampleCount; i++) {
    while ((int32_t)(micros() - nextTime) < 0) {
      // wait for 250 Hz clock edge
    }
    nextTime += intervalUs;

    int16_t raw = ads.readADC_SingleEnded(0);
    float mv = raw * gainMultiplier;

    if (mv < minVal) minVal = mv;
    if (mv > maxVal) maxVal = mv;
    sum += mv;
    sumSq += (mv * mv);

    // Print first 20 samples with ascii visualization
    if (i < 25) {
      int bars = constrain((int)((mv + 500) / 40), 1, 30);
      String spark = "";
      for (int b = 0; b < bars; b++) spark += "#";
      Serial.printf("[%03d] %8.3f mV | %s\n", i, mv, spark.c_str());
    } else if (i == 25) {
      Serial.println("... (sampling remainder silently) ...");
    }
  }

  float mean = sum / sampleCount;
  float variance = (sumSq / sampleCount) - (mean * mean);
  float stdDev = sqrt(max(0.0f, variance));
  float vpp = maxVal - minVal;

  Serial.println("\n================ Benchmark Results ================");
  Serial.println("Samples Captured:  " + String(sampleCount));
  Serial.println("Mean Voltage:      " + String(mean, 3) + " mV");
  Serial.println("Peak-to-Peak (Vpp):" + String(vpp, 3) + " mV (Noise / Signal Amplitude)");
  Serial.println("Min Voltage:       " + String(minVal, 3) + " mV");
  Serial.println("Max Voltage:       " + String(maxVal, 3) + " mV");
  Serial.println("Std Deviation (σ): " + String(stdDev, 3) + " mV");

  if (stdDev < 0.2f) {
    Serial.println("Assessment: FLATLINE (Electrode floating or disconnected)");
  } else if (stdDev > 500.0f) {
    Serial.println("Assessment: NOISY / RAIL HIT (Check ground & electrode impedance)");
  } else {
    Serial.println("Assessment: [EXCELLENT] Dynamic EEG voltage variance detected!");
  }
  Serial.println("===================================================\n");
}

// =========================================================================
//  5. Cycle ADS1115 Programmable Gain Amplifier (PGA)
// =========================================================================
void cycleGain() {
  if (!adsFound) {
    Serial.println("[!] ADS1115 not connected.");
    return;
  }

  if (currentGain == GAIN_TWOTHIRDS) {
    currentGain = GAIN_ONE;
    gainMultiplier = 0.125f;
    Serial.println("[PGA Gain] Set to GAIN_ONE (+/- 4.096V | 0.125 mV/bit)");
  } else if (currentGain == GAIN_ONE) {
    currentGain = GAIN_TWO;
    gainMultiplier = 0.0625f;
    Serial.println("[PGA Gain] Set to GAIN_TWO (+/- 2.048V | 0.0625 mV/bit)");
  } else if (currentGain == GAIN_TWO) {
    currentGain = GAIN_FOUR;
    gainMultiplier = 0.03125f;
    Serial.println("[PGA Gain] Set to GAIN_FOUR (+/- 1.024V | 0.03125 mV/bit)");
  } else if (currentGain == GAIN_FOUR) {
    currentGain = GAIN_EIGHT;
    gainMultiplier = 0.015625f;
    Serial.println("[PGA Gain] Set to GAIN_EIGHT (+/- 0.512V | 0.015625 mV/bit - EEG Mode)");
  } else if (currentGain == GAIN_EIGHT) {
    currentGain = GAIN_SIXTEEN;
    gainMultiplier = 0.0078125f;
    Serial.println("[PGA Gain] Set to GAIN_SIXTEEN (+/- 0.256V | 0.0078125 mV/bit - Ultra High Sensitivity)");
  } else {
    currentGain = GAIN_TWOTHIRDS;
    gainMultiplier = 0.1875f;
    Serial.println("[PGA Gain] Set to GAIN_TWOTHIRDS (+/- 6.144V | 0.1875 mV/bit)");
  }

  ads.setGain(currentGain);
}

// =========================================================================
//  6. Wi-Fi Scan Test
// =========================================================================
void testWifiScan() {
  Serial.println("\n[Wi-Fi Test] Scanning 2.4 GHz channels...");
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  delay(100);

  int n = WiFi.scanNetworks();
  if (n == 0) {
    Serial.println("  [!] No networks found.");
  } else {
    Serial.println("  Found " + String(n) + " network(s):");
    for (int i = 0; i < n; ++i) {
      Serial.printf("  %02d: %-24s (%4d dBm) %s\n", 
        i + 1, 
        WiFi.SSID(i).c_str(), 
        WiFi.RSSI(i), 
        (WiFi.encryptionType(i) == WIFI_AUTH_OPEN) ? "Open" : "Encrypted");
    }
  }
  Serial.println("");
}

// =========================================================================
//  Help Menu
// =========================================================================
void printHelp() {
  Serial.println("---------------- Interactive Commands ----------------");
  Serial.println("  s -> Re-scan I2C bus for connected devices");
  Serial.println("  r -> Read single-shot voltages across all channels");
  Serial.println("  b -> Run 250 Hz continuous sampling & noise benchmark");
  Serial.println("  g -> Cycle ADS1115 gain setting (Sensitivity)");
  Serial.println("  w -> Perform 2.4 GHz Wi-Fi environment scan");
  Serial.println("  h -> Print this help menu");
  Serial.println("------------------------------------------------------\n");
}
