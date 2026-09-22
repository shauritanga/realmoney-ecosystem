import pytest
import io
from fastapi.testclient import TestClient
from PIL import Image
import numpy as np

from src.main import app
from src.config import settings

client = TestClient(app)

def create_dummy_image_bytes(color=(200, 200, 200), size=(640, 480)):
    img = Image.new("RGB", size, color=color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()

def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["service"] == "kyc-service"

def test_unauthorized_session_creation():
    payload = {
        "requestId": "req_123",
        "subjectId": "usr_456",
        "policyVersion": 2,
        "identity": {
            "type": "NIDA",
            "fullName": "JUMA HASSAN MWINYI",
            "number": "19900101123450000101",
            "dateOfBirth": "1990-01-01"
        },
        "requiredSides": ["front", "back"],
        "requiredChecks": ["documentAuthenticity", "registrationMatch", "liveness", "faceMatch"],
        "consent": {
            "version": "abc123hash",
            "text": "Notice text",
            "acceptedAt": "2026-09-22T10:00:00Z"
        }
    }
    # No header
    res = client.post("/identity/sessions", json=payload)
    assert res.status_code in [401, 403]

    # Wrong token
    res = client.post("/identity/sessions", json=payload, headers={"Authorization": "Bearer wrong-token"})
    assert res.status_code == 403

def test_create_and_query_session():
    payload = {
        "requestId": "req_test_001",
        "subjectId": "usr_test_001",
        "policyVersion": 2,
        "identity": {
            "type": "NIDA",
            "fullName": "JUMA HASSAN MWINYI",
            "number": "19900101123450000101",
            "dateOfBirth": "1990-01-01"
        },
        "requiredSides": ["front", "back"],
        "requiredChecks": ["documentAuthenticity", "registrationMatch", "liveness", "faceMatch"],
        "consent": {
            "version": "notice_sha256",
            "text": "Approved consent text",
            "acceptedAt": "2026-09-22T10:00:00Z"
        }
    }
    headers = {"Authorization": f"Bearer {settings.BRIDGE_TOKEN}"}

    # 1. Create session
    res = client.post("/identity/sessions", json=payload, headers=headers)
    assert res.status_code == 200
    created = res.json()
    assert created["requestId"] == "req_test_001"
    assert created["subjectId"] == "usr_test_001"
    assert created["sessionId"].startswith("sess_")
    assert "/capture/" in created["hostedUrl"]
    session_id = created["sessionId"]

    # 2. Get status before capture
    res = client.get(f"/identity/sessions/{session_id}", headers=headers)
    assert res.status_code == 200
    status_data = res.json()
    assert status_data["status"] == "capture_required"
    assert status_data["sessionId"] == session_id

    # 3. Query capture metadata
    res = client.get(f"/capture/{session_id}/meta")
    assert res.status_code == 200
    meta = res.json()
    assert meta["fullName"] == "JUMA HASSAN MWINYI"
    assert meta["docType"] == "NIDA"
    assert meta["requiredSides"] == ["front", "back"]

    # 4. Upload front image
    front_bytes = create_dummy_image_bytes(color=(180, 180, 180))
    res = client.post(
        f"/capture/{session_id}/upload",
        data={"side": "front"},
        files={"file": ("front.jpg", front_bytes, "image/jpeg")}
    )
    assert res.status_code == 200
    assert res.json()["success"] is True

    # 5. Upload back image
    back_bytes = create_dummy_image_bytes(color=(160, 160, 160))
    res = client.post(
        f"/capture/{session_id}/upload",
        data={"side": "back"},
        files={"file": ("back.jpg", back_bytes, "image/jpeg")}
    )
    assert res.status_code == 200

    # 6. Upload selfie frames
    selfie_bytes = create_dummy_image_bytes(color=(140, 140, 140))
    res = client.post(
        f"/capture/{session_id}/upload",
        data={"side": "selfie_0"},
        files={"file": ("selfie_0.jpg", selfie_bytes, "image/jpeg")}
    )
    assert res.status_code == 200

    # 7. Submit verification
    res = client.post(f"/capture/{session_id}/submit")
    assert res.status_code == 200
    submit_res = res.json()
    assert submit_res["success"] is True

    # 8. Query via bridge API
    res = client.get(f"/identity/sessions/{session_id}", headers=headers)
    assert res.status_code == 200
    final_status = res.json()
    assert final_status["status"] in ["review", "verified", "processing"]
    assert final_status["document"] is not None
    assert final_status["document"]["capturedSides"] == ["front", "back"]
