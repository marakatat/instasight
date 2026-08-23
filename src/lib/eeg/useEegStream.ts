"use client";

import { useEffect, useState, useRef, useCallback } from "react";

export type HardwareStatus =
  | "OFFLINE"
  | "SIMULATED_STANDBY"
  | "HARDWARE_READY"
  | "STREAMING_REAL"
  | "STREAMING_SIMULATED";

export type EegTelemetry = {
  deviceId: string;
  sequence: number;
  source: "esp32_hardware" | "http_api";
  signalQuality: number;
  motorAttemptProbability: number;
  confidence: number;
  erdPercentage: number;
  betaErdPercentage?: number;
  isAttemptDetected: boolean;
  isMovementIntended?: boolean;
  intentionState?: "resting" | "planning" | "active_attempt" | "recovery";
  fatigueIndex?: number;
  bands: {
    delta: number;
    theta: number;
    alpha: number;
    mu: number;
    beta: number;
    gamma: number;
  };
  filteredPreview: number[];
  timestamp?: number;
};

export type CombinedFeedbackEvent = {
  id: string;
  sessionId: string;
  videoTimeMs: number;
  createdAt: string;
  suggestion: string;
  severity: "info" | "warning" | "success";
  reasonCodes: string[];
  eeg: {
    signalQuality: number;
    motorAttemptProbability: number;
    isAttemptDetected: boolean;
  };
  pose: {
    shoulderAngle: number;
    elbowAngle: number;
    durationMs: number;
    confidence: number;
  };
  source: string;
};

interface UseEegStreamOptions {
  deviceId?: string | null;
  pollIntervalMs?: number;
  onFeedback?: (feedback: CombinedFeedbackEvent) => void;
  onTelemetry?: (telemetry: EegTelemetry | null) => void;
  isPolling?: boolean;
}

export function useEegStream(options: UseEegStreamOptions = {}) {
  const {
    deviceId,
    pollIntervalMs = 250,
    isPolling = true,
    onFeedback,
    onTelemetry,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [isHardwareOnline, setIsHardwareOnline] = useState(false);
  const [isEsp32Online, setIsEsp32Online] = useState(false);
  const [isBridgeOnline, setIsBridgeOnline] = useState(false);
  const [isAdsConnected, setIsAdsConnected] = useState(false);
  const [hardwareStatus, setHardwareStatus] = useState<HardwareStatus>("OFFLINE");
  const [statusMessage, setStatusMessage] = useState<string>("Checking EEG hardware...");
  const [telemetry, setTelemetry] = useState<EegTelemetry | null>(null);
  const [lastFeedback, setLastFeedback] = useState<CombinedFeedbackEvent | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onFeedbackRef = useRef(onFeedback);
  const onTelemetryRef = useRef(onTelemetry);
  onFeedbackRef.current = onFeedback;
  onTelemetryRef.current = onTelemetry;

  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingRef = useRef<boolean>(false);

  const activeDevId = deviceId ? deviceId.trim() : "";

  const fetchTelemetry = useCallback(async () => {
    if (!activeDevId) {
      setIsConnected(false);
      setIsHardwareOnline(false);
      setIsEsp32Online(false);
      setIsBridgeOnline(false);
      setIsAdsConnected(false);
      setHardwareStatus("OFFLINE");
      setStatusMessage("No device configured");
      setTelemetry(null);
      if (onTelemetryRef.current) onTelemetryRef.current(null);
      return;
    }

    if (isPollingRef.current) return;
    isPollingRef.current = true;

    try {
      const res = await fetch(
        `/api/device/telemetry?deviceId=${encodeURIComponent(activeDevId)}`,
        { cache: "no-store" }
      );

      if (res.ok) {
        const data = await res.json();
        const online = !!data.isHardwareOnline;
        setIsConnected(true);
        setIsHardwareOnline(online);
        setIsEsp32Online(!!data.isEsp32Online);
        setIsBridgeOnline(!!data.isBridgeOnline);
        setIsAdsConnected(!!data.isAdsConnected);
        setHardwareStatus(data.hardwareStatus || (online ? "HARDWARE_READY" : "OFFLINE"));
        setStatusMessage(data.statusMessage || (online ? "Hardware Ready" : "Hardware Offline"));
        setError(null);

        if (data.telemetry) {
          setTelemetry(data.telemetry);
          if (onTelemetryRef.current) {
            onTelemetryRef.current(data.telemetry);
          }
        } else {
          setTelemetry(null);
          if (onTelemetryRef.current) {
            onTelemetryRef.current(null);
          }
        }
      } else {
        setIsConnected(false);
        setIsHardwareOnline(false);
        setIsEsp32Online(false);
        setHardwareStatus("OFFLINE");
        setStatusMessage("Hardware Offline");
        setTelemetry(null);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to poll telemetry");
      setIsConnected(false);
      setIsHardwareOnline(false);
      setIsEsp32Online(false);
      setHardwareStatus("OFFLINE");
      setStatusMessage("Hardware Offline");
      setTelemetry(null);
    } finally {
      isPollingRef.current = false;
    }
  }, [activeDevId]);

  useEffect(() => {
    if (!activeDevId) {
      setIsConnected(false);
      setIsHardwareOnline(false);
      setIsEsp32Online(false);
      setIsBridgeOnline(false);
      setIsAdsConnected(false);
      setHardwareStatus("OFFLINE");
      setStatusMessage("No device ID");
      setTelemetry(null);
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    
    if (!isPolling) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }

    // Initial fetch
    fetchTelemetry();

    // Start interval polling
    pollRef.current = setInterval(fetchTelemetry, pollIntervalMs);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [fetchTelemetry, pollIntervalMs, isPolling, activeDevId]);

  // Command helper to start streaming on ESP32
  const startStream = useCallback(
    async (sessionId?: string) => {
      if (!activeDevId) return;
      try {
        await fetch("/api/device/commands", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deviceId: activeDevId,
            type: "START_STREAM",
            sessionId,
          }),
        });
      } catch (e) {
        console.error("Failed to send START_STREAM command:", e);
      }
    },
    [activeDevId]
  );

  // Command helper to stop streaming on ESP32
  const stopStream = useCallback(async () => {
    if (!activeDevId) return;
    try {
      await fetch("/api/device/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: activeDevId,
          type: "STOP_STREAM",
        }),
      });
    } catch (e) {
      console.error("Failed to send STOP_STREAM command:", e);
    }
  }, [activeDevId]);

  return {
    isConnected,
    isHardwareOnline,
    isEsp32Online,
    isBridgeOnline,
    isAdsConnected,
    hardwareStatus,
    statusMessage,
    telemetry,
    lastFeedback,
    setLastFeedback,
    error,
    startStream,
    stopStream,
    reconnect: fetchTelemetry,
  };
}
