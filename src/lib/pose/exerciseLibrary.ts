import { PoseMetrics, ExercisePhase } from "@/types/rehabilitation";
import { angle } from "./geometry";

// Standard MediaPipe Pose Landmarks
export const POSE_LANDMARKS = {
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
};

export interface ExerciseDefinition {
  id: string;
  name: string;
  description: string;
  instructions: string;
  evaluator: (
    landmarks: any[], 
    previousPhase: ExercisePhase, 
    repetition: number
  ) => PoseMetrics;
}

export const EXERCISE_LIBRARY: Record<string, ExerciseDefinition> = {
  right_arm_raise: {
    id: "right_arm_raise",
    name: "Right Arm Raise",
    description: "Raise your right arm to the side as high as comfortable.",
    instructions: "Stand straight. Keep your arm straight and lift to the side.",
    evaluator: (landmarks, previousPhase, repetition) => {
      if (!landmarks || landmarks.length < 33) {
         return { timestamp: Date.now(), repetition, phase: previousPhase, movementScore: 0, rangeOfMotion: 0 };
      }

      const shoulder = landmarks[POSE_LANDMARKS.RIGHT_SHOULDER];
      const elbow = landmarks[POSE_LANDMARKS.RIGHT_ELBOW];
      const wrist = landmarks[POSE_LANDMARKS.RIGHT_WRIST];
      const hip = landmarks[POSE_LANDMARKS.RIGHT_HIP];

      // Calculate shoulder abduction angle (Hip - Shoulder - Elbow)
      const shoulderAngle = angle(hip, shoulder, elbow);
      // Calculate elbow extension angle (Shoulder - Elbow - Wrist)
      const elbowAngle = angle(shoulder, elbow, wrist);

      let error: string | undefined;
      const isShoulderHighEnough = shoulderAngle >= 70;
      const elbowIsReasonable = elbowAngle > 120;
      const isArmResting = shoulderAngle < 30;

      if (!isShoulderHighEnough && previousPhase === "holding") {
        error = "Try to raise your arm a little higher.";
      } else if (!elbowIsReasonable) {
        error = "Try to keep your arm more extended.";
      }

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
    },
  },
  squat: {
    id: "squat",
    name: "Squat",
    description: "Bend your knees to lower your body, keeping your back straight.",
    instructions: "Stand with feet shoulder-width apart. Lower your hips down and back.",
    evaluator: (landmarks, previousPhase, repetition) => {
      if (!landmarks || landmarks.length < 33) {
         return { timestamp: Date.now(), repetition, phase: previousPhase, movementScore: 0, rangeOfMotion: 0 };
      }

      const hip = landmarks[POSE_LANDMARKS.RIGHT_HIP];
      const knee = landmarks[POSE_LANDMARKS.RIGHT_KNEE];
      const ankle = landmarks[POSE_LANDMARKS.RIGHT_ANKLE];

      // Knee angle (Hip - Knee - Ankle)
      const kneeAngle = angle(hip, knee, ankle);

      let error: string | undefined;
      // Normal standing is ~180. Squat is < 90
      const isSquatDeepEnough = kneeAngle <= 100;
      const isStanding = kneeAngle > 160;

      if (!isSquatDeepEnough && previousPhase === "holding") {
        error = "Try to go a bit lower into the squat.";
      }

      let newPhase = previousPhase;
      if (isStanding) {
        newPhase = "idle";
      } else if (kneeAngle <= 100) {
        newPhase = "holding";
      } else if (previousPhase === "idle" && kneeAngle < 160) {
        newPhase = "lowering"; // For squat, going down is the active phase
      } else if (previousPhase === "holding" && kneeAngle > 100) {
        newPhase = "raising";
      }

      return {
        timestamp: Date.now(),
        repetition,
        phase: newPhase,
        movementScore: error ? 0.6 : 0.95,
        rangeOfMotion: Math.max(0, 180 - kneeAngle),
        error,
      };
    }
  }
};
