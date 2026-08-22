import type { PoseMetrics } from "@/types/rehabilitation";

export function evaluateArmRaise(input: {
  shoulderAngle: number;
  elbowAngle: number;
  previousPhase: PoseMetrics["phase"];
  repetition: number;
}): PoseMetrics {
  const { shoulderAngle, elbowAngle, previousPhase, repetition } = input;

  const isTooFast = false;
  const isShoulderHighEnough = shoulderAngle >= 70;
  const elbowIsReasonable = elbowAngle > 120;
  const isArmResting = shoulderAngle < 30;

  let error: string | undefined;

  if (!isShoulderHighEnough && previousPhase === "holding") {
    error = "Try to raise your arm a little higher.";
  } else if (!elbowIsReasonable) {
    error = "Try to keep your arm more extended.";
  }

  // State Machine for the repetition
  let newPhase = previousPhase;
  if (isArmResting) {
    newPhase = "idle";
  } else if (shoulderAngle >= 70) {
    newPhase = "holding";
  } else if (previousPhase === "idle" && shoulderAngle >= 30) {
    newPhase = "raising";
  } else if (previousPhase === "holding" && shoulderAngle < 70) {
    newPhase = "lowering";
  }

  const movementScore = error ? 0.55 : 0.9;

  return {
    timestamp: Date.now(),
    repetition,
    phase: newPhase,
    rightShoulderAngle: shoulderAngle,
    rightElbowAngle: elbowAngle,
    movementScore,
    rangeOfMotion: Math.min(100, shoulderAngle),
    error,
  };
}
