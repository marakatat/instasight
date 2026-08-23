import os
import cv2
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
import pandas as pd
import time

DATASET_DIR = "/home/mehoi/Templates/dataset/Blurred/"
OUTPUT_DIR = "dataset_csvs"
MODEL_PATH = "pose_landmarker.task"

os.makedirs(OUTPUT_DIR, exist_ok=True)

base_options = python.BaseOptions(model_asset_path=MODEL_PATH)
options = vision.PoseLandmarkerOptions(
    base_options=base_options,
    running_mode=vision.RunningMode.IMAGE,
    min_pose_detection_confidence=0.5,
    min_tracking_confidence=0.5
)

# Generate column names for the 33 landmarks
columns = ["video_name", "frame_idx", "label"]
for i in range(33):
    columns.extend([f"lm_{i}_x", f"lm_{i}_y", f"lm_{i}_z", f"lm_{i}_v"])

print(f"Starting extraction from {DATASET_DIR}...")
start_time = time.time()

with vision.PoseLandmarker.create_from_options(options) as landmarker:
    for folder_name in os.listdir(DATASET_DIR):
        folder_path = os.path.join(DATASET_DIR, folder_name)
        if not os.path.isdir(folder_path):
            continue
            
        print(f"Processing folder: {folder_name}")
        rows = []
        video_files = [f for f in os.listdir(folder_path) if f.endswith(".mp4")]
        
        for video_idx, video_file in enumerate(video_files):
            video_path = os.path.join(folder_path, video_file)
            
            cap = cv2.VideoCapture(video_path)
            fps = cap.get(cv2.CAP_PROP_FPS)
            frame_idx = 0
            
            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break
                    
                image = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=image)
                
                # Calculate deterministic timestamp in ms
                timestamp_ms = int(frame_idx * (1000.0 / (fps if fps > 0 else 30.0)))
                
                try:
                    result = landmarker.detect(mp_image)
                    if result and result.pose_landmarks:
                        landmarks = result.pose_landmarks[0]
                        row = [video_file, frame_idx, folder_name]
                        for lm in landmarks:
                            row.extend([lm.x, lm.y, lm.z, lm.visibility])
                        rows.append(row)
                except Exception as e:
                    print(f"Error processing frame {frame_idx}: {e}")
                
                frame_idx += 1
                
            cap.release()
            print(f"  Processed {video_file} ({video_idx+1}/{len(video_files)})")
            
        if rows:
            df = pd.DataFrame(rows, columns=columns)
            output_file = os.path.join(OUTPUT_DIR, f"{folder_name.replace(' ', '_')}.csv")
            df.to_csv(output_file, index=False)
            print(f"Saved {output_file} with {len(rows)} frames.")

print(f"Extraction complete in {time.time() - start_time:.2f} seconds!")
