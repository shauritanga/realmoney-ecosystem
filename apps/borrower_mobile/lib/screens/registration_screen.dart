import '../theme/app_colors.dart';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../services/api_service.dart';
import '../services/sms_code_service.dart';

class RegistrationScreen extends StatefulWidget {
  final Map<String, dynamic>? existingProfile;
  final SmsCodeService? smsCodeService;
  const RegistrationScreen({super.key, this.existingProfile, this.smsCodeService});
  @override
  State<RegistrationScreen> createState() => _RegistrationScreenState();
}

class _RegistrationScreenState extends State<RegistrationScreen> {
  final _form = GlobalKey<FormState>();
  final _fields = <String, TextEditingController>{};
  final _visiblePasswords = <String>{};
  int _step = 0;
  bool _completed = false;
  final _scroll = ScrollController();
  late final SmsCodeService _sms;
  int _smsSession = 0;
  String? _pendingSmsCode;

  Future<void> _stopSms() async {
    _smsSession++;
    _pendingSmsCode = null;
    try { await _sms.stop(); } catch (_) { /* Manual entry remains available. */ }
  }

  Future<void> _listenForSms(int session, String phone) async {
    try {
      final code = await _sms.listen();
      if (!mounted || session != _smsSession ||
          field('phone').text.trim() != phone || code == null) return;
      if (_busy) {
        _pendingSmsCode = code;
      } else if (_step == 1 && field('code').text.isEmpty) {
        field('code').text = code;
      }
    } catch (_) {
      // Autofill is optional: manual entry remains available on every device.
    }
  }


  void _goTo(int step) {
    if (_step == 1 && step != 1) _stopSms();
    FocusScope.of(context).unfocus();
    setState(() { _step = step; _error = null; });
    if (_scroll.hasClients) _scroll.jumpTo(0);
  }

  void _back() {
    if (_busy) return;
    if (_step == 0) { Navigator.pop(context); return; }
    _goTo(_step == 2 || (_existing && _step == 3) ? 0 : _step - 1);
  }
  bool _busy = false, _loading = true, _terms = false, _privacy = false, _marketing = false;
  String? _error, _proof, _verifiedPhone, _developmentCode, _sentPhone;
  bool get _hasSentCode => _sentPhone == field('phone').text.trim();

  void _continuePhone() {
    if (!_form.currentState!.validate()) return;
    if (_proof != null) { _goTo(_existing ? 3 : 2); }
    else if (_hasSentCode) { _goTo(1); }
    else { _sendCode(); }
  }
  String _identityType = 'NIDA';
  Map<String, dynamic>? _legal;
  int _resendSeconds = 0;
  Timer? _timer;
  bool get _existing => widget.existingProfile != null;
  TextEditingController field(String name) => _fields.putIfAbsent(name, () => TextEditingController());

  @override
  void initState() {
    super.initState();
    _sms = widget.smsCodeService ?? SmsCodeService();
    final profile = widget.existingProfile;
    if (profile != null) {
      final onboarding = profile['onboarding'] as Map<String, dynamic>? ?? {};
      for (final name in ['phone', 'fullName', 'nationalId', 'email']) { field(name).text = profile[name]?.toString() ?? ''; }
      for (final name in ['dateOfBirth', 'region', 'district', 'ward', 'street', 'landmark']) { field(name).text = onboarding[name]?.toString() ?? ''; }
      _identityType = onboarding['identityType'] ?? 'NIDA';
    }
    _loadLegal();
  }
  @override
  void dispose() { _stopSms(); _scroll.dispose(); _timer?.cancel(); for (final c in _fields.values) { c.dispose(); } super.dispose(); }

