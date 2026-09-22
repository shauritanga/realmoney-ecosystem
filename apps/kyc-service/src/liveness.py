import cv2
import numpy as np
from typing import List, Dict, Any, Optional
from .config import settings
from .face import detect_face_bbox, crop_face

def check_passive_liveness(img: np.ndarray) -> Dict[str, Any]:
    """
    Evaluates Fourier domain high-frequency distribution to detect screen replay / moire patterns.
    Digital screens (phones, monitors) emit periodic high-frequency grid artifacts.
    """
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape
    
    # 2D Fast Fourier Transform
    dft = cv2.dft(np.float32(gray), flags=cv2.DFT_COMPLEX_OUTPUT)
    dft_shift = np.fft.fftshift(dft)
    magnitude_spectrum = 20 * np.log(cv2.magnitude(dft_shift[:, :, 0], dft_shift[:, :, 1]) + 1)
    
    # High frequency ratio (edges of the frequency spectrum)
    cx, cy = w // 2, h // 2
    r = min(cx, cy) // 4
    mask = np.ones((h, w), np.uint8)
    cv2.circle(mask, (cx, cy), r, 0, -1)
    
    high_freq_energy = np.mean(magnitude_spectrum[mask == 1])
    total_energy = np.mean(magnitude_spectrum)
    
    ratio = float(high_freq_energy / max(total_energy, 1e-5))
    
    # Screen attacks typically produce abnormally spiky high frequency ratios (> 0.95 or < 0.20)
    is_live_texture = 0.25 <= ratio <= 0.92
    confidence = float(np.clip(1.0 - abs(ratio - 0.55), 0.0, 1.0))
    
    return {
        "is_live_texture": is_live_texture,
        "texture_confidence": round(confidence, 4),
        "freq_ratio": round(ratio, 4),
    }

def check_active_liveness(frames: List[np.ndarray]) -> Dict[str, Any]:
    """
    Analyzes motion, eye state variation, and natural face shift across sequence of frames.
    """
    if not frames:
        return {"passed": False, "confidence": 0.0, "blinksDetected": 0}
    
    if len(frames) == 1:
        # Fallback to single frame passive analysis
        passive = check_passive_liveness(frames[0])
        passed = passive["is_live_texture"]
        confidence = passive["texture_confidence"]
        return {"passed": passed, "confidence": confidence, "blinksDetected": 0}
    
    diffs = []
    face_crops = []
    for i in range(len(frames)):
        bbox = detect_face_bbox(frames[i])
        crop = crop_face(frames[i], bbox)
        crop_resized = cv2.resize(crop, (128, 128))
        face_crops.append(crop_resized)
        
        if i > 0:
            # Measure inter-frame difference
            g1 = cv2.cvtColor(face_crops[i-1], cv2.COLOR_BGR2GRAY)
            g2 = cv2.cvtColor(face_crops[i], cv2.COLOR_BGR2GRAY)
            diff = cv2.absdiff(g1, g2)
            motion_score = float(np.mean(diff))
            diffs.append(motion_score)
            
    avg_motion = float(np.mean(diffs)) if diffs else 0.0
    
    # A static printed photo held still produces avg_motion near 0.0
    # A video replay or live user produces healthy micro-motion between 2.0 and 45.0
    has_natural_motion = 2.0 <= avg_motion <= 50.0
    
    # Check passive texture on best focused frame
    passive_results = [check_passive_liveness(f) for f in frames]
    best_texture_conf = max(p["texture_confidence"] for p in passive_results)
    
    # Eye blink / movement detection in upper half of face crop
    blinks_detected = 0
    for i in range(1, len(face_crops)):
        eye_region1 = face_crops[i-1][30:70, 20:108]
        eye_region2 = face_crops[i][30:70, 20:108]
        eye_diff = float(np.mean(cv2.absdiff(eye_region1, eye_region2)))
        if eye_diff > 4.5:
            blinks_detected += 1
            
    motion_conf = 0.85 if has_natural_motion else 0.3
    blink_bonus = 0.15 if blinks_detected > 0 else 0.0
    
    overall_conf = float(np.clip((0.5 * best_texture_conf) + (0.35 * motion_conf) + blink_bonus, 0.0, 1.0))
    passed = overall_conf >= settings.LIVENESS_THRESHOLD and has_natural_motion
    
    return {
        "passed": passed,
        "confidence": round(overall_conf, 4),
        "blinksDetected": blinks_detected,
        "avgMotion": round(avg_motion, 2),
    }
