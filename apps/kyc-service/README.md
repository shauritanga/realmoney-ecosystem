# RealMoney Self-Hosted KYC Verification Engine

A standalone, self-hosted identity verification and liveness detection microservice designed specifically for RealMoney Tanzania. Built with **FastAPI**, **OpenCV**, **Tesseract OCR**, and **NumPy**.

---

## 🚀 Features

1. **Compliant Provider Bridge**:
   - Implements the exact HTTPS bridge contract defined in [`docs/identity-verification.md`](../../docs/identity-verification.md).
   - Authenticated with Bearer token matching `VERIFICATION_BRIDGE_TOKEN`.
   - Endpoints:
     - `POST /identity/sessions`: Initiates borrower session and creates tamper-proof hosted capture URL.
     - `GET /identity/sessions/{sessionId}`: Evaluates session results for [`evaluateIdentityDecision()`](../backend/src/onboarding/identity-verification.ts).

2. **Mobile Web Capture Application**:
   - Served at `/capture/{sessionId}`.
   - Responsive, mobile-first camera interface in Swahili and English.
   - Guides applicant through:
     - **Document Front**: Aspect-ratio card guide, real-time autofocus.
     - **Document Back**: Captures back of NIDA or Voter ID card.
     - **Selfie Liveness**: Active liveness sequence with real-time prompt overlay (*"Tazama kamera"*, *"Pesa macho"*, *"Tabasamu"*).

3. **OpenCV Image Processing Pipeline**:
   - **Blur detection**: Computes variance of Laplacian (`cv2.Laplacian`) to prevent out-of-focus or unreadable uploads.
   - **Specular glare detection**: Masks HSV specular highlights to reject glossy laminated card reflections.
   - **Document contour alignment**: Detects 4-point quadrilateral and applies perspective warp transform (`cv2.warpPerspective`).

4. **Tanzanian Document Extraction**:
   - **NIDA National ID Card**: Extracts 20-digit NIN (`YYYYMMDD-XXXXX-XXXXX-XX`) and derives date of birth from first 8 digits.
   - **Tanzanian Passport**: Parses 2-line TD3 Machine Readable Zone (MRZ `P<TZA...`) with checksum verification.
   - **Voter ID Card & Driving License**: Parses card serials and matches legal registration attributes.

5. **Liveness & Biometrics**:
   - **Passive Anti-Spoofing**: 2D Fast Fourier Transform (FFT) frequency spectrum analysis to detect high-frequency pixel moiré patterns from mobile/laptop screen replays.
   - **Active Liveness**: Measures multi-frame micro-motion and eye closure across a 3-frame burst.
   - **Face Verification**: Normalizes face crops from document portrait and live selfie, computing multi-scale color histogram correlation and gradient similarity.

---

## 🛠️ Local Development & Running

### 1. Run using Python Virtual Environment

```bash
cd apps/kyc-service

# Activate virtual environment
source .venv/bin/activate

# Start development server
uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload
```

* API Docs (Swagger): `http://localhost:8000/docs`
* Health Check: `http://localhost:8000/health`

### 2. Run Test Suite

```bash
cd apps/kyc-service
PYTHONPATH=. .venv/bin/pytest tests/
```

### 3. Docker Container

```bash
cd apps/kyc-service
docker build -t realmoney-kyc-service .
docker run -p 8000:8000 -e VERIFICATION_BRIDGE_TOKEN=test-token realmoney-kyc-service
```

---

## 🔐 Environment Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `KYC_HOST` | `0.0.0.0` | Binding host address |
| `KYC_PORT` | `8000` | Binding port |
| `VERIFICATION_BRIDGE_TOKEN` | `realmoney-bridge-secret-key-change-me` | Shared secret token expected in `Authorization: Bearer <token>` |
| `CAPTURE_BASE_URL` | `https://capture.realmoney.tz` | Public HTTPS base URL for mobile web capture pages |
| `KYC_DATA_DIR` | `./data` | Directory for storing session metadata and captured image assets |
| `KYC_DEV_MODE` | `false` | When `true`, accepts synthetic documents for sandbox automated testing |
| `BLUR_THRESHOLD` | `80.0` | Laplacian variance threshold below which images are rejected as blurry |
| `GLARE_RATIO_THRESHOLD` | `0.10` | Maximum allowable ratio of specular glare pixels |
| `FACE_MATCH_THRESHOLD` | `0.65` | Minimum cosine/histogram correlation for biometric face match |
