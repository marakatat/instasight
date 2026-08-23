import { EegTelemetry } from "@/lib/eeg/useEegStream";

/**
 * Lightweight TypeScript EEG Signal Processor & Movement Intention Engine
 * Direct DSP calculation for real hardware sample batches from ADS1115 / ESP32.
 */

// Baseline tracking for Mu and Beta band desynchronization (ERD) per device
interface BaselineState {
  muBaseline: number;
  betaBaseline: number;
  sampleCount: number;
}

const deviceBaselines = new Map<string, BaselineState>();

export type MovementIntentionState = "resting" | "planning" | "active_attempt" | "recovery";

export interface FrequencyBandPowers {
  delta: number; // 0.5 - 4 Hz (Slow baseline / Artifact)
  theta: number; // 4 - 8 Hz (Cognitive effort / Fatigue)
  alpha: number; // 8 - 12 Hz (Cortical idling / Calm)
  mu: number;    // 8 - 13 Hz (Sensorimotor rhythm - drops on movement intent)
  beta: number;  // 13 - 30 Hz (Motor cortex activation)
  gamma: number; // 30 - 45 Hz (Sensorimotor binding)
}

/**
 * Discrete Fourier Energy calculation across standard EEG bands
 * Sample Rate: 250 Hz (Standard clinical ADS1115 rate)
 */
export function calculateBandPowers(samples: number[], sampleRate = 250): FrequencyBandPowers {
  const N = samples.length;
  if (N === 0) {
    return { delta: 0, theta: 0, alpha: 0, mu: 0, beta: 0, gamma: 0 };
  }

  // 1. Remove DC offset (mean subtraction)
  const mean = samples.reduce((acc, val) => acc + val, 0) / N;
  const centered = samples.map((s) => s - mean);

  // 2. Zero-padded DFT (padded to 128 points for ~1.95 Hz frequency resolution)
  const padN = 128;
  const padded = new Array(padN).fill(0);
  for (let i = 0; i < N; i++) {
    // Apply Hanning window to prevent spectral leakage
    const window = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N > 1 ? N - 1 : 1)));
    padded[i] = centered[i] * window;
  }

  const paddedRes = sampleRate / padN; // ~1.953 Hz per bin

  const powers = {
    delta: 0, // 0.5 - 4 Hz
    theta: 0, // 4 - 8 Hz
    alpha: 0, // 8 - 12 Hz
    mu: 0,    // 8 - 13 Hz (Sensorimotor rhythm)
    beta: 0,  // 13 - 30 Hz (Motor execution)
    gamma: 0, // 30 - 45 Hz
  };

  let totalPower = 0.0001;

  for (let k = 1; k < padN / 2; k++) {
    const freq = k * paddedRes;
    if (freq > 45) break;

    // DFT single frequency bin
    let re = 0;
    let im = 0;
    for (let n = 0; n < padN; n++) {
      const angle = (2 * Math.PI * k * n) / padN;
      re += padded[n] * Math.cos(angle);
      im -= padded[n] * Math.sin(angle);
    }
    const power = (re * re + im * im) / padN;
    totalPower += power;

    if (freq >= 0.5 && freq < 4) powers.delta += power;
    else if (freq >= 4 && freq < 8) powers.theta += power;
    else if (freq >= 8 && freq < 12) powers.alpha += power;
    
    // Sensorimotor specific bands
    if (freq >= 8 && freq <= 13) powers.mu += power;
    if (freq > 13 && freq <= 30) powers.beta += power;
    if (freq > 30 && freq <= 45) powers.gamma += power;
  }

  return {
    delta: Number((powers.delta / totalPower).toFixed(3)),
    theta: Number((powers.theta / totalPower).toFixed(3)),
    alpha: Number((powers.alpha / totalPower).toFixed(3)),
    mu: Number((powers.mu / totalPower).toFixed(3)),
    beta: Number((powers.beta / totalPower).toFixed(3)),
    gamma: Number((powers.gamma / totalPower).toFixed(3)),
  };
}

/**
 * Process raw batch of microvolt samples from physical ESP32 (ADS1115 / EEG electrodes)
 */
