import { EegTelemetry } from "@/lib/eeg/useEegStream";

/**
 * Lightweight TypeScript EEG Signal Processor
 * Replaces the Python / scipy / mne pipeline with fast native processing in Next.js.
 */

// Baseline tracking for Mu band desynchronization (ERD)
const baselineMuMap = new Map<string, number>();

/**
 * Approximate discrete Fourier energy across standard EEG bands
 * Sample Rate: 250 Hz
 */
export function calculateBandPowers(samples: number[], sampleRate = 250) {
  const N = samples.length;
  if (N === 0) {
    return { delta: 0, theta: 0, alpha: 0, mu: 0, beta: 0, gamma: 0 };
  }

  // 1. Remove DC offset (mean subtraction)
  const mean = samples.reduce((acc, val) => acc + val, 0) / N;
  const centered = samples.map((s) => s - mean);

  // 2. Frequency bins
  const freqResolution = sampleRate / N; // e.g. 250 / 25 = 10 Hz per bin, or zero-padded

  // For short batches (N=25), perform zero-padded DFT (padded to 128 points for ~1.95 Hz resolution)
  const padN = 128;
  const padded = new Array(padN).fill(0);
  for (let i = 0; i < N; i++) {
    // Apply Hanning window
    const window = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
    padded[i] = centered[i] * window;
  }

  const paddedRes = sampleRate / padN; // ~1.953 Hz

  const powers = {
    delta: 0, // 0.5 - 4 Hz
    theta: 0, // 4 - 8 Hz
    alpha: 0, // 8 - 12 Hz
    mu: 0,    // 8 - 13 Hz (Sensorimotor rhythm)
    beta: 0,  // 13 - 30 Hz
    gamma: 0, // 30 - 45 Hz
  };

  let totalPower = 0.0001;

  for (let k = 1; k < padN / 2; k++) {
    const freq = k * paddedRes;
    if (freq > 45) break;

    // DFT single bin
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
 * Process raw batch of microvolt samples from ESP32 (Frontal F and Occipital O channels)
 */
export function processRawEegBatch(
  deviceId: string,
  sequence: number,
  samplesF: number[],
  samplesO?: number[],
  _sessionId?: string
): EegTelemetry {
  const N = samplesF.length;

  if (N === 0) {
    return generateSimulatedTelemetry(deviceId, sequence);
  }

  // 1. Calculate variance and signal quality
  const mean = samplesF.reduce((a, b) => a + b, 0) / N;
  const variance = samplesF.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / N;
  const stdDev = Math.sqrt(variance);

  // Normal EEG on scalp typically produces 5 - 100 uV amplitude
  // If variance is 0 (disconnected/floating) or > 1000 uV (high noise / rail hit), quality is lower
  let signalQuality = 0.95;
  if (stdDev < 0.5) signalQuality = 0.2; // flatline
  else if (stdDev > 500) signalQuality = 0.35; // extreme artifact / noise
  else if (stdDev > 250) signalQuality = 0.65;
  else signalQuality = Math.min(0.98, 0.75 + (stdDev > 5 ? 0.2 : 0.05));

  // 2. Frequency Band Powers
  const bands = calculateBandPowers(samplesF, 250);

  // 3. Event-Related Desynchronization (ERD) in Mu rhythm
  // Sensorimotor Mu (8-13 Hz) suppresses when motor planning or intent occurs
  let baseline = baselineMuMap.get(deviceId);
  if (!baseline || baseline === 0) {
    baseline = 0.25;
    baselineMuMap.set(deviceId, baseline);
  }

  // Smooth baseline tracking
  baseline = 0.95 * baseline + 0.05 * bands.mu;
  baselineMuMap.set(deviceId, baseline);

  // ERD percentage = (baseline - current) / baseline * 100
  const erdPercentage = Math.max(-50, Math.min(100, Math.round(((baseline - bands.mu) / baseline) * 100)));

  // 4. Motor Attempt Probability
  // High ERD suppression (>20%) + elevated Beta (>0.25) -> High motor intent
  let motorAttemptProbability = 0.3;
  if (erdPercentage > 15) {
    motorAttemptProbability = Math.min(0.98, 0.45 + (erdPercentage / 100) * 0.5 + bands.beta * 0.2);
  } else {
    motorAttemptProbability = Math.max(0.05, 0.25 + bands.beta * 0.15 - (bands.alpha > 0.4 ? 0.1 : 0));
  }

  const isAttemptDetected = motorAttemptProbability >= 0.65;
  const confidence = Number((0.75 + signalQuality * 0.2).toFixed(2));

  // 5. Downsample / filter preview for real-time waveform chart
  const filteredPreview = samplesF.slice(0, Math.min(N, 20)).map((s) => Number((s - mean).toFixed(1)));

  return {
    deviceId,
    sequence,
    source: "esp32_hardware",
    signalQuality: Number(signalQuality.toFixed(2)),
    motorAttemptProbability: Number(motorAttemptProbability.toFixed(2)),
    confidence,
    erdPercentage,
    isAttemptDetected,
    bands,
    filteredPreview,
    timestamp: Date.now(),
  };
}

/**
 * Realistic EEG telemetry generator for browser demo and testing without physical ESP32
 */
let simSequence = 0;
export function generateSimulatedTelemetry(deviceId = "simulated-eeg-01", sequence?: number, isAttempting = false): EegTelemetry {
  simSequence = sequence !== undefined ? sequence : simSequence + 1;
  const t = simSequence * 0.1;

  // Simulate physiological rhythms
  const alpha = isAttempting ? 0.15 : 0.45 + 0.1 * Math.sin(t * 0.8);
  const mu = isAttempting ? 0.08 : 0.32 + 0.08 * Math.sin(t * 1.1);
  const beta = isAttempting ? 0.42 + 0.1 * Math.sin(t * 2.0) : 0.18 + 0.05 * Math.sin(t);
  const theta = 0.15 + 0.05 * Math.cos(t * 0.5);
  const delta = 0.12 + 0.04 * Math.sin(t * 0.3);
  const gamma = 0.08 + 0.03 * Math.cos(t * 1.5);

  const erdPercentage = isAttempting ? Math.round(35 + 20 * Math.random()) : Math.round(5 + 10 * Math.sin(t));
  const motorAttemptProbability = isAttempting
    ? Number((0.75 + Math.random() * 0.2).toFixed(2))
    : Number((0.2 + 0.15 * Math.sin(t)).toFixed(2));

  // Generate synthetic waveform preview (20 points)
  const filteredPreview: number[] = [];
  for (let i = 0; i < 20; i++) {
    const pt = (t + i * 0.01) * 2 * Math.PI;
    const wave = 15 * Math.sin(pt * 10) + 8 * Math.sin(pt * 20) + 4 * (Math.random() - 0.5);
    filteredPreview.push(Number(wave.toFixed(1)));
  }

  return {
    deviceId,
    sequence: simSequence,
    source: "simulated",
    signalQuality: 0.94,
    motorAttemptProbability,
    confidence: 0.88,
    erdPercentage,
    isAttemptDetected: motorAttemptProbability >= 0.65,
    bands: {
      delta: Number(delta.toFixed(2)),
      theta: Number(theta.toFixed(2)),
      alpha: Number(alpha.toFixed(2)),
      mu: Number(mu.toFixed(2)),
      beta: Number(beta.toFixed(2)),
      gamma: Number(gamma.toFixed(2)),
    },
    filteredPreview,
    timestamp: Date.now(),
  };
}
