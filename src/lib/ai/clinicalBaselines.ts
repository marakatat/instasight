/**
 * This acts as the "Doctor's Dataset" or "Ground Truth" for the AI evaluation.
 * It contains the clinical baselines that the AI will compare the live patient
 * metrics against to generate personalized feedback.
 */
export const clinicalBaselines = {
  right_arm_raise: {
    description: "Raise the right arm to shoulder height, keeping the elbow extended.",
    targetMetrics: {
      shoulderAngle: {
        min: 70,
        ideal: 90,
        max: 110,
        clinicalNote: "Raising above 110 may cause impingement. Below 70 is incomplete ROM."
      },
      elbowAngle: {
        min: 160,
        ideal: 180,
        clinicalNote: "Elbow should remain extended throughout the movement."
      },
      tempoSeconds: {
        min: 2.0,
        ideal: 3.0,
        max: 4.5,
        clinicalNote: "Movement must be controlled. Too fast indicates momentum usage."
      }
    }
  },
  // We can add other exercises prescribed by the doctor here
};
