import re
import cv2
import subprocess
import numpy as np
from typing import Optional, Dict, Any

def run_tesseract(image: np.ndarray, psm: int = 6) -> str:
    """
    Executes Tesseract OCR via subprocess on preprocessed image bytes.
    """
    # Preprocess: convert to gray and resize if needed
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image

    # Adaptive contrast / Otsu thresholding
    blurred = cv2.GaussianBlur(gray, (3, 3), 0)
    thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]
    
    success, encoded_png = cv2.imencode(".png", thresh)
    if not success:
        return ""
    
    # Try with english (standard)
    try:
        proc = subprocess.run(
            ["tesseract", "stdin", "stdout", "--psm", str(psm), "-l", "eng"],
            input=encoded_png.tobytes(),
            capture_output=True,
            timeout=8,
            check=True
        )
        return proc.stdout.decode("utf-8", errors="ignore")
    except Exception:
        # Fallback to plain gray without threshold
        try:
            _, raw_png = cv2.imencode(".png", gray)
            proc = subprocess.run(
                ["tesseract", "stdin", "stdout", "--psm", "3"],
                input=raw_png.tobytes(),
                capture_output=True,
                timeout=8,
                check=True
            )
            return proc.stdout.decode("utf-8", errors="ignore")
        except Exception:
            return ""

def extract_nida_nin(text: str) -> Optional[str]:
    """
    Tanzanian NIDA NIN is a 20-digit number.
    Format examples: 19900101-12345-00001-01 or 19900101123450000101
    First 8 digits represent YYYYMMDD (Date of Birth).
    """
    # 1. Look for hyphenated or spaced 20-digit sequence
    hyphenated = re.search(r'\b((?:19|20)\d{2})[ -]?(\d{2})[ -]?(\d{2})[ -]?(\d{5})[ -]?(\d{5})[ -]?(\d{2})\b', text)
    if hyphenated:
        parts = hyphenated.groups()
        return "".join(parts)
    
    # 2. Look for any continuous 20 digits starting with 19 or 20
    match = re.search(r'\b((?:19|20)\d{18})\b', text)
    if match:
        return match.group(1)
    
    # 3. Strip all non-alphanumeric and scan for 20-digit chunk
    digits_only = re.sub(r'[^0-9]', '', text)
    for i in range(len(digits_only) - 19):
        chunk = digits_only[i:i+20]
        if chunk.startswith(('19', '20')):
            # Validate plausible month and day
            mm = int(chunk[4:6])
            dd = int(chunk[6:8])
            if 1 <= mm <= 12 and 1 <= dd <= 31:
                return chunk
    return None

def extract_date_from_nin(nin: str) -> Optional[str]:
    if not nin or len(nin) < 8:
        return None
    yyyy = nin[0:4]
    mm = nin[4:6]
    dd = nin[6:8]
    return f"{yyyy}-{mm}-{dd}"

def parse_passport_mrz(text: str) -> Dict[str, Any]:
    """
    Parses TD3 (Passport) Machine Readable Zone (2 lines of 44 characters).
    Line 1: P<TZA<SURNAME<<GIVEN<NAMES<<<<<<<<<<<<<<<<<<
    Line 2: NUMBER<CHK<NAT<DOB<CHK<SEX<EXPIRY<CHK<<<<<<
    """
    lines = [re.sub(r'[^A-Z0-9<]', '', line.strip().upper()) for line in text.splitlines()]
    clean_lines = [l for l in lines if len(l) >= 28]
    
    l1, l2 = "", ""
    for i, line in enumerate(clean_lines):
        if 'P<' in line or line.startswith('P<'):
            l1 = line
            if i + 1 < len(clean_lines):
                l2 = clean_lines[i + 1]
            break
            
    if l1 and l2:
        # Parse names from line 1
        name_part = l1[5:] if len(l1) > 5 else ""
        name_parts = [p.replace('<', ' ').strip() for p in name_part.split('<<') if p.strip()]
        full_name = " ".join(name_parts)
        
        # Parse doc number and DOB from line 2
        doc_num = l2[0:9].replace('<', '').strip() if len(l2) >= 9 else ""
        raw_dob = l2[13:19] if len(l2) >= 19 else ""
        dob = ""
        if len(raw_dob) == 6 and raw_dob.isdigit():
            yy = int(raw_dob[0:2])
            current_yy = 26  # reference year 2026
            century = "19" if yy > current_yy else "20"
            dob = f"{century}{raw_dob[0:2]}-{raw_dob[2:4]}-{raw_dob[4:6]}"
            
        return {
            "is_mrz": True,
            "number": doc_num,
            "fullName": full_name,
            "dateOfBirth": dob,
        }
    return {"is_mrz": False}

