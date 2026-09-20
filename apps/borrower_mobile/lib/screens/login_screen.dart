import '../theme/app_colors.dart';
import 'package:flutter/material.dart';
import 'package:hugeicons/hugeicons.dart';
import '../services/api_service.dart';
import 'dashboard_screen.dart';
import 'registration_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _form = GlobalKey<FormState>();
  final _phone = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  bool _passwordVisible = false;
  String? _error;

  @override
  void dispose() { _phone.dispose(); _password.dispose(); super.dispose(); }

  Future<void> _login() async {
    if (!_form.currentState!.validate()) return;
    setState(() { _busy = true; _error = null; });
    try {
      final data = await ApiService.request('/auth/login', method: 'POST', authenticated: false,
          body: {'identifier': _phone.text.trim(), 'password': _password.text});
      await ApiService.saveToken(data['accessToken']);
      if (!mounted) return;
      Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const DashboardScreen()));
    } catch (error) {
      if (mounted) setState(() => _error = error.toString().replaceFirst('Exception: ', ''));
    } finally { if (mounted) setState(() => _busy = false); }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(child: Center(child: SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 440),
        child: Form(key: _form, child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Center(
            child: Image.asset(
              'assets/images/logo.png',
              height: 72,
              semanticLabel: 'RealMoney Logo',
            ),
          ),
          const SizedBox(height: 14),
          Center(
            child: Image.asset(
              'assets/images/logo_text.png',
              height: 32,
              semanticLabel: 'RealMoney',
            ),
          ),
          const SizedBox(height: 8),
          const Center(
            child: Text(
              'Sign in to manage your loans.',
              style: TextStyle(color: AppColors.textMuted, fontSize: 14),
            ),
          ),
          const SizedBox(height: 32),
          TextFormField(controller: _phone, keyboardType: TextInputType.phone,
            decoration: const InputDecoration(labelText: 'Mobile number', hintText: '+255712345678'),
            validator: (v) => v == null || v.trim().isEmpty ? 'Enter your mobile number' : null),
          const SizedBox(height: 20),
          TextFormField(controller: _password, obscureText: !_passwordVisible,
            enableSuggestions: false, autocorrect: false,
            decoration: InputDecoration(labelText: 'Password',
              suffixIcon: IconButton(
                tooltip: _passwordVisible ? 'Hide password' : 'Show password',
                onPressed: () => setState(() => _passwordVisible = !_passwordVisible),
                icon: HugeIcon(icon: _passwordVisible ? HugeIcons.strokeRoundedViewOff : HugeIcons.strokeRoundedView))),
            validator: (v) => v == null || v.isEmpty ? 'Enter your password' : null,
            onFieldSubmitted: (_) { if (!_busy) _login(); }),
          if (_error != null) Padding(padding: const EdgeInsets.only(top: 16),
            child: Text(_error!, style: const TextStyle(color: AppColors.error))),
          const SizedBox(height: 24),
          FilledButton(onPressed: _busy ? null : _login, child: Text(_busy ? 'Signing in…' : 'Sign in')),
          const SizedBox(height: 12),
          OutlinedButton(onPressed: _busy ? null : () async {
            final registered = await Navigator.push<bool>(context, MaterialPageRoute(builder: (_) => const RegistrationScreen()));
            if (!context.mounted || registered != true) return;
            Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const DashboardScreen()));
          }, child: const Text('Create an account')),
        ])),
      ),
    ))),
  );
}
