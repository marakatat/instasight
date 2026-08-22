export type UserRole = "doctor" | "patient";

export type ExercisePhase =
  | "idle"
  | "lifting"
  | "holding"
  | "lowering"
  | "raising"
  | "complete";

export type FeedbackSeverity = "info" | "warning" | "success";

export type PoseMetrics = {
  timestamp: number;
  repetition: number;
  phase: ExercisePhase;
  leftShoulderAngle?: number;
  rightShoulderAngle?: number;
  leftElbowAngle?: number;
  rightElbowAngle?: number;
  movementScore: number;
  rangeOfMotion: number;
  tempo?: number;
  error?: string;
};

export type EegMetrics = {
  timestamp: number;
  signalQuality: number;
  motorIntentScore: number;
  source: "simulated" | "recorded" | "device";
};

export type FeedbackEvent = {
  timestamp: number;
  severity: FeedbackSeverity;
  message: string;
  source: "pose" | "eeg" | "ai" | "therapist";
};

export type SessionSummary = {
  sessionId: string;
  patientId: string;
  exerciseId: string;
  repetitionsCompleted: number;
  averageMovementScore: number;
  averageMotorIntentScore: number;
  averageSignalQuality: number;
  feedback: FeedbackEvent[];
  startedAt: string;
  completedAt?: string;
};

export type MovementEvidence = {
  videoTimeMs: number;
  repetitionNumber: number;
  exercisePhase: "idle" | "lifting" | "holding" | "lowering" | "complete";
  shoulderAngle?: number;
  elbowAngle?: number;
  movementDurationMs?: number;
  rangeOfMotion?: number;
  poseConfidence: number;
};

export type AIFeedbackEvent = {
  id: string;
  repetitionNumber?: number;
  sessionId: string;
  videoTimeMs: number;
  createdAt: string;
  // Simple, encouraging message spoken aloud to the patient
  suggestion: string;
  // Technical clinical note shown only to the doctor
  clinicalNote?: string;
  severity: "info" | "warning" | "success";
  reasonCodes: string[];
  evidence: MovementEvidence;
  confidence: number;
  modelName: string;
  modelVersion: string;
  source: "rules" | "ai" | "therapist";
  therapistReviewed: boolean;
};
