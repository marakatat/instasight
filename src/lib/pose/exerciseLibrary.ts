import { PoseMetrics, ExercisePhase } from "@/types/rehabilitation";
import { angle } from "./geometry";

// Standard MediaPipe Pose Landmarks
export const POSE_LANDMARKS = {
  LEFT_SHOULDER:  11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW:     13,
  RIGHT_ELBOW:    14,
  LEFT_WRIST:     15,
  RIGHT_WRIST:    16,
  LEFT_HIP:       23,
  RIGHT_HIP:      24,
  LEFT_KNEE:      25,
  RIGHT_KNEE:     26,
  LEFT_ANKLE:     27,
  RIGHT_ANKLE:    28,
};

export interface ExerciseDefinition {
  id: string;
  name: string;
  description: string;
  instructions: string;
  category: "upper" | "lower" | "full";
  difficulty: "beginner" | "intermediate" | "advanced";
  datasetKey: string; // maps to derivedBaselines.json
  evaluator: (
    landmarks: any[],
    previousPhase: ExercisePhase,
    repetition: number
  ) => PoseMetrics;
}

// ── Evaluators ──────────────────────────────────────────────────────────────

function rightArmRaiseEvaluator(
  landmarks: any[],
  previousPhase: ExercisePhase,
  repetition: number
): PoseMetrics {
  if (!landmarks || landmarks.length < 33) {
    return { timestamp: Date.now(), repetition, phase: previousPhase, movementScore: 0, rangeOfMotion: 0 };
  }
  const shoulder = landmarks[POSE_LANDMARKS.RIGHT_SHOULDER];
  const elbow    = landmarks[POSE_LANDMARKS.RIGHT_ELBOW];
  const wrist    = landmarks[POSE_LANDMARKS.RIGHT_WRIST];
  const hip      = landmarks[POSE_LANDMARKS.RIGHT_HIP];

  const shoulderAngle = angle(hip, shoulder, elbow);
  const elbowAngle    = angle(shoulder, elbow, wrist);

  let error: string | undefined;
  if (elbowAngle < 120) {
    error = "Try to keep your arm more extended.";
  }

  let newPhase = previousPhase;
  if (shoulderAngle < 30)                                   newPhase = "idle";
  else if (shoulderAngle >= 70)                             newPhase = "holding";
  else if (previousPhase === "idle" && shoulderAngle >= 30) newPhase = "raising";
  else if (previousPhase === "holding" && shoulderAngle < 70) newPhase = "lowering";

  return {
    timestamp: Date.now(), repetition,
    phase: newPhase,
    rightShoulderAngle: shoulderAngle,
    rightElbowAngle: elbowAngle,
    movementScore: error ? 0.55 : 0.9,
    rangeOfMotion: Math.round(shoulderAngle),
    error,
  };
}

function leftArmRaiseEvaluator(
  landmarks: any[],
  previousPhase: ExercisePhase,
  repetition: number
): PoseMetrics {
  if (!landmarks || landmarks.length < 33) {
    return { timestamp: Date.now(), repetition, phase: previousPhase, movementScore: 0, rangeOfMotion: 0 };
  }
  const shoulder = landmarks[POSE_LANDMARKS.LEFT_SHOULDER];
  const elbow    = landmarks[POSE_LANDMARKS.LEFT_ELBOW];
  const wrist    = landmarks[POSE_LANDMARKS.LEFT_WRIST];
  const hip      = landmarks[POSE_LANDMARKS.LEFT_HIP];

  const shoulderAngle = angle(hip, shoulder, elbow);
  const elbowAngle    = angle(shoulder, elbow, wrist);

  let error: string | undefined;
  if (elbowAngle < 120) {
    error = "Try to keep your arm more extended.";
  }

  let newPhase = previousPhase;
  if (shoulderAngle < 30)                                     newPhase = "idle";
  else if (shoulderAngle >= 70)                               newPhase = "holding";
  else if (previousPhase === "idle" && shoulderAngle >= 30)   newPhase = "raising";
  else if (previousPhase === "holding" && shoulderAngle < 70) newPhase = "lowering";

  return {
    timestamp: Date.now(), repetition,
    phase: newPhase,
    rightShoulderAngle: shoulderAngle,
    rightElbowAngle: elbowAngle,
    movementScore: error ? 0.55 : 0.9,
    rangeOfMotion: Math.round(shoulderAngle),
    error,
  };
}

function kneeExtensionEvaluator(
  landmarks: any[],
  previousPhase: ExercisePhase,
  repetition: number
): PoseMetrics {
  if (!landmarks || landmarks.length < 33) {
    return { timestamp: Date.now(), repetition, phase: previousPhase, movementScore: 0, rangeOfMotion: 0 };
  }
  const hip   = landmarks[POSE_LANDMARKS.RIGHT_HIP];
  const knee  = landmarks[POSE_LANDMARKS.RIGHT_KNEE];
  const ankle = landmarks[POSE_LANDMARKS.RIGHT_ANKLE];

  const kneeAngle = angle(hip, knee, ankle);

  let error: string | undefined;
  const isExtended  = kneeAngle >= 155;
  const isBent      = kneeAngle <= 90;

  // We rely on phase transitions to measure completion; no artificial error here unless form is bad
  
  let newPhase = previousPhase;
  if (isBent)                                                     newPhase = "idle";
  else if (isExtended)                                            newPhase = "holding";
  else if (previousPhase === "idle" && kneeAngle > 90)            newPhase = "raising";
  else if (previousPhase === "holding" && kneeAngle < 155)        newPhase = "lowering";

  return {
    timestamp: Date.now(), repetition,
    phase: newPhase,
    movementScore: error ? 0.6 : 0.92,
    rangeOfMotion: Math.round(kneeAngle),
    error,
  };
}

