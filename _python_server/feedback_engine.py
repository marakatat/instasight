"""
Multimodal Feedback Engine
Combines real-time EEG mental intent metrics with Computer Vision (Pose) kinematics
to deliver intelligent, encouraging clinical coaching.
"""

from typing import Dict, Any, List, Optional
import uuid
import time


def evaluate_multimodal_feedback(
    pose: Dict[str, Any],
    eeg: Optional[Dict[str, Any]] = None,
    exercise_id: str = "right_arm_raise",
    session_id: str = "default_session",
    video_time_ms: int = 0
) -> Dict[str, Any]:
    """
    Combines EEG motor attempt + Pose kinematics to generate targeted feedback.

    Pose fields:
        - shoulderAngle (float): e.g. 65 degrees
        - elbowAngle (float): e.g. 165 degrees (straight arm)
        - movementDurationMs (int): e.g. 2500 ms
        - rangeOfMotion (float): max angle reached
        - poseConfidence (float): 0.0 to 1.0
        - repetitionNumber (int): e.g. 1
        - exercisePhase (str): 'idle' | 'lifting' | 'holding' | 'lowering' | 'complete'

    EEG fields:
        - signalQuality (float): 0.0 to 1.0
        - motorAttemptProbability (float): 0.0 to 1.0
        - isAttemptDetected (bool)
    """
    reasons: List[str] = []
    messages: List[str] = []
    severity: str = "success"

    # Default EEG state if None
    eeg_data = eeg or {
        "signalQuality": 0.90,
        "motorAttemptProbability": 0.75,
        "isAttemptDetected": True
    }

    signal_quality = eeg_data.get("signalQuality", 0.9)
    motor_prob = eeg_data.get("motorAttemptProbability", 0.7)

    shoulder_angle = pose.get("shoulderAngle") or pose.get("rangeOfMotion") or 0.0
    elbow_angle = pose.get("elbowAngle", 170.0)
    duration_ms = pose.get("movementDurationMs", 2500)
    confidence = pose.get("poseConfidence", 0.9)
    phase = pose.get("exercisePhase", "complete")

    # 1. EEG Signal & Intention Checks
    if signal_quality < 0.35:
        reasons.append("EEG_SIGNAL_NOISY")
        messages.append("EEG electrode contact is low. Please check headband placement.")
        severity = "info"

    # Brain-Computer Interface Insight: Motor attempt vs physical movement
    if motor_prob >= 0.70 and shoulder_angle < 45.0:
        # High mental engagement, but physical movement restricted
        reasons.append("HIGH_INTENT_LOW_PHYSICAL_ROM")
        messages.append("Strong neural activation detected! Keep focusing on the intention to lift.")
        severity = "info"
    elif motor_prob < 0.40 and shoulder_angle < 50.0:
        reasons.append("LOW_MOTOR_INTENT")
        messages.append("Try to mentally visualize the movement before lifting.")
        severity = "info"

    # 2. Pose Kinematics Checks (Arm Raise exercise targets)
    if confidence < 0.55:
        reasons.append("LOW_CAMERA_CONFIDENCE")
        messages.append("Please adjust your position so your arm and torso are clearly visible.")
        severity = "warning"
    else:
        # Range of motion check
        if shoulder_angle < 70.0 and "HIGH_INTENT_LOW_PHYSICAL_ROM" not in reasons:
            reasons.append("RANGE_OF_MOTION_BELOW_TARGET")
            messages.append("Good effort. Try to raise your arm slightly higher if comfortable.")
            severity = "warning"

        # Movement speed check
        if duration_ms < 1800:
            reasons.append("MOVEMENT_TOO_FAST")
            messages.append("Try to move more slowly and steadily.")
            severity = "warning"

        # Elbow compensation check (patient bending elbow to cheat shoulder lift)
        if elbow_angle < 130.0:
            reasons.append("EXCESSIVE_ELBOW_FLEXION")
            messages.append("Keep your elbow straight while raising your arm.")
            severity = "warning"

    # 3. Formulate Primary Suggestion
    if not messages:
        if motor_prob > 0.65:
            suggestion = "Excellent movement and strong neural focus! Keep this steady rhythm."
        else:
            suggestion = "Good movement. Continue to the next repetition."
        severity = "success"
    else:
        suggestion = " ".join(messages[:2])

    feedback_id = f"fb_{uuid.uuid4().hex[:8]}"

    return {
        "id": feedback_id,
        "sessionId": session_id,
        "videoTimeMs": video_time_ms,
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "suggestion": suggestion,
        "severity": severity,
        "reasonCodes": reasons,
        "eeg": {
            "signalQuality": round(signal_quality, 2),
            "motorAttemptProbability": round(motor_prob, 2),
            "isAttemptDetected": motor_prob >= 0.55
        },
        "pose": {
            "shoulderAngle": round(shoulder_angle, 1),
            "elbowAngle": round(elbow_angle, 1),
            "durationMs": duration_ms,
            "confidence": round(confidence, 2)
        },
        "source": "multimodal-fastapi-engine"
    }
