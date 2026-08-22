"use client";

import { useEffect, useState, useRef, useCallback } from "react";

export type EegTelemetry = {
  deviceId: string;
  sequence: number;
  source: "esp32_hardware" | "simulated" | "http_api";
  signalQuality: number;
  motorAttemptProbability: number;
  confidence: number;
  erdPercentage: number;
  isAttemptDetected: boolean;
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
  serverUrl?: string; // WebSocket URL (e.g. ws://localhost:8000/ws/stream)
  onFeedback?: (feedback: CombinedFeedbackEvent) => void;
  onTelemetry?: (telemetry: EegTelemetry) => void;
  autoReconnect?: boolean;
}

export function useEegStream(options: UseEegStreamOptions = {}) {
  const {
    serverUrl = process.env.NEXT_PUBLIC_PYTHON_WS_URL || "ws://localhost:8000/ws/stream",
    onFeedback,
    onTelemetry,
    autoReconnect = true,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [telemetry, setTelemetry] = useState<EegTelemetry | null>(null);
  const [lastFeedback, setLastFeedback] = useState<CombinedFeedbackEvent | null>(null);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Keep callback refs fresh
  const onFeedbackRef = useRef(onFeedback);
  const onTelemetryRef = useRef(onTelemetry);
  onFeedbackRef.current = onFeedback;
  onTelemetryRef.current = onTelemetry;

  const connect = useCallback(() => {
    try {
      if (socketRef.current) {
        socketRef.current.close();
      }

      const ws = new WebSocket(serverUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setError(null);
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);

          if (payload.type === "eeg_telemetry" || payload.type === "initial_state") {
            const data = payload.data as EegTelemetry;
            setTelemetry(data);
            if (onTelemetryRef.current) {
              onTelemetryRef.current(data);
            }
          } else if (payload.type === "feedback_event") {
            const feedback = payload.data as CombinedFeedbackEvent;
            setLastFeedback(feedback);
            if (onFeedbackRef.current) {
              onFeedbackRef.current(feedback);
            }
          }
        } catch (err) {
          console.error("Error parsing EEG WebSocket payload:", err);
        }
      };

      ws.onerror = (evt) => {
        console.warn("EEG WebSocket encountered error:", evt);
        setError("WebSocket connection failed. Ensure local Python server is running.");
      };

      ws.onclose = () => {
        setIsConnected(false);
        if (autoReconnect) {
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, 3000);
        }
      };
    } catch (err: any) {
      setError(err?.message || "Failed to initialize WebSocket");
    }
  }, [serverUrl, autoReconnect]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [connect]);

  return {
    isConnected,
    telemetry,
    lastFeedback,
    error,
    reconnect: connect,
  };
}