export function processRawEegBatch(
  deviceId: string,
  sequence: number,
  samplesF: number[],
  _samplesO?: number[],
  _sessionId?: string
): EegTelemetry {
  const N = samplesF.length;

  if (N === 0) {
    return {
      deviceId,
      sequence,
      source: "esp32_hardware",
      signalQuality: 0,
      motorAttemptProbability: 0,
      confidence: 0,
      erdPercentage: 0,
      betaErdPercentage: 0,
      isAttemptDetected: false,
      isMovementIntended: false,
      intentionState: "resting",
      fatigueIndex: 0,
      bands: { delta: 0, theta: 0, alpha: 0, mu: 0, beta: 0, gamma: 0 },
      filteredPreview: [],
      timestamp: Date.now(),
    };
  }

  // 1. Calculate variance and signal quality
  const mean = samplesF.reduce((a, b) => a + b, 0) / N;
  const variance = samplesF.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / N;
  const stdDev = Math.sqrt(variance);

  // Normal EEG on scalp produces ~5 - 100 uV amplitude
  let signalQuality = 0.95;
  if (stdDev < 0.5) signalQuality = 0.1; // Flatline / Lead off
  else if (stdDev > 500) signalQuality = 0.25; // Rail hit / extreme motion artifact
  else if (stdDev > 250) signalQuality = 0.55;
  else signalQuality = Math.min(0.98, 0.75 + (stdDev > 5 ? 0.2 : 0.05));

  // 2. Frequency Band Powers
  const bands = calculateBandPowers(samplesF, 250);

  // 3. Event-Related Desynchronization (ERD) in Sensorimotor Mu Rhythm (8-13 Hz) & Beta (13-30 Hz)
  let baseState = deviceBaselines.get(deviceId);
  if (!baseState) {
    baseState = {
      muBaseline: 0.25,
      betaBaseline: 0.22,
      sampleCount: 0,
    };
    deviceBaselines.set(deviceId, baseState);
  }

  // Smooth baseline tracking during resting states (adaptive exponential decay)
  baseState.sampleCount += 1;
  const alphaWeight = baseState.sampleCount < 10 ? 0.2 : 0.03;
  baseState.muBaseline = (1 - alphaWeight) * baseState.muBaseline + alphaWeight * Math.max(0.08, bands.mu);
  baseState.betaBaseline = (1 - alphaWeight) * baseState.betaBaseline + alphaWeight * Math.max(0.08, bands.beta);

  // Mu ERD percentage: positive means Mu power dropped below baseline (Motor Intent / Desynchronization)
  const erdPercentage = Math.max(-50, Math.min(100, Math.round(((baseState.muBaseline - bands.mu) / baseState.muBaseline) * 100)));
  const betaErdPercentage = Math.max(-50, Math.min(100, Math.round(((baseState.betaBaseline - bands.beta) / baseState.betaBaseline) * 100)));

  // 4. Movement Intention Detection & State Machine
  // Movement intention is characterized by Mu desynchronization (ERD > 18%) coupled with Beta modulation
  let intentionState: MovementIntentionState = "resting";
  let motorAttemptProbability = 0.15;

  if (erdPercentage > 35 || (erdPercentage > 20 && betaErdPercentage > 15)) {
    intentionState = "active_attempt";
    motorAttemptProbability = Math.min(0.98, 0.65 + (erdPercentage / 100) * 0.3 + bands.beta * 0.1);
  } else if (erdPercentage > 18) {
    intentionState = "planning";
    motorAttemptProbability = Math.min(0.85, 0.45 + (erdPercentage / 100) * 0.35);
  } else if (betaErdPercentage < -20) {
    intentionState = "recovery"; // Beta rebound post-movement
    motorAttemptProbability = Math.max(0.08, 0.2 - (Math.abs(betaErdPercentage) / 100) * 0.1);
  } else {
    intentionState = "resting";
    motorAttemptProbability = Math.max(0.05, 0.15 + (bands.beta * 0.1) - (bands.alpha > 0.35 ? 0.08 : 0));
  }

  const isMovementIntended = intentionState === "planning" || intentionState === "active_attempt";
  const isAttemptDetected = motorAttemptProbability >= 0.60;
  const confidence = Number((0.75 + signalQuality * 0.2).toFixed(2));

  // 5. Fatigue Index: Theta / Beta power ratio (clinical marker of mental/central fatigue)
  const fatigueIndex = Number((bands.beta > 0.01 ? bands.theta / bands.beta : 1.0).toFixed(2));

  // 6. Filtered preview for real-time waveform visualization
  const filteredPreview = samplesF.slice(0, Math.min(N, 20)).map((s) => Number((s - mean).toFixed(1)));

  return {
    deviceId,
    sequence,
    source: "esp32_hardware",
    signalQuality: Number(signalQuality.toFixed(2)),
    motorAttemptProbability: Number(motorAttemptProbability.toFixed(2)),
    confidence,
    erdPercentage,
    betaErdPercentage,
    isAttemptDetected,
    isMovementIntended,
    intentionState,
    fatigueIndex,
    bands,
    filteredPreview,
    timestamp: Date.now(),
  };
}