function sitToStandEvaluator(
  landmarks: any[],
  previousPhase: ExercisePhase,
  repetition: number
): PoseMetrics {
  if (!landmarks || landmarks.length < 33) {
    return { timestamp: Date.now(), repetition, phase: previousPhase, movementScore: 0, rangeOfMotion: 0 };
  }
  const shoulder = landmarks[POSE_LANDMARKS.RIGHT_SHOULDER];
  const hip      = landmarks[POSE_LANDMARKS.RIGHT_HIP];
  const knee     = landmarks[POSE_LANDMARKS.RIGHT_KNEE];
  const ankle    = landmarks[POSE_LANDMARKS.RIGHT_ANKLE];

  const hipAngle  = angle(shoulder, hip, knee);
  const kneeAngle = angle(hip, knee, ankle);

  const isStanding = hipAngle > 150 && kneeAngle > 150;
  const isSeated   = hipAngle < 100 && kneeAngle < 110;

  let error: string | undefined;
  
  let newPhase = previousPhase;
  if (isSeated)                                                          newPhase = "idle";
  else if (isStanding)                                                   newPhase = "holding";
  else if (previousPhase === "idle" && !isSeated)                        newPhase = "raising";
  else if (previousPhase === "holding" && !isStanding)                   newPhase = "lowering";

  return {
    timestamp: Date.now(), repetition,
    phase: newPhase,
    movementScore: error ? 0.6 : 0.93,
    rangeOfMotion: Math.round(hipAngle),
    error,
  };
}

function squatEvaluator(
  landmarks: any[],
  previousPhase: ExercisePhase,
  repetition: number
): PoseMetrics {
  if (!landmarks || landmarks.length < 33) {
    return { timestamp: Date.now(), repetition, phase: previousPhase, movementScore: 0, rangeOfMotion: 0 };
  }
  const hip   = landmarks[POSE_LANDMARKS.RIGHT_HIP];
  const knee  = landmarks[POSE_LANDMARKS.RIGHT_KNEE];
  const ankle = landmarks[POSE_LANDMARKS.RIGHT_ANKLE];

  const kneeAngle = angle(hip, knee, ankle);
  const isStanding = kneeAngle > 160;
  const isDeep     = kneeAngle <= 100;

  let error: string | undefined;

  let newPhase = previousPhase;
  if (isStanding)                                               newPhase = "idle";
  else if (isDeep)                                              newPhase = "holding";
  else if (previousPhase === "idle" && kneeAngle < 160)         newPhase = "lowering";
  else if (previousPhase === "holding" && kneeAngle > 100)      newPhase = "raising";

  return {
    timestamp: Date.now(), repetition,
    phase: newPhase,
    movementScore: error ? 0.6 : 0.95,
    rangeOfMotion: Math.round(180 - kneeAngle),
    error,
  };
}

// ── Exercise Library ─────────────────────────────────────────────────────────

export const EXERCISE_LIBRARY: Record<string, ExerciseDefinition> = {
  right_arm_raise: {
    id: "right_arm_raise",
    name: "Right Arm Raise",
    description: "Raise your right arm to the side as high as comfortable.",
    instructions: "Stand straight. Keep your elbow extended and lift your right arm out to the side.",
    category: "upper",
    difficulty: "beginner",
    datasetKey: "arm_raise",
    evaluator: rightArmRaiseEvaluator,
  },
  left_arm_raise: {
    id: "left_arm_raise",
    name: "Left Arm Raise",
    description: "Raise your left arm to the side as high as comfortable.",
    instructions: "Stand straight. Keep your elbow extended and lift your left arm out to the side.",
    category: "upper",
    difficulty: "beginner",
    datasetKey: "arm_raise",
    evaluator: leftArmRaiseEvaluator,
  },
  knee_extension: {
    id: "knee_extension",
    name: "Knee Extension",
    description: "Straighten your leg from a seated position.",
    instructions: "Sit on a chair. Slowly extend your right leg until it is fully straight, then lower it back down.",
    category: "lower",
    difficulty: "beginner",
    datasetKey: "knee_extension",
    evaluator: kneeExtensionEvaluator,
  },
  sit_to_stand: {
    id: "sit_to_stand",
    name: "Sit to Stand",
    description: "Rise from a seated position to standing and return.",
    instructions: "Sit near the edge of a chair. Cross your arms over your chest. Push through your heels to stand, then slowly sit back down.",
    category: "lower",
    difficulty: "intermediate",
    datasetKey: "sit_to_stand",
    evaluator: sitToStandEvaluator,
  },
  squat: {
    id: "squat",
    name: "Squat",
    description: "Bend your knees to lower your body and return to standing.",
    instructions: "Stand feet shoulder-width apart. Lower your hips down and back, keeping your chest up, then return to standing.",
    category: "lower",
    difficulty: "intermediate",
    datasetKey: "sit_to_stand",
    evaluator: squatEvaluator,
  },
};
