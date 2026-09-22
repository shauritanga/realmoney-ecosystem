from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import HTMLResponse, JSONResponse
from pathlib import Path

from ..storage import store
from ..quality import assess_image_quality
from ..pipeline import process_verification

router = APIRouter(prefix="/capture", tags=["Capture"])

STATIC_DIR = Path(__file__).parent.parent / "static"

@router.get("/{session_id}", response_class=HTMLResponse)
def get_capture_page(session_id: str):
    session = store.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Verification session not found or expired")
    
    html_file = STATIC_DIR / "capture.html"
    if not html_file.exists():
        raise HTTPException(status_code=500, detail="Capture UI template missing")
        
    with open(html_file, "r", encoding="utf-8") as f:
        content = f.read()
        
    # Inject session ID directly into HTML
    content = content.replace("{{SESSION_ID}}", session_id)
    content = content.replace("{{FULL_NAME}}", session.get("identity", {}).get("fullName", "Customer"))
    content = content.replace("{{DOC_TYPE}}", session.get("identity", {}).get("type", "ID Card"))
    
    return HTMLResponse(content=content)

@router.get("/{session_id}/meta")
def get_session_meta(session_id: str):
    session = store.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    return {
        "sessionId": session["sessionId"],
        "fullName": session.get("identity", {}).get("fullName", ""),
        "docType": session.get("identity", {}).get("type", "NIDA"),
        "requiredSides": session.get("requiredSides", ["front", "back"]),
        "status": session.get("status", "capture_required")
    }

@router.post("/{session_id}/upload")
async def upload_capture_side(
    session_id: str,
    side: str = Form(...),
    file: UploadFile = File(...)
):
    session = store.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty upload")

    # Quality check
    quality = assess_image_quality(data)
    
    filename = f"{side}.jpg"
    if side.startswith("selfie"):
        filename = f"{side}.jpg"
    elif side in ["front", "back", "biodata"]:
        filename = f"{side}.jpg"
    else:
        filename = f"{side}.jpg"

    store.save_asset(session_id, filename, data)

    return {
        "success": True,
        "side": side,
        "quality": quality,
    }

@router.post("/{session_id}/submit")
def submit_verification(session_id: str):
    session = store.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    updated = process_verification(session_id)
    return {
        "success": True,
        "status": updated.get("status"),
        "document": updated.get("document"),
        "liveness": updated.get("liveness"),
        "faceMatch": updated.get("faceMatch")
    }
