import re
import unicodedata
from typing import Dict, Any, List
from datetime import datetime, timezone
import numpy as np

from .config import settings
from .storage import store
from .quality import decode_image, assess_image_quality, deskew_and_crop
from .ocr import run_tesseract, parse_document_text
from .face import crop_face, compute_face_similarity
from .liveness import check_active_liveness

def normalize_text(text: str) -> str:
    if not text:
        return ""
    text = unicodedata.normalize("NFKC", text).strip().upper()
    return re.sub(r'\s+', ' ', text)

def normalize_number(num: str) -> str:
    if not num:
        return ""
    return re.sub(r'[\s-]', '', str(num)).upper()

def process_verification(session_id: str) -> Dict[str, Any]:
    session = store.get_session(session_id)
    if not session:
        raise ValueError(f"Session {session_id} not found")

    required_sides = session.get("requiredSides", ["front", "back"])
    identity = session.get("identity", {})
    doc_type = identity.get("type", "NIDA")
    
    # 1. Inspect captured sides
    captured_sides = []
    front_bytes = store.get_asset_bytes(session_id, "front.jpg")
    back_bytes = store.get_asset_bytes(session_id, "back.jpg")
    
    if front_bytes:
        captured_sides.append("biodata" if "biodata" in required_sides else "front")
    if back_bytes:
        captured_sides.append("back")

    missing_sides = [side for side in required_sides if side not in captured_sides]
    if missing_sides:
        session["status"] = "capture_required"
        session["errorReason"] = f"Missing required sides: {', '.join(missing_sides)}"
        store.save_session(session)
        return session

    # 2. Quality & Deskew on Front document
    front_img = decode_image(front_bytes)
    if front_img is None:
        session["status"] = "review"
        session["errorReason"] = "Could not decode front document image"
        store.save_session(session)
        return session

    quality = assess_image_quality(front_bytes)
    aligned_front = deskew_and_crop(front_img)

    # 3. OCR Text Extraction
    ocr_text = run_tesseract(aligned_front)
    doc_parsed = parse_document_text(ocr_text, doc_type, expected=identity)

    # Fallback for dev mode or when document matches expected
    norm_doc_name = normalize_text(doc_parsed.get("fullName", ""))
    norm_exp_name = normalize_text(identity.get("fullName", ""))
    norm_doc_num = normalize_number(doc_parsed.get("number", ""))
    norm_exp_num = normalize_number(identity.get("number", ""))
    doc_dob = doc_parsed.get("dateOfBirth", "")
    exp_dob = identity.get("dateOfBirth", "")

    # In development mode or when testing without real camera hardware
    if settings.DEV_MODE and not doc_parsed.get("authentic"):
        doc_parsed["authentic"] = True
        doc_parsed["fullName"] = identity.get("fullName", "")
        doc_parsed["number"] = identity.get("number", "")
        doc_parsed["dateOfBirth"] = identity.get("dateOfBirth", "")

    # Document authenticity flag
    doc_authentic = bool(doc_parsed.get("authentic", False))

    # Match registration checks
    registration_match = (
        doc_type == identity.get("type") and
        norm_doc_name == norm_exp_name and
        norm_doc_num == norm_exp_num and
        doc_dob == exp_dob
    )

    # 4. Liveness Check on Selfie Burst
    selfie_bytes_list = store.list_selfie_assets(session_id)
    selfie_frames = [decode_image(b) for b in selfie_bytes_list if b]
    selfie_frames = [f for f in selfie_frames if f is not None]

    if selfie_frames:
        liveness_res = check_active_liveness(selfie_frames)
    else:
        # If no selfie uploaded yet
        liveness_res = {"passed": False, "confidence": 0.0, "blinksDetected": 0}

    # 5. Face Matching (Front Doc vs Best Selfie)
    if selfie_frames and front_img is not None:
        doc_face = crop_face(aligned_front)
        selfie_face = crop_face(selfie_frames[0])
        face_match_res = compute_face_similarity(doc_face, selfie_face)
    else:
        face_match_res = {"passed": False, "similarity": 0.0}

    if settings.DEV_MODE:
        liveness_res["passed"] = True
        face_match_res["passed"] = True

    # 6. Overall Decision
    document_result = {
        "authentic": doc_authentic,
        "capturedSides": captured_sides,
        "type": doc_type,
        "fullName": doc_parsed.get("fullName") or identity.get("fullName", ""),
        "number": doc_parsed.get("number") or identity.get("number", ""),
        "dateOfBirth": doc_parsed.get("dateOfBirth") or identity.get("dateOfBirth", ""),
        "blurScore": quality.get("blur_score"),
        "hasGlare": quality.get("has_glare"),
    }

    all_checks_passed = (
        doc_authentic and
        registration_match and
        len(missing_sides) == 0 and
        liveness_res.get("passed") is True and
        face_match_res.get("passed") is True
    )

    session["document"] = document_result
    session["liveness"] = {
        "passed": liveness_res.get("passed", False),
        "confidence": liveness_res.get("confidence", 0.0),
        "blinksDetected": liveness_res.get("blinksDetected", 0)
    }
    session["faceMatch"] = {
        "passed": face_match_res.get("passed", False),
        "similarity": face_match_res.get("similarity", 0.0)
    }

    if all_checks_passed:
        session["status"] = "verified"
    elif quality.get("is_blurry") or not registration_match:
        session["status"] = "review"
    else:
        session["status"] = "review"

    session["updatedAt"] = datetime.now(timezone.utc).isoformat()
    store.save_session(session)
    return session
