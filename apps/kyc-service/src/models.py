from typing import List, Optional, Literal
from pydantic import BaseModel, Field

class IdentityRegistration(BaseModel):
    type: str  # NIDA, VOTER_ID, DRIVING_LICENSE, PASSPORT
    fullName: str
    number: str
    dateOfBirth: str

class ConsentData(BaseModel):
    version: str
    text: str
    acceptedAt: str

class CreateSessionRequest(BaseModel):
    requestId: str
    subjectId: str
    policyVersion: int = 2
    identity: IdentityRegistration
    requiredSides: List[str]
    requiredChecks: List[str] = ["documentAuthenticity", "registrationMatch", "liveness", "faceMatch"]
    consent: ConsentData

class CreateSessionResponse(BaseModel):
    sessionId: str
    requestId: str
    subjectId: str
    mode: Literal["live", "development"] = "live"
    hostedUrl: str
    expiresAt: str

class DocumentResult(BaseModel):
    authentic: bool
    capturedSides: List[str]
    type: str
    fullName: str
    number: str
    dateOfBirth: str
    blurScore: Optional[float] = None
    hasGlare: Optional[bool] = None

class LivenessResult(BaseModel):
    passed: bool
    confidence: Optional[float] = None
    blinksDetected: Optional[int] = None

class FaceMatchResult(BaseModel):
    passed: bool
    similarity: Optional[float] = None

class SessionStatusResponse(BaseModel):
    sessionId: str
    requestId: str
    subjectId: str
    mode: Literal["live", "development"] = "live"
    status: Literal["capture_required", "processing", "review", "verified", "rejected", "expired"]
    document: Optional[DocumentResult] = None
    liveness: Optional[LivenessResult] = None
    faceMatch: Optional[FaceMatchResult] = None
    errorReason: Optional[str] = None
