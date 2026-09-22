import uuid
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Header, HTTPException, Depends
from typing import Optional

from ..config import settings
from ..models import (
    CreateSessionRequest,
    CreateSessionResponse,
    SessionStatusResponse
)
from ..storage import store
from ..pipeline import process_verification

router = APIRouter(prefix="/identity/sessions", tags=["Bridge"])

def verify_token(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized: Missing or invalid Bearer token")
    token = authorization.split("Bearer ")[1].strip()
    if token != settings.BRIDGE_TOKEN:
        raise HTTPException(status_code=403, detail="Forbidden: Invalid token")
    return token

@router.post("", response_model=CreateSessionResponse)
def create_session(
    body: CreateSessionRequest,
    _: str = Depends(verify_token)
):
    session_id = f"sess_{uuid.uuid4().hex[:20]}"
    expires_at = (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()
    created_at = datetime.now(timezone.utc).isoformat()

    hosted_url = f"{settings.CAPTURE_BASE_URL}/capture/{session_id}"

    session_data = {
        "sessionId": session_id,
        "requestId": body.requestId,
        "subjectId": body.subjectId,
        "policyVersion": body.policyVersion,
        "mode": "live",
        "status": "capture_required",
        "identity": body.identity.model_dump(),
        "requiredSides": body.requiredSides,
        "requiredChecks": body.requiredChecks,
        "consent": body.consent.model_dump(),
        "hostedUrl": hosted_url,
        "createdAt": created_at,
        "expiresAt": expires_at,
    }

    store.save_session(session_data)

    return CreateSessionResponse(
        sessionId=session_id,
        requestId=body.requestId,
        subjectId=body.subjectId,
        mode="live",
        hostedUrl=hosted_url,
        expiresAt=expires_at,
    )

@router.get("/{session_id}", response_model=SessionStatusResponse)
def get_session_status(
    session_id: str,
    _: str = Depends(verify_token)
):
    session = store.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Check expiration
    expires_at = session.get("expiresAt")
    if expires_at:
        try:
            exp_dt = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            if datetime.now(timezone.utc) > exp_dt:
                session["status"] = "expired"
                store.save_session(session)
        except Exception:
            pass

    return SessionStatusResponse(
        sessionId=session["sessionId"],
        requestId=session["requestId"],
        subjectId=session["subjectId"],
        mode=session.get("mode", "live"),
        status=session.get("status", "capture_required"),
        document=session.get("document"),
        liveness=session.get("liveness"),
        faceMatch=session.get("faceMatch"),
        errorReason=session.get("errorReason"),
    )

@router.post("/{session_id}/process", response_model=SessionStatusResponse)
def trigger_process_session(
    session_id: str,
    _: str = Depends(verify_token)
):
    session = store.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    updated = process_verification(session_id)
    return SessionStatusResponse(
        sessionId=updated["sessionId"],
        requestId=updated["requestId"],
        subjectId=updated["subjectId"],
        mode=updated.get("mode", "live"),
        status=updated.get("status", "review"),
        document=updated.get("document"),
        liveness=updated.get("liveness"),
        faceMatch=updated.get("faceMatch"),
        errorReason=updated.get("errorReason"),
    )