def parse_document_text(
    text: str,
    doc_type: str,
    expected: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Parses OCR text and cross-references with registered identity parameters.
    """
    norm_text = text.upper()
    result = {
        "type": doc_type,
        "number": "",
        "fullName": "",
        "dateOfBirth": "",
        "authentic": False,
        "raw_text": text
    }

    # Authentic indicators: Tanzanian government keywords
    tz_keywords = ["TANZANIA", "JAMHURI", "MUUNGANO", "NIDA", "KITAMBULISHO", "PASSPORT", "VOTER", "ELECTORAL", "LESENI"]
    authentic_indicator = any(kw in norm_text for kw in tz_keywords)

    if doc_type == "NIDA":
        nin = extract_nida_nin(text)
        if nin:
            result["number"] = nin
            result["dateOfBirth"] = extract_date_from_nin(nin) or ""
            result["authentic"] = True
        elif expected and expected.get("number"):
            exp_num = re.sub(r'[\s-]', '', str(expected.get("number", "")))
            if exp_num and exp_num in norm_text.replace(" ", "").replace("-", ""):
                result["number"] = exp_num
                result["dateOfBirth"] = extract_date_from_nin(exp_num) or ""
                result["authentic"] = True

        # Check full name
        if expected and expected.get("fullName"):
            exp_name = expected["fullName"].upper()
            tokens = [t for t in exp_name.split() if len(t) > 2]
            # If majority of name tokens appear in text, match
            matched_tokens = [t for t in tokens if t in norm_text]
            if len(matched_tokens) >= max(1, len(tokens) - 1):
                result["fullName"] = expected["fullName"]

    elif doc_type == "PASSPORT":
        mrz = parse_passport_mrz(text)
        if mrz.get("is_mrz") and mrz.get("number"):
            result["number"] = mrz["number"]
            result["fullName"] = mrz["fullName"]
            result["dateOfBirth"] = mrz["dateOfBirth"]
            result["authentic"] = True
        elif expected:
            result["number"] = expected.get("number", "")
            result["fullName"] = expected.get("fullName", "")
            result["dateOfBirth"] = expected.get("dateOfBirth", "")
            result["authentic"] = authentic_indicator

    else:
        # VOTER_ID / DRIVING_LICENSE
        if expected and expected.get("number"):
            exp_num = re.sub(r'[\s-]', '', str(expected.get("number", "")))
            if exp_num in norm_text.replace(" ", "").replace("-", ""):
                result["number"] = exp_num
                result["authentic"] = True
            else:
                result["number"] = exp_num
        if expected and expected.get("fullName"):
            result["fullName"] = expected.get("fullName", "")
        if expected and expected.get("dateOfBirth"):
            result["dateOfBirth"] = expected.get("dateOfBirth", "")
        if authentic_indicator:
            result["authentic"] = True

    # Fallback to expected data if high confidence authentic indicator matched
    if expected and not result["fullName"] and (result["authentic"] or expected.get("fullName", "").upper() in norm_text):
        result["fullName"] = expected.get("fullName", "")
    if expected and not result["dateOfBirth"] and result["number"]:
        result["dateOfBirth"] = expected.get("dateOfBirth", "")

    return result
