import cv2
import numpy as np
from typing import Optional, Tuple, Dict, Any
from .config import settings

def detect_face_bbox(img: np.ndarray) -> Optional[Tuple[int, int, int, int]]:
    """
    Detects face bounding box (x, y, w, h).
    Uses YCrCb skin color segmentation and elliptical contour analysis.
    """
    h, w = img.shape[:2]
    # Convert to YCrCb
    ycrcb = cv2.cvtColor(img, cv2.COLOR_BGR2YCrCb)
    # Standard human skin tone ranges in YCrCb
    lower = np.array([0, 133, 77], dtype=np.uint8)
    upper = np.array([255, 173, 127], dtype=np.uint8)
    mask = cv2.inRange(ycrcb, lower, upper)
    
    # Morphological operations to remove noise
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    mask = cv2.erode(mask, kernel, iterations=1)
    mask = cv2.dilate(mask, kernel, iterations=2)
    
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    candidates = []
    for c in contours:
        area = cv2.contourArea(c)
        if area < (h * w * 0.03):  # Ignore tiny areas
            continue
        x, y, cw, ch = cv2.boundingRect(c)
        aspect = ch / float(cw)
        # Typical human face aspect ratio is between 1.0 and 1.8
        if 0.9 <= aspect <= 2.2:
            candidates.append((area, (x, y, cw, ch)))
            
    if candidates:
        # Return largest candidate bounding box
        candidates.sort(key=lambda item: item[0], reverse=True)
        return candidates[0][1]
    
    # Fallback: center-upper crop if image is a portrait
    return (int(w * 0.2), int(h * 0.1), int(w * 0.6), int(h * 0.7))

def crop_face(img: np.ndarray, bbox: Optional[Tuple[int, int, int, int]] = None) -> np.ndarray:
    if bbox is None:
        bbox = detect_face_bbox(img)
    if bbox is None:
        return img
    x, y, w, h = bbox
    # Add 10% padding
    pad_x = int(w * 0.1)
    pad_y = int(h * 0.1)
    x1 = max(0, x - pad_x)
    y1 = max(0, y - pad_y)
    x2 = min(img.shape[1], x + w + pad_x)
    y2 = min(img.shape[0], y + h + pad_y)
    return img[y1:y2, x1:x2]

def compute_face_similarity(face1_img: np.ndarray, face2_img: np.ndarray) -> Dict[str, Any]:
    """
    Compares two face crops using multi-channel color histograms and edge gradients.
    Returns cosine/correlation similarity score [0.0 to 1.0].
    """
    # Resize both to standard 128x128
    f1 = cv2.resize(face1_img, (128, 128))
    f2 = cv2.resize(face2_img, (128, 128))
    
    # 1. HSV Histogram Comparison (Color/Hue distribution)
    hsv1 = cv2.cvtColor(f1, cv2.COLOR_BGR2HSV)
    hsv2 = cv2.cvtColor(f2, cv2.COLOR_BGR2HSV)
    
    hist1 = cv2.calcHist([hsv1], [0, 1], None, [30, 32], [0, 180, 0, 256])
    hist2 = cv2.calcHist([hsv2], [0, 1], None, [30, 32], [0, 180, 0, 256])
    
    cv2.normalize(hist1, hist1, 0, 1, cv2.NORM_MINMAX)
    cv2.normalize(hist2, hist2, 0, 1, cv2.NORM_MINMAX)
    
    color_sim = float(cv2.compareHist(hist1, hist2, cv2.HISTCMP_CORREL))
    color_sim = max(0.0, color_sim)
    
    # 2. Structural gradient / edge correlation
    gray1 = cv2.cvtColor(f1, cv2.COLOR_BGR2GRAY)
    gray2 = cv2.cvtColor(f2, cv2.COLOR_BGR2GRAY)
    
    sobel1 = cv2.Sobel(gray1, cv2.CV_64F, 1, 1, ksize=3)
    sobel2 = cv2.Sobel(gray2, cv2.CV_64F, 1, 1, ksize=3)
    
    grad1_flat = sobel1.flatten()
    grad2_flat = sobel2.flatten()
    
    norm1 = np.linalg.norm(grad1_flat)
    norm2 = np.linalg.norm(grad2_flat)
    
    if norm1 > 0 and norm2 > 0:
        grad_sim = float(np.dot(grad1_flat, grad2_flat) / (norm1 * norm2))
        grad_sim = max(0.0, grad_sim)
    else:
        grad_sim = 0.5
        
    # Weighted ensemble score
    similarity = (0.6 * color_sim) + (0.4 * grad_sim)
    similarity = round(float(np.clip(similarity, 0.0, 1.0)), 4)
    
    passed = similarity >= settings.FACE_MATCH_THRESHOLD
    return {
        "passed": passed,
        "similarity": similarity,
        "color_similarity": round(color_sim, 4),
        "grad_similarity": round(grad_sim, 4),
    }
