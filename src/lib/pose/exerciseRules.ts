import type { PoseMetrics } from "@/types/rehabilitation";

export function evaluateArmRaise(input: {
  shoulderAngle: number;
  elbowAngle: number;
  previousPhase: PoseMetrics["phase"];
  repetition: number;
}): PoseMetrics {
  const { shoulderAngle, elbowAngle, previousPhase, repetition } = input;

  const isTooFast = false; // Replace with timestamp-based calculation.
  const isShoulderHighEnough = shoulderAngle >= 70;
  const elbowIsReasonable = elbowAngle > 120;

  let error: string | undefined;

  if (!isShoulderHighEnough) {
    error = "Try to raise your arm a little higher.";
  } else if (!elbowIsReasonable) {
    error = "Try to keep your arm more extended.";
  } else if (isTooFast) {
    error = "Slow down the movement.";
  }

  const movementScore = error ? 0.55 : 0.9;

  return {
    timestamp: Date.now(),
    repetition,
    phase: isShoulderHighEnough ? "holding" : previousPhase,
    rightShoulderAngle: shoulderAngle,
    rightElbowAngle: elbowAngle,
    movementScore,
    rangeOfMotion: Math.min(100, shoulderAngle),
    error,
  };
}
