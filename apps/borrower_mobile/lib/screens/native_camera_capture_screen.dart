import 'dart:async';
import 'dart:typed_data';
import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import '../theme/app_colors.dart';

enum CaptureStep { front, back, selfie }

class NativeCameraCaptureScreen extends StatefulWidget {
  final String sessionId;
  final String hostedUrl;
  final List<String> requiredSides;

  const NativeCameraCaptureScreen({
    super.key,
    required this.sessionId,
    required this.hostedUrl,
    required this.requiredSides,
  });

  @override
  State<NativeCameraCaptureScreen> createState() =>
      _NativeCameraCaptureScreenState();
}

class _NativeCameraCaptureScreenState extends State<NativeCameraCaptureScreen> {
  List<CameraDescription> _cameras = [];
  CameraController? _controller;
  bool _isInit = false;
  bool _busy = false;
  String? _errorMessage;
  CaptureStep _currentStep = CaptureStep.front;

  Uint8List? _previewBytes;
  String _uploadStatusText = '';

  bool get _needsBackSide => widget.requiredSides.contains('back');

  @override
  void initState() {
    super.initState();
    _initCameras();
  }

  Future<void> _initCameras() async {
    try {
      _cameras = await availableCameras();
      if (_cameras.isEmpty) {
        setState(() => _errorMessage = 'No camera found on this device');
        return;
      }
      await _setupCameraForStep(_currentStep);
    } catch (e) {
      setState(() => _errorMessage = 'Camera access error: ${e.toString()}');
    }
  }

