"""
Processes the raw pose landmark CSVs and computes statistically-derived
clinical baselines for each exercise type.

Outputs: src/lib/ai/derivedBaselines.json
"""

import json
import math
import numpy as np
import pandas as pd
from pathlib import Path

# --- MediaPipe landmark indices ---
# https://developers.google.com/mediapipe/solutions/vision/pose_landmarker
LM = {
    "left_shoulder":  11,
    "right_shoulder": 12,
    "left_elbow":     13,
    "right_elbow":    14,
    "left_wrist":     15,
    "right_wrist":    16,
    "left_hip":       23,
    "right_hip":      24,
    "left_knee":      25,
    "right_knee":     26,
    "left_ankle":     27,
    "right_ankle":    28,
}

def get_xyz(row, name):
    i = LM[name]
    return np.array([row[f"lm_{i}_x"], row[f"lm_{i}_y"], row[f"lm_{i}_z"]])

def angle_between(a, b, c):
    """Angle at vertex b formed by rays b->a and b->c (degrees)."""
    ba = a - b
    bc = c - b
    cos_angle = np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc) + 1e-9)
    return math.degrees(math.acos(np.clip(cos_angle, -1.0, 1.0)))

def shoulder_abduction_angle(row):
    """
    Angle of right arm abduction:
    hip -> shoulder -> wrist (lateral raise angle from torso)
    """
    hip = get_xyz(row, "right_hip")
    shoulder = get_xyz(row, "right_shoulder")
    wrist = get_xyz(row, "right_wrist")
    return angle_between(hip, shoulder, wrist)

def elbow_angle(row):
    """Elbow flexion/extension angle: shoulder -> elbow -> wrist"""
    shoulder = get_xyz(row, "right_shoulder")
    elbow = get_xyz(row, "right_elbow")
    wrist = get_xyz(row, "right_wrist")
    return angle_between(shoulder, elbow, wrist)

def knee_angle(row):
    """Knee flexion angle: hip -> knee -> ankle"""
    hip = get_xyz(row, "right_hip")
    knee = get_xyz(row, "right_knee")
    ankle = get_xyz(row, "right_ankle")
    return angle_between(hip, knee, ankle)

def hip_angle(row):
    """Hip flexion angle for sit-to-stand: shoulder -> hip -> knee"""
    shoulder = get_xyz(row, "right_shoulder")
    hip = get_xyz(row, "right_hip")
    knee = get_xyz(row, "right_knee")
    return angle_between(shoulder, hip, knee)

# --- Load and process CSVs ---
csv_dir = Path("dataset_csvs")

def load_and_compute(csv_path, angle_fns):
    """Load a CSV and compute angles for each frame."""
    df = pd.read_csv(csv_path)
    results = {name: [] for name in angle_fns}
    
    for _, row in df.iterrows():
        for name, fn in angle_fns.items():
            try:
                results[name].append(fn(row))
            except Exception:
                pass
    return results

print("Processing Arm Raise datasets...")
arm_correct = load_and_compute(
    csv_dir / "Arm_Raise_Correct.csv",
    {"shoulder_abduction": shoulder_abduction_angle, "elbow_ext": elbow_angle}
)
arm_incorrect = load_and_compute(
    csv_dir / "Arm_Raise_Incorrect.csv",
    {"shoulder_abduction": shoulder_abduction_angle, "elbow_ext": elbow_angle}
)

print("Processing Knee Extension datasets...")
knee_correct = load_and_compute(
    csv_dir / "Knee_Extension_Correct.csv",
    {"knee_angle": knee_angle}
)
knee_incorrect = load_and_compute(
    csv_dir / "Knee_Extension_Incorrect.csv",
    {"knee_angle": knee_angle}
)

print("Processing Sit-to-Stand datasets...")
sts_correct = load_and_compute(
    csv_dir / "Sit_To_Stand_Correct.csv",
    {"hip_angle": hip_angle, "knee_angle": knee_angle}
)
sts_incorrect = load_and_compute(
    csv_dir / "Sit_To_Stand_Incorrect.csv",
    {"hip_angle": hip_angle, "knee_angle": knee_angle}
)

def stats(values):
    arr = np.array(values)
    arr = arr[~np.isnan(arr)]
    return {
        "mean": round(float(np.mean(arr)), 1),
        "std":  round(float(np.std(arr)), 1),
        "p5":   round(float(np.percentile(arr, 5)), 1),
        "p25":  round(float(np.percentile(arr, 25)), 1),
        "p50":  round(float(np.percentile(arr, 50)), 1),
        "p75":  round(float(np.percentile(arr, 75)), 1),
        "p95":  round(float(np.percentile(arr, 95)), 1),
        "n":    int(len(arr))
    }

baselines = {
    "arm_raise": {
        "description": "Right arm lateral raise to shoulder height, elbow extended.",
        "correct_form": {
            "shoulder_abduction_deg": stats(arm_correct["shoulder_abduction"]),
            "elbow_extension_deg":    stats(arm_correct["elbow_ext"]),
        },
        "incorrect_form": {
            "shoulder_abduction_deg": stats(arm_incorrect["shoulder_abduction"]),
            "elbow_extension_deg":    stats(arm_incorrect["elbow_ext"]),
        }
    },
    "knee_extension": {
        "description": "Seated knee extension (leg straightening).",
        "correct_form": {
            "knee_angle_deg": stats(knee_correct["knee_angle"]),
        },
        "incorrect_form": {
            "knee_angle_deg": stats(knee_incorrect["knee_angle"]),
        }
    },
    "sit_to_stand": {
        "description": "Rising from a seated position to standing.",
        "correct_form": {
            "hip_angle_deg":  stats(sts_correct["hip_angle"]),
            "knee_angle_deg": stats(sts_correct["knee_angle"]),
        },
        "incorrect_form": {
            "hip_angle_deg":  stats(sts_incorrect["hip_angle"]),
            "knee_angle_deg": stats(sts_incorrect["knee_angle"]),
        }
    }
}

output_path = Path("src/lib/ai/derivedBaselines.json")
output_path.parent.mkdir(parents=True, exist_ok=True)
with open(output_path, "w") as f:
    json.dump(baselines, f, indent=2)

print(f"\n✅ Done! Baselines saved to {output_path}")
print("\nKey stats:")
arm_s = baselines["arm_raise"]["correct_form"]["shoulder_abduction_deg"]
print(f"  Arm Raise (correct) - Shoulder abduction: mean={arm_s['mean']}° p25={arm_s['p25']}° p75={arm_s['p75']}°")
knee_s = baselines["knee_extension"]["correct_form"]["knee_angle_deg"]
print(f"  Knee Extension (correct) - Knee angle: mean={knee_s['mean']}° p25={knee_s['p25']}° p75={knee_s['p75']}°")
sts_h = baselines["sit_to_stand"]["correct_form"]["hip_angle_deg"]
print(f"  Sit-to-Stand (correct) - Hip angle: mean={sts_h['mean']}° p25={sts_h['p25']}° p75={sts_h['p75']}°")
