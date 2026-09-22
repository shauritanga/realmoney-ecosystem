import cv2
import numpy as np
from typing import Tuple, Dict, Any, Optional
from .config import settings

def decode_image(image_bytes: bytes) -> Optional[np.ndarray]:
    if not image_bytes:
        return None
    nparr = np.frombuffer(image_bytes, np.uint8)
    return cv2.imdecode(nparr, cv2.IMREAD_COLOR)

def check_blur(img: np.ndarray) -> Tuple[bool, float]:
    """
    Computes Laplacian variance. A low variance indicates a blurry / unfocused image.
    """
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    variance = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    is_blurry = variance < settings.BLUR_THRESHOLD
    return is_blurry, round(variance, 2)

def check_glare(img: np.ndarray) -> Tuple[bool, float]:
    """
    Checks for high-intensity specular highlights (glare on laminated ID cards).
    """
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    _, _, v = cv2.split(hsv)
    glare_mask = cv2.threshold(v, 250, 255, cv2.THRESH_BINARY)[1]
    glare_pixels = int(np.sum(glare_mask > 0))
    total_pixels = img.shape[0] * img.shape[1]
    glare_ratio = float(glare_pixels / max(total_pixels, 1))
    has_glare = glare_ratio > settings.GLARE_RATIO_THRESHOLD
    return has_glare, round(glare_ratio, 4)

def find_document_contour(img: np.ndarray) -> Optional[np.ndarray]:
    """
    Finds the rectangular contour representing the ID card or document.
    """
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edged = cv2.Canny(blurred, 50, 150)
    
    contours, _ = cv2.findContours(edged, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)[:5]
    
    for c in contours:
        peri = cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, 0.02 * peri, True)
        if len(approx) == 4 and cv2.contourArea(c) > (img.shape[0] * img.shape[1] * 0.15):
            return approx.reshape(4, 2)
    return None

def order_points(pts: np.ndarray) -> np.ndarray:
    rect = np.zeros((4, 2), dtype="float32")
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]  # top-left
    rect[2] = pts[np.argmax(s)]  # bottom-right
    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]  # top-right
    rect[3] = pts[np.argmax(diff)]  # bottom-left
    return rect

def deskew_and_crop(img: np.ndarray) -> np.ndarray:
    """
    Attempts to align and warp perspective of the document card.
    If no clean 4-point contour is detected, returns original image.
    """
    pts = find_document_contour(img)
    if pts is None:
        return img
    
    rect = order_points(pts)
    (tl, tr, br, bl) = rect
    
    width_a = np.sqrt(((br[0] - bl[0]) ** 2) + ((br[1] - bl[1]) ** 2))
    width_b = np.sqrt(((tr[0] - tl[0]) ** 2) + ((tr[1] - tl[1]) ** 2))
    max_width = max(int(width_a), int(width_b))
    
    height_a = np.sqrt(((tr[0] - br[0]) ** 2) + ((tr[1] - br[1]) ** 2))
    height_b = np.sqrt(((tl[0] - bl[0]) ** 2) + ((tl[1] - bl[1]) ** 2))
    max_height = max(int(height_a), int(height_b))
    
    dst = np.array([
        [0, 0],
        [max_width - 1, 0],
        [max_width - 1, max_height - 1],
        [0, max_height - 1]
    ], dtype="float32")
    
    M = cv2.getPerspectiveTransform(rect, dst)
    warped = cv2.warpPerspective(img, M, (max_width, max_height))
    return warped

def assess_image_quality(image_bytes: bytes) -> Dict[str, Any]:
    img = decode_image(image_bytes)
    if img is None:
        return {"valid": False, "error": "Unable to decode image bytes"}
    
    is_blurry, blur_score = check_blur(img)
    has_glare, glare_ratio = check_glare(img)
    
    return {
        "valid": True,
        "is_blurry": is_blurry,
        "blur_score": blur_score,
        "has_glare": has_glare,
        "glare_ratio": glare_ratio,
        "width": img.shape[1],
        "height": img.shape[0],
    }
