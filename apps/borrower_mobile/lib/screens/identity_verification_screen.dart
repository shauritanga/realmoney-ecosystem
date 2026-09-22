import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../services/api_service.dart';
import '../theme/app_colors.dart';

/// Capture is performed by the approved provider; only the backend decides the result.
class IdentityVerificationScreen extends StatefulWidget {
  const IdentityVerificationScreen({super.key});

  @override
  State<IdentityVerificationScreen> createState() =>
      _IdentityVerificationScreenState();
}

class _IdentityVerificationScreenState extends State<IdentityVerificationScreen>
    with WidgetsBindingObserver {
  Map<String, dynamic>? _verification;
  bool _loading = true;
  bool _busy = false;
  bool _consent = false;
  String? _error;

  String get _status => _verification?['status'] as String? ?? 'not_started';
  bool get _canRefresh =>
      ['capture_required', 'processing', 'review'].contains(_status);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _load();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && _canRefresh && !_busy) {
      _refresh();
    }
  }

  Future<void> _load() async {
    try {
      final profile = await ApiService.request('/onboarding');
      if (!mounted) return;
      final next =
          profile['identityVerification'] as Map<String, dynamic>? ?? {};
      setState(() {
        if (_verification?['noticeVersion'] != next['noticeVersion']) {
          _consent = false;
        }
        _verification = next;
        _loading = false;
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString().replaceFirst('Exception: ', '');
          _loading = false;
        });
      }
    }
  }

  Future<void> _perform(Future<void> Function() action) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
    } catch (e) {
      if (mounted) {
        setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _refresh() => _perform(() async {
    await ApiService.request(
      '/onboarding/identity/refresh',
      method: 'POST',
      body: {},
    );
    await _load();
  });

  Future<void> _start() => _perform(() async {
    final session = await ApiService.request(
      '/onboarding/identity/session',
      method: 'POST',
      body: {
        'consent': _consent,
        'noticeVersion': _verification?['noticeVersion'],
      },
    );
    if (!mounted) return;
    setState(() => _verification = session);
    final url = session['hostedUrl'];
    if (url == null) return;
    final uri = Uri.tryParse(url as String);
    if (uri == null ||
        uri.scheme != 'https' ||
        uri.host.isEmpty ||
        uri.userInfo.isNotEmpty) {
      throw Exception('Could not open secure verification. Please retry.');
    }
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
      throw Exception('Could not open your browser. Please retry.');
    }
  });

  Widget _step(IconData icon, String title, String description) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 12),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, color: AppColors.primary, size: 24),
        const SizedBox(width: 16),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(
                  fontWeight: FontWeight.w600,
                  fontSize: 16,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                description,
                style: const TextStyle(color: AppColors.textMuted, height: 1.5),
              ),
            ],
          ),
        ),
      ],
    ),
  );

  @override
  Widget build(BuildContext context) {
    final verified = _status == 'verified';
    final available = _verification?['available'] == true;
    final canStart = [
      'not_started',
      'capture_required',
      'rejected',
      'expired',
    ].contains(_status);
    final passport = _verification?['documentType'] == 'PASSPORT';
    final document = switch (_verification?['documentType']) {
      'NIDA' => 'NIDA card',
      'VOTER_ID' => 'voter ID',
      'DRIVING_LICENSE' => 'driving licence',
      'PASSPORT' => 'passport',
      _ => 'identity document',
    };
    final (title, message) = switch (_status) {
      'verified' => (
        'Identity verified',
        'Your document and live selfie checks are complete. Continue with any remaining verification steps.',
      ),
      'processing' => (
        'Checking your identity',
        'Your documents and selfie are being checked. You can leave this screen and return later.',
      ),
      'review' => (
        'Under review',
        'Your verification needs a closer review. You do not need to upload again while the review is pending.',
      ),
      'rejected' => (
        'Verification was not successful',
        'You can try again with your own original document, clear images and good lighting.',
      ),
      'expired' => (
        'Session expired',
        'Start a new session to complete your document and live selfie checks.',
      ),
      'capture_required' => (
        'Complete your capture',
        'Continue your secure session, then return here to check the result.',
      ),
      _ => (
        'Verify your identity',
        'Have your original $document ready. We will check the document and confirm that it belongs to you.',
      ),
    };
    return Scaffold(
      appBar: AppBar(title: const Text('Document & live selfie')),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : ListView(
                padding: const EdgeInsets.all(24),
                children: [
                  Icon(
                    verified ? Icons.verified_outlined : Icons.badge_outlined,
                    size: 48,
                    color: AppColors.primary,
                  ),
                  const SizedBox(height: 24),
                  Text(
                    title,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    message,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: AppColors.textMuted,
                      height: 1.5,
                    ),
                  ),
                  const SizedBox(height: 24),
                  if (_verification?['mode'] == 'development')
                    const Text(
                      'Development result — not a live identity verification.',
                      style: TextStyle(color: AppColors.warning),
                    ),
                  if (canStart) ...[
                    _step(
                      Icons.credit_card_outlined,
                      passport
                          ? 'Passport photo page'
                          : 'Front of your $document',
                      'Show all corners and keep the text and portrait clear. Avoid glare and blur.',
                    ),
                    if (!passport)
                      _step(
                        Icons.flip_outlined,
                        'Back of your $document',
                        'Capture the reverse side of the same document.',
                      ),
                    _step(
                      Icons.face_outlined,
                      'Live selfie check',
                      'Allow camera access in the secure capture page. Face the camera in good light and follow the on-screen instructions.',
                    ),
                    const SizedBox(height: 16),
                    if (available) ...[
                      const Text(
                        'Before you continue',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        _verification?['notice'] as String? ?? '',
                        style: const TextStyle(height: 1.5),
                      ),
                      CheckboxListTile(
                        contentPadding: EdgeInsets.zero,
                        controlAffinity: ListTileControlAffinity.leading,
                        value: _consent,
                        onChanged: _busy
                            ? null
                            : (value) =>
                                  setState(() => _consent = value ?? false),
                        title: const Text(
                          'I have read the notice and agree to document and biometric verification.',
                        ),
                      ),
                      FilledButton(
                        onPressed: _consent && !_busy ? _start : null,
                        child: Text(
                          _busy
                              ? 'Please wait…'
                              : _status == 'capture_required'
                              ? 'Continue secure capture'
                              : 'Start secure capture',
                        ),
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'Capture opens in your browser. Return to RealMoney when finished.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: AppColors.textMuted),
                      ),
                    ],
                  ],
                  if (!available && !verified) ...[
                    const SizedBox(height: 16),
                    const Text(
                      'Document and selfie verification is not available yet. Please try again later.',
                      textAlign: TextAlign.center,
                    ),
                  ],
                  if (_canRefresh) ...[
                    const SizedBox(height: 16),
                    OutlinedButton(
                      onPressed: _busy ? null : _refresh,
                      child: Text(
                        _busy ? 'Checking…' : 'Check verification status',
                      ),
                    ),
                  ],
                  if (verified)
                    FilledButton(
                      onPressed: () => Navigator.pop(context, true),
                      child: const Text('Continue'),
                    ),
                  if (_error != null) ...[
                    const SizedBox(height: 16),
                    Text(
                      _error!,
                      style: const TextStyle(color: AppColors.error),
                    ),
                    if (_verification == null)
                      TextButton(
                        onPressed: _busy ? null : () => _perform(_load),
                        child: const Text('Retry'),
                      ),
                  ],
                ],
              ),
      ),
    );
  }
}