  Future<void> _setupCameraForStep(CaptureStep step) async {
    setState(() => _isInit = false);
    await _controller?.dispose();

    final lensDirection = step == CaptureStep.selfie
        ? CameraLensDirection.front
        : CameraLensDirection.back;

    CameraDescription camera = _cameras.firstWhere(
      (c) => c.lensDirection == lensDirection,
      orElse: () => _cameras.first,
    );

    final controller = CameraController(
      camera,
      ResolutionPreset.high,
      enableAudio: false,
    );

    try {
      await controller.initialize();
      if (!mounted) return;
      setState(() {
        _controller = controller;
        _isInit = true;
        _errorMessage = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _errorMessage = 'Could not start camera: $e';
        _isInit = false;
      });
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  Future<void> _takePhoto() async {
    if (_controller == null || !_controller!.value.isInitialized || _busy) {
      return;
    }

    try {
      setState(() => _busy = true);

      if (_currentStep == CaptureStep.selfie) {
        // Capture 3 frames burst for active liveness analysis
        setState(() => _uploadStatusText = 'Hold still: Verifying liveness...');
        final frames = <Uint8List>[];

        for (int i = 0; i < 3; i++) {
          final file = await _controller!.takePicture();
          final bytes = await file.readAsBytes();
          frames.add(bytes);
          if (i < 2) await Future.delayed(const Duration(milliseconds: 250));
        }

        // Upload selfie frames
        for (int i = 0; i < frames.length; i++) {
          setState(() =>
              _uploadStatusText = 'Uploading selfie frame ${i + 1} of 3...');
          await _uploadBytes(frames[i], 'selfie_$i');
        }

        // Finish session
        setState(() => _uploadStatusText = 'Submitting verification...');
        await _submitSession();

        if (mounted) {
          Navigator.of(context).pop(true);
        }
      } else {
        // Document step (front or back)
        final xfile = await _controller!.takePicture();
        final bytes = await xfile.readAsBytes();

        setState(() {
          _previewBytes = bytes;
          _busy = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _errorMessage = 'Capture failed: $e';
        });
      }
    }
  }

  Future<void> _confirmAndUploadDoc() async {
    if (_previewBytes == null) return;
    setState(() {
      _busy = true;
      _uploadStatusText = 'Uploading document photo...';
    });

    try {
      final side = _currentStep == CaptureStep.front ? 'front' : 'back';
      await _uploadBytes(_previewBytes!, side);

      _previewBytes = null;

      // Advance step
      if (_currentStep == CaptureStep.front) {
        if (_needsBackSide) {
          _currentStep = CaptureStep.back;
          await _setupCameraForStep(CaptureStep.back);
        } else {
          _currentStep = CaptureStep.selfie;
          await _setupCameraForStep(CaptureStep.selfie);
        }
      } else if (_currentStep == CaptureStep.back) {
        _currentStep = CaptureStep.selfie;
        await _setupCameraForStep(CaptureStep.selfie);
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _errorMessage = 'Upload error: $e';
        });
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _retakeDoc() {
    setState(() {
      _previewBytes = null;
      _busy = false;
    });
  }

  Future<void> _uploadBytes(Uint8List bytes, String side) async {
    final uploadUri = Uri.parse('${widget.hostedUrl}/upload');
    final request = http.MultipartRequest('POST', uploadUri);
    request.fields['side'] = side;
    request.files.add(
      http.MultipartFile.fromBytes(
        'file',
        bytes,
        filename: '$side.jpg',
      ),
    );

    final streamedResponse = await request.send();
    final response = await http.Response.fromStream(streamedResponse);

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception('Upload failed (${response.statusCode}): ${response.body}');
    }
  }

  Future<void> _submitSession() async {
    final submitUri = Uri.parse('${widget.hostedUrl}/submit');
    final response = await http.post(
      submitUri,
      headers: {'Content-Type': 'application/json'},
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception('Submission error (${response.statusCode}): ${response.body}');
    }
  }

  String get _stepTitle {
    switch (_currentStep) {
      case CaptureStep.front:
        return 'Front of Document';
      case CaptureStep.back:
        return 'Back of Document';
      case CaptureStep.selfie:
        return 'Face Verification';
    }
  }

  String get _stepInstructions {
    switch (_currentStep) {
      case CaptureStep.front:
        return 'Fit the front of your ID inside the rectangle frame. Keep it in focus.';
      case CaptureStep.back:
        return 'Turn your ID card around and fit the back side inside the frame.';
      case CaptureStep.selfie:
        return 'Center your face in the oval. Blink naturally when taking photo.';
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Stack(
          children: [
            // Camera Preview or Image Preview
            Positioned.fill(
              child: _previewBytes != null
                  ? Image.memory(_previewBytes!, fit: BoxFit.contain)
                  : (_isInit && _controller != null
                      ? Center(child: CameraPreview(_controller!))
                      : const Center(
                          child: CircularProgressIndicator(color: AppColors.primary),
                        )),
            ),

            // Cutout Overlay (Card rectangle or Face oval)
            if (_previewBytes == null && _isInit)
              Positioned.fill(
                child: CustomPaint(
                  painter: _currentStep == CaptureStep.selfie
                      ? _OvalCutoutPainter()
                      : _CardCutoutPainter(),
                ),
              ),

            // Header (Step Counter and Back button)
            Positioned(
              top: 16,
              left: 16,
              right: 16,
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      IconButton.filled(
                        icon: const Icon(Icons.arrow_back, color: Colors.white),
                        style: IconButton.styleFrom(
                          backgroundColor: Colors.black54,
                        ),
                        onPressed: () => Navigator.of(context).pop(false),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 14, vertical: 6),
                        decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: 0.75),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: Colors.white24),
                        ),
                        child: Text(
                          _currentStep == CaptureStep.front
                              ? (_needsBackSide ? 'Step 1 of 3' : 'Step 1 of 2')
                              : _currentStep == CaptureStep.back
                                  ? 'Step 2 of 3'
                                  : (_needsBackSide ? 'Step 3 of 3' : 'Step 2 of 2'),
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      const SizedBox(width: 48), // Balance spacing
                    ],
                  ),
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 16, vertical: 10),
                    decoration: BoxDecoration(
                      color: Colors.black87,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Column(
                      children: [
                        Text(
                          _stepTitle,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          _stepInstructions,
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.85),
                            fontSize: 12,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            // Bottom Action Bar
            Positioned(
              bottom: 24,
              left: 16,
              right: 16,
              child: _previewBytes != null
                  ? _buildPreviewControls()
                  : _buildShutterControls(),
            ),

            // Busy Overlay with progress
            if (_busy)
              Container(
                color: Colors.black87,
                child: Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const CircularProgressIndicator(color: AppColors.primary),
                      const SizedBox(height: 18),
                      Text(
                        _uploadStatusText,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 14,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),
              ),

            // Error banner
            if (_errorMessage != null)
              Positioned(
                bottom: 120,
                left: 20,
                right: 20,
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.red.shade900,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    _errorMessage!,
                    style: const TextStyle(color: Colors.white, fontSize: 13),
                    textAlign: TextAlign.center,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildShutterControls() {
    return Center(
      child: GestureDetector(
        onTap: _takePhoto,
        child: Container(
          width: 76,
          height: 76,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(color: Colors.white, width: 4),
            color: Colors.white.withValues(alpha: 0.2),
          ),
          child: Center(
            child: Container(
              width: 58,
              height: 58,
              decoration: const BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white,
              ),
              child: _currentStep == CaptureStep.selfie
                  ? const Icon(Icons.face, color: Colors.black87, size: 30)
                  : const Icon(Icons.camera_alt, color: Colors.black87, size: 28),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildPreviewControls() {
    return Row(
      children: [
        Expanded(
          child: OutlinedButton(
            onPressed: _retakeDoc,
            style: OutlinedButton.styleFrom(
              foregroundColor: Colors.white,
              side: const BorderSide(color: Colors.white70),
              padding: const EdgeInsets.symmetric(vertical: 14),
            ),
            child: const Text('Retake Photo'),
          ),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: FilledButton(
            onPressed: _confirmAndUploadDoc,
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.primary,
              foregroundColor: Colors.black,
              padding: const EdgeInsets.symmetric(vertical: 14),
            ),
            child: const Text(
              'Use Photo',
              style: TextStyle(fontWeight: FontWeight.bold),
            ),
          ),
        ),
      ],
    );
  }
}

/// Custom painter that draws a dark vignette with a transparent card rectangle cutout
class _CardCutoutPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final cardWidth = size.width * 0.88;
    final cardHeight = cardWidth / 1.58; // Standard ID card ratio (85.6mm x 53.98mm)
    final left = (size.width - cardWidth) / 2;
    final top = (size.height - cardHeight) / 2;

    final backgroundPath = Path()..addRect(Rect.fromLTWH(0, 0, size.width, size.height));
    final cutoutRRect = RRect.fromRectAndRadius(
      Rect.fromLTWH(left, top, cardWidth, cardHeight),
      const Radius.circular(16),
    );
    final cutoutPath = Path()..addRRect(cutoutRRect);

    final maskPath = Path.combine(PathOperation.difference, backgroundPath, cutoutPath);

    final paint = Paint()
      ..color = Colors.black.withValues(alpha: 0.68)
      ..style = PaintingStyle.fill;

    canvas.drawPath(maskPath, paint);

    // Green border around cutout
    final borderPaint = Paint()
      ..color = AppColors.primary
      ..strokeWidth = 2.5
      ..style = PaintingStyle.stroke;
    canvas.drawRRect(cutoutRRect, borderPaint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

/// Custom painter that draws a dark vignette with a transparent face oval cutout
class _OvalCutoutPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final ovalWidth = size.width * 0.72;
    final ovalHeight = ovalWidth * 1.35;
    final left = (size.width - ovalWidth) / 2;
    final top = (size.height - ovalHeight) / 2.2;

    final backgroundPath = Path()..addRect(Rect.fromLTWH(0, 0, size.width, size.height));
    final ovalRect = Rect.fromLTWH(left, top, ovalWidth, ovalHeight);
    final cutoutPath = Path()..addOval(ovalRect);

    final maskPath = Path.combine(PathOperation.difference, backgroundPath, cutoutPath);

    final paint = Paint()
      ..color = Colors.black.withValues(alpha: 0.68)
      ..style = PaintingStyle.fill;

    canvas.drawPath(maskPath, paint);

    // Oval glowing border
    final borderPaint = Paint()
      ..color = AppColors.primary
      ..strokeWidth = 2.5
      ..style = PaintingStyle.stroke;
    canvas.drawOval(ovalRect, borderPaint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
