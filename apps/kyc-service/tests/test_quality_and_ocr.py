import pytest
import numpy as np
import cv2

from src.quality import check_blur, check_glare, assess_image_quality
from src.ocr import extract_nida_nin, extract_date_from_nin, parse_passport_mrz, parse_document_text
from src.liveness import check_passive_liveness, check_active_liveness
from src.face import compute_face_similarity

def test_blur_detection():
    # Crisp image with sharp edges
    sharp_img = np.zeros((300, 300, 3), dtype=np.uint8)
    cv2.rectangle(sharp_img, (50, 50), (250, 250), (255, 255, 255), 4)
    cv2.putText(sharp_img, "TEST NIDA CARD", (60, 150), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
    is_blurry, variance = check_blur(sharp_img)
    assert not is_blurry
    assert variance > 100

    # Extremely blurred image
    blurry_img = cv2.GaussianBlur(sharp_img, (45, 45), 0)
    is_blurry, variance = check_blur(blurry_img)
    assert is_blurry
    assert variance < 80

def test_glare_detection():
    normal_img = np.ones((100, 100, 3), dtype=np.uint8) * 150
    has_glare, ratio = check_glare(normal_img)
    assert not has_glare
    assert ratio == 0.0

    # Large white/specular glare patch
    glare_img = normal_img.copy()
    glare_img[10:90, 10:90] = 255
    has_glare, ratio = check_glare(glare_img)
    assert has_glare
    assert ratio > 0.10

def test_nida_nin_extraction():
    sample_text = """
    JAMHURI YA MUUNGANO WA TANZANIA
    KITAMBULISHO CHA TAIFA
    Namba: 19920815-12345-00001-89
    Jina: JUMA HASSAN MWINYI
    """
    nin = extract_nida_nin(sample_text)
    assert nin == "19920815123450000189"
    dob = extract_date_from_nin(nin)
    assert dob == "1992-08-15"

def test_nida_continuous_digits():
    sample_text = "NIN 19851224102938475610 VALID"
    nin = extract_nida_nin(sample_text)
    assert nin == "19851224102938475610"
    assert extract_date_from_nin(nin) == "1985-12-24"

def test_passport_mrz_parsing():
    mrz_text = """
    P<TZAMWINYI<<JUMA<HASSAN<<<<<<<<<<<<<<<<<<<
    A1234567<3TZA9208154M3112318<<<<<<<<<<<<<<02
    """
    res = parse_passport_mrz(mrz_text)
    assert res["is_mrz"] is True
    assert res["number"] == "A1234567"
    assert "MWINYI" in res["fullName"]
    assert "JUMA" in res["fullName"]
    assert res["dateOfBirth"] == "1992-08-15"

def test_face_similarity():
    # Test identical faces
    face1 = np.ones((100, 100, 3), dtype=np.uint8) * 120
    cv2.circle(face1, (50, 50), 30, (130, 160, 210), -1)
    
    face2 = face1.copy()
    sim_res = compute_face_similarity(face1, face2)
    assert sim_res["passed"] is True
    assert sim_res["similarity"] > 0.85

def test_liveness_detection():
    f1 = np.ones((120, 120, 3), dtype=np.uint8) * 100
    cv2.circle(f1, (60, 60), 30, (130, 160, 210), -1)
    
    # Slight micro-motion
    f2 = np.ones((120, 120, 3), dtype=np.uint8) * 100
    cv2.circle(f2, (62, 60), 30, (130, 160, 210), -1)

    res = check_active_liveness([f1, f2])
    assert "confidence" in res
    assert res["confidence"] > 0.0