  Future<void> _loadLegal() async {
    setState(() { _loading = true; _error = null; });
    try {
      final legal = await ApiService.request('/auth/legal', authenticated: false);
      if (mounted) setState(() => _legal = legal);
    } catch (e) { if (mounted) setState(() => _error = _message(e)); }
    finally { if (mounted) setState(() => _loading = false); }
  }
  String _message(Object e) => e.toString().replaceFirst('Exception: ', '');
  Future<void> _perform(Future<void> Function() action) async {
    setState(() { _busy = true; _error = null; });
    try { await action(); }
    catch (e) { if (mounted) setState(() => _error = _message(e)); }
    finally { if (mounted) setState(() => _busy = false); }
  }
  Future<void> _sendCode() => _perform(() async {
    if (_step == 0 && !_form.currentState!.validate()) return;
    await _stopSms();
    if (!mounted) return;
    final phone = field('phone').text.trim();
    unawaited(_listenForSms(_smsSession, phone));
    Map<String, dynamic> data;
    try {
      data = await ApiService.request('/auth/phone-code', method: 'POST', authenticated: false,
        body: {'phone': phone});
    } catch (_) {
      _stopSms();
      rethrow;
    }
    if (!mounted) return;
    setState(() { _proof = null; _verifiedPhone = null; _developmentCode = data['developmentCode']; _resendSeconds = 60; _sentPhone = field('phone').text.trim(); field('code').clear(); });
    _goTo(1);
    if (_pendingSmsCode != null) {
      field('code').text = _pendingSmsCode!;
      _pendingSmsCode = null;
    }
    if (_developmentCode != null) _stopSms();
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) { timer.cancel(); return; }
      setState(() => _resendSeconds--);
      if (_resendSeconds <= 0) timer.cancel();
    });
  });
  Future<void> _verifyCode() => _perform(() async {
    if (!_form.currentState!.validate()) return;
    final data = await ApiService.request('/auth/verify-phone', method: 'POST', authenticated: false,
      body: {'phone': field('phone').text.trim(), 'code': field('code').text.trim()});
    if (!mounted) return;
    setState(() { _proof = data['phoneProof']; _verifiedPhone = data['phone']; });
    _goTo(_existing ? 3 : 2);
  });
  void _next() {
    if (!_form.currentState!.validate()) return;
    if (_proof == null) { setState(() => _error = 'Verify your mobile number first'); return; }
    if (_step < 4) { _goTo(_step + 1); return; }
    if (!_terms || !_privacy) { setState(() => _error = 'Read and accept the account terms and acknowledge the privacy notice'); return; }
    _perform(() async {
      final body = <String, dynamic>{
        for (final key in ['fullName', 'dateOfBirth', 'nationalId', 'region', 'district', 'ward', 'street', 'landmark']) key: field(key).text.trim(),
        'phone': _verifiedPhone, 'phoneProof': _proof, 'identityType': _identityType,
        if (field('email').text.trim().isNotEmpty) 'email': field('email').text.trim(),
        if (!_existing) 'password': field('password').text,
        if (!_existing) 'confirmPassword': field('confirmPassword').text,
        'termsVersion': _legal!['terms']['version'], 'privacyVersion': _legal!['privacy']['version'],
        'acceptTerms': _terms, 'acknowledgePrivacy': _privacy, 'marketingConsent': _marketing,
      };
      await ApiService.registerProfile(body, existing: _existing);
      if (!mounted) return;
      setState(() => _completed = true);
      await WidgetsBinding.instance.endOfFrame;
      if (mounted) Navigator.pop(context, true);
    });
  }

  Widget _input(String name, String label, {bool optional = false, bool secret = false, TextInputType? keyboard}) => Padding(
    padding: const EdgeInsets.only(bottom: 18),
    child: TextFormField(key: ValueKey(name), controller: field(name), enabled: !_busy && !(name == 'phone' && _existing), obscureText: secret && !_visiblePasswords.contains(name),
      enableSuggestions: !secret, autocorrect: !secret,
      keyboardType: keyboard,
      autofillHints: name == 'code' ? const [AutofillHints.oneTimeCode] : secret ? const [AutofillHints.newPassword] : null,
      inputFormatters: name == 'code' ? [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)] : null,
      decoration: InputDecoration(labelText: label, border: const OutlineInputBorder(),
        suffixIcon: secret ? IconButton(
          tooltip: '${_visiblePasswords.contains(name) ? 'Hide' : 'Show'} ${label.toLowerCase()}',
          onPressed: () => setState(() {
            if (!_visiblePasswords.remove(name)) _visiblePasswords.add(name);
          }),
          icon: Icon(_visiblePasswords.contains(name) ? Icons.visibility_off_outlined : Icons.visibility_outlined)) : null),
      onChanged: name == 'phone' ? (_) => setState(() { _proof = null; _verifiedPhone = null; }) : null,
      validator: (value) {
        final text = value ?? '';
        if (!optional && text.trim().isEmpty) return 'Enter $label';
        if (name == 'phone' && !RegExp(r'^(?:\+?255|0)[67]\d{8}$').hasMatch(text.trim())) return 'Enter a valid Tanzanian mobile number';
        if (name == 'code' && !RegExp(r'^\d{6}$').hasMatch(text)) return 'Enter the 6-digit code';
        if (name == 'password' && text.length < 10) return 'Use at least 10 characters';
        if (name == 'confirmPassword' && text != field('password').text) return 'Passwords do not match';
        if (name == 'dateOfBirth') {
          final date = DateTime.tryParse(text);
          final now = DateTime.now();
          if (!RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(text) || date == null ||
              date.toIso8601String().substring(0, 10) != text || date.isAfter(DateTime(now.year - 18, now.month, now.day))) { return 'Enter a valid birth date; you must be 18 or older'; }
        }
        if (name == 'email' && text.isNotEmpty && !RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(text)) return 'Enter a valid email address';
        return null;
      }),
  );

  void _readDocument(String kind) {
    final title = kind == 'terms' ? 'Account terms' : 'Privacy notice';
    Navigator.push(context, MaterialPageRoute(builder: (_) => Scaffold(
      appBar: AppBar(title: Text(title)),
      body: SingleChildScrollView( padding: const EdgeInsets.all(24), child: SelectableText(_legal![kind]['text'])),
    )));
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: _completed || (!_busy && _step == 0),
    onPopInvokedWithResult: (didPop, result) { if (!didPop) _back(); },
    child: Scaffold(
    appBar: AppBar(leading: IconButton(tooltip: 'Back', onPressed: _busy ? null : _back, icon: const Icon(Icons.arrow_back)), title: Text(_existing ? 'Complete registration' : 'Create your account')),
    body: SafeArea(child: Align(alignment: Alignment.topCenter, child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 560),
      child: _loading ? const Center(child: CircularProgressIndicator()) : _legal == null
        ? Column(mainAxisAlignment: MainAxisAlignment.center, children: [Text(_error ?? 'Unable to load terms'), TextButton(onPressed: _loadLegal, child: const Text('Retry'))])
        : SingleChildScrollView(controller: _scroll, padding: const EdgeInsets.all(24), child: Form(key: _form, child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('Step ${_existing && _step > 2 ? _step : _step + 1} of ${_existing ? 4 : 5}', style: const TextStyle(color: AppColors.textMuted)),
            const SizedBox(height: 8),
            Text(['Your mobile number', 'Check your messages', 'Create a password', 'Personal details', 'Residential address'][_step], style: const TextStyle(fontSize: 26, fontWeight: FontWeight.bold)),
            const SizedBox(height: 12),
            LinearProgressIndicator(value: (_existing && _step > 2 ? _step : _step + 1) / (_existing ? 4 : 5), backgroundColor: AppColors.border),
            const SizedBox(height: 24),
            if (_legal!['draft'] == true) const Padding(padding: EdgeInsets.only(bottom: 20), child: Text('Development test only. Terms are drafts; use synthetic information.', style: TextStyle(color: AppColors.warning))),
            if (_step == 0) ...[
              const Text('We’ll send a 6-digit code to confirm this number belongs to you.', style: TextStyle(color: AppColors.textMuted, height: 1.5)),
              const SizedBox(height: 24),
              _input('phone', 'Mobile number', keyboard: TextInputType.phone),
            ],
            if (_step == 1) ...[
              Text('Enter the 6-digit code sent to ${field('phone').text.trim()}.', style: const TextStyle(color: AppColors.textMuted, height: 1.5)),
              Align(alignment: Alignment.centerLeft, child: TextButton(onPressed: _busy ? null : () => _goTo(0), child: Text(_existing ? 'Back to mobile number' : 'Change number'))),
              const SizedBox(height: 16),
              _input('code', '6-digit SMS code', keyboard: TextInputType.number),
              const Padding(padding: EdgeInsets.only(bottom: 16), child: Text(
                'Use the code suggested by your phone, or allow it to fill from your verification SMS. You can also enter it manually.',
                style: TextStyle(color: AppColors.textMuted, height: 1.5))),
              if (_developmentCode != null) Padding(padding: const EdgeInsets.only(bottom: 16), child: Text('Development code: $_developmentCode (no SMS sent)', style: const TextStyle(color: AppColors.warning))),
              TextButton(onPressed: _busy || _resendSeconds > 0 ? null : _sendCode,
                child: Text(_resendSeconds > 0 ? 'Resend in $_resendSeconds seconds' : 'Resend code')),
            ],
            if (_step == 2) ...[
              const Text('Your number is verified. Choose a password with at least 10 characters.', style: TextStyle(color: AppColors.textMuted, height: 1.5)),
              const SizedBox(height: 24),
              _input('password', 'Password', secret: true),
              _input('confirmPassword', 'Confirm password', secret: true),
            ],
            if (_step == 3) ...[
              _input('fullName', 'Full legal name'),
              _input('dateOfBirth', 'Date of birth (YYYY-MM-DD)', keyboard: TextInputType.datetime),
              DropdownButtonFormField<String>(initialValue: _identityType, decoration: const InputDecoration(labelText: 'Identity document'),
                items: const [DropdownMenuItem(value: 'NIDA', child: Text('NIDA / NIN')), DropdownMenuItem(value: 'PASSPORT', child: Text('Passport'))],
                onChanged: _busy ? null : (value) => setState(() => _identityType = value!)),
              const SizedBox(height: 18),
              _input('nationalId', 'Identity document number'),
              _input('email', 'Email (optional)', optional: true, keyboard: TextInputType.emailAddress),
              const Text('We will verify these details before you can apply for a loan.'),
            ],
            if (_step == 4) ...[
              _input('region', 'Region'), _input('district', 'District'), _input('ward', 'Ward'), _input('street', 'Street / village'),
              _input('landmark', 'House number / landmark (optional)', optional: true),
              TextButton(onPressed: () => _readDocument('terms'), child: const Text('Read account terms')),
              CheckboxListTile(contentPadding: EdgeInsets.zero, value: _terms, onChanged: _busy ? null : (v) => setState(() => _terms = v!), title: const Text('I accept the account terms')),
              TextButton(onPressed: () => _readDocument('privacy'), child: const Text('Read privacy notice')),
              CheckboxListTile(contentPadding: EdgeInsets.zero, value: _privacy, onChanged: _busy ? null : (v) => setState(() => _privacy = v!), title: const Text('I have read the privacy notice')),
              CheckboxListTile(contentPadding: EdgeInsets.zero, value: _marketing, onChanged: _busy ? null : (v) => setState(() => _marketing = v!), title: const Text('Send me offers (optional)')),
            ],
            if (_error != null) Padding(padding: const EdgeInsets.symmetric(vertical: 16), child: Text(_error!, style: const TextStyle(color: AppColors.error))),
            const SizedBox(height: 24),
            FilledButton(onPressed: _busy || (_step == 0 && !_hasSentCode && _resendSeconds > 0) ? null : _step == 0 ? _continuePhone : _step == 1 ? _verifyCode : _next, child: Text(_busy ? 'Please wait…' : _step == 0 ? (_hasSentCode ? 'Continue' : _resendSeconds > 0 ? 'Send again in $_resendSeconds seconds' : 'Send verification code') : _step == 1 ? 'Verify code' : _step == 4 ? (_existing ? 'Save registration' : 'Create account') : 'Continue')),
            
          ],
        ))),
    ))),
  ));
}
