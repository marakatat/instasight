import { EegTelemetry } from "@/lib/eeg/useEegStream";

export interface DeviceCommand {
  command: "START_STREAM" | "STOP_STREAM" | "IDLE";
  sessionId?: string;
  deviceId: string;
  sampleRate?: number;
  batchSize?: number;
  updatedAt: number;
}

export interface EegSessionMetrics {
  sessionId: string;
  deviceId: string;
  totalBatches: number;
  avgSignalQuality: number;
  avgMotorIntentScore: number;
  peakMotorIntentScore: number;
  avgMuErdPercentage: number;
  intentionTriggersCount: number;
  avgFatigueIndex: number;
  bandPowersAverage: {
    delta: number;
    theta: number;
    alpha: number;
    mu: number;
    beta: number;
    gamma: number;
  };
  timeline: Array<{
    timestamp: number;
    sequence: number;
    motorIntentScore: number;
    erdPercentage: number;
    intentionState: string;
    isMovementIntended: boolean;
    bands: {
      delta: number;
      theta: number;
      alpha: number;
      mu: number;
      beta: number;
      gamma: number;
    };
  }>;
}

export interface DeviceState {
  deviceId: string;
  lastCommand: DeviceCommand;
  lastTelemetry: EegTelemetry | null;
  lastSeenMs: number;
  isStreaming: boolean;
  activeSessionId: string | null;
  sessionTelemetryBuffer: EegTelemetry[];
}

// In-memory global store to survive HMR and Route Handler invocations in Next.js
declare global {
  var __INSTASIGHT_DEVICE_STORE__: Map<string, DeviceState> | undefined;
}

const store: Map<string, DeviceState> =
  globalThis.__INSTASIGHT_DEVICE_STORE__ ??
  (globalThis.__INSTASIGHT_DEVICE_STORE__ = new Map<string, DeviceState>());

export const deviceStore = {
  getDeviceState(deviceId: string): DeviceState {
    let state = store.get(deviceId);
    if (!state) {
      state = {
        deviceId,
        lastCommand: {
          command: "IDLE",
          deviceId,
          sampleRate: 250,
          batchSize: 25,
          updatedAt: Date.now(),
        },
        lastTelemetry: null,
        lastSeenMs: 0,
        isStreaming: false,
        activeSessionId: null,
        sessionTelemetryBuffer: [],
      };
      store.set(deviceId, state);
    }
    return state;
  },

  setCommand(deviceId: string, command: "START_STREAM" | "STOP_STREAM" | "IDLE", sessionId?: string): DeviceCommand {
    const state = this.getDeviceState(deviceId);
    const cmd: DeviceCommand = {
      command,
      sessionId: sessionId || state.lastCommand.sessionId,
      deviceId,
      sampleRate: 250,
      batchSize: 25,
      updatedAt: Date.now(),
    };
    state.lastCommand = cmd;
    state.isStreaming = command === "START_STREAM";

    if (command === "START_STREAM") {
      state.activeSessionId = sessionId || `session_${Date.now()}`;
      state.sessionTelemetryBuffer = [];
    } else if (command === "STOP_STREAM") {
      state.isStreaming = false;
    }

    return cmd;
  },

  getCommand(deviceId: string): DeviceCommand {
    return this.getDeviceState(deviceId).lastCommand;
  },

  updateTelemetry(deviceId: string, telemetry: EegTelemetry) {
    const state = this.getDeviceState(deviceId);
    state.lastTelemetry = telemetry;
    state.lastSeenMs = Date.now();

    // Accumulate telemetry buffer if in active recording session
    if (state.isStreaming) {
      state.sessionTelemetryBuffer.push(telemetry);
      // Keep up to 2000 points (~10-15 minutes of streaming)
      if (state.sessionTelemetryBuffer.length > 2000) {
        state.sessionTelemetryBuffer.shift();
      }
    }
  },

  getTelemetry(deviceId: string): { telemetry: EegTelemetry | null; isHardwareOnline: boolean; lastSeenMs: number } {
    const state = this.getDeviceState(deviceId);
    const now = Date.now();
    const isHardwareOnline = state.lastSeenMs > 0 && now - state.lastSeenMs < 4000;
    return {
      telemetry: state.lastTelemetry,
      isHardwareOnline,
      lastSeenMs: state.lastSeenMs,
    };
  },

  getSessionMetrics(deviceId: string, sessionId?: string): EegSessionMetrics {
    const state = this.getDeviceState(deviceId);
    const targetSessionId = sessionId || state.activeSessionId || "live_session";
    const buffer = state.sessionTelemetryBuffer;

    if (buffer.length === 0) {
      return {
        sessionId: targetSessionId,
        deviceId,
        totalBatches: 0,
        avgSignalQuality: 0.9,
        avgMotorIntentScore: 0.25,
        peakMotorIntentScore: 0.45,
        avgMuErdPercentage: 15,
        intentionTriggersCount: 0,
        avgFatigueIndex: 1.0,
        bandPowersAverage: { delta: 0.1, theta: 0.15, alpha: 0.25, mu: 0.2, beta: 0.2, gamma: 0.1 },
        timeline: [],
      };
    }

    let sumQuality = 0;
    let sumIntent = 0;
    let peakIntent = 0;
    let sumErd = 0;
    let intentionCount = 0;
    let sumFatigue = 0;

    const bandsSum = { delta: 0, theta: 0, alpha: 0, mu: 0, beta: 0, gamma: 0 };

    const timeline = buffer.map((t) => {
      sumQuality += t.signalQuality;
      sumIntent += t.motorAttemptProbability;
      if (t.motorAttemptProbability > peakIntent) peakIntent = t.motorAttemptProbability;
      sumErd += t.erdPercentage;
      if (t.isMovementIntended || t.isAttemptDetected) intentionCount += 1;
      sumFatigue += t.fatigueIndex || 1.0;

      bandsSum.delta += t.bands.delta;
      bandsSum.theta += t.bands.theta;
      bandsSum.alpha += t.bands.alpha;
      bandsSum.mu += t.bands.mu;
      bandsSum.beta += t.bands.beta;
      bandsSum.gamma += t.bands.gamma;

      return {
        timestamp: t.timestamp || Date.now(),
        sequence: t.sequence,
        motorIntentScore: t.motorAttemptProbability,
        erdPercentage: t.erdPercentage,
        intentionState: t.intentionState || "resting",
        isMovementIntended: !!t.isMovementIntended,
        bands: t.bands,
      };
    });

    const N = buffer.length;

    return {
      sessionId: targetSessionId,
      deviceId,
      totalBatches: N,
      avgSignalQuality: Number((sumQuality / N).toFixed(2)),
      avgMotorIntentScore: Number((sumIntent / N).toFixed(2)),
      peakMotorIntentScore: Number(peakIntent.toFixed(2)),
      avgMuErdPercentage: Math.round(sumErd / N),
      intentionTriggersCount: intentionCount,
      avgFatigueIndex: Number((sumFatigue / N).toFixed(2)),
      bandPowersAverage: {
        delta: Number((bandsSum.delta / N).toFixed(3)),
        theta: Number((bandsSum.theta / N).toFixed(3)),
        alpha: Number((bandsSum.alpha / N).toFixed(3)),
        mu: Number((bandsSum.mu / N).toFixed(3)),
        beta: Number((bandsSum.beta / N).toFixed(3)),
        gamma: Number((bandsSum.gamma / N).toFixed(3)),
      },
      timeline,
    };
  },
};

