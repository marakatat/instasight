import { EegTelemetry } from "@/lib/eeg/useEegStream";

export interface DeviceCommand {
  command: "START_STREAM" | "STOP_STREAM" | "IDLE";
  sessionId?: string;
  deviceId: string;
  sampleRate?: number;
  batchSize?: number;
  updatedAt: number;
}

export interface DeviceState {
  deviceId: string;
  lastCommand: DeviceCommand;
  lastTelemetry: EegTelemetry | null;
  lastSeenMs: number;
  isStreaming: boolean;
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
    return cmd;
  },

  getCommand(deviceId: string): DeviceCommand {
    return this.getDeviceState(deviceId).lastCommand;
  },

  updateTelemetry(deviceId: string, telemetry: EegTelemetry) {
    const state = this.getDeviceState(deviceId);
    state.lastTelemetry = telemetry;
    state.lastSeenMs = Date.now();
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
};
