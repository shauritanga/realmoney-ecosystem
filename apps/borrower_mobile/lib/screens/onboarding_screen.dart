import '../theme/app_colors.dart';
import 'package:flutter/material.dart';
import '../services/api_service.dart';
import 'registration_screen.dart';

class OnboardingScreen extends StatefulWidget {
  final bool forApplication;
  const OnboardingScreen({super.key, this.forApplication = true});
  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final _form = GlobalKey<FormState>();
  final _occupation = TextEditingController();
  final _income = TextEditingController();
  final _expenses = TextEditingController();
  final _debts = TextEditingController();
  Map<String, dynamic>? _profile;
  bool _loading = true, _busy = false;
  String? _error;
  String _employment = 'EMPLOYED', _wallet = 'MPESA';
  @override
  void initState() { super.initState(); _load(); }
  @override
  void dispose() { for (final c in [_occupation, _income, _expenses, _debts]) { c.dispose(); } super.dispose(); }
  Future<void> _load() async {
    try {
      final profile = await ApiService.request('/onboarding');
      if (!mounted) return;
      final details = profile['onboarding'] as Map<String, dynamic>? ?? {};
      final financial = details['financial'] as Map<String, dynamic>? ?? {};
      setState(() {
        _profile = profile; _loading = false;
        _employment = financial['employmentStatus'] ?? 'EMPLOYED';
        _wallet = details['wallet']?['provider'] ?? 'MPESA';
        _occupation.text = financial['occupation'] ?? '';
        _income.text = financial['monthlyIncome']?.toString() ?? '';
        _expenses.text = financial['essentialExpenses']?.toString() ?? '';
        _debts.text = financial['existingLoanRepayments']?.toString() ?? '';
      });
    } catch (e) { if (mounted) setState(() { _loading = false; _error = e.toString().replaceFirst('Exception: ', ''); }); }
  }
  Future<void> _perform(Future<void> Function() action) async {
    setState(() { _busy = true; _error = null; });
    try { await action(); await _load(); }
    catch (e) { if (mounted) setState(() => _error = e.toString().replaceFirst('Exception: ', '')); }
    finally { if (mounted) setState(() => _busy = false); }
  }
  Widget _amount(TextEditingController controller, String label) => Padding(
    padding: const EdgeInsets.only(bottom: 18),
    child: TextFormField(controller: controller, enabled: !_busy, keyboardType: const TextInputType.numberWithOptions(decimal: true),
      decoration: InputDecoration(labelText: label, prefixText: 'TZS ', border: const OutlineInputBorder()),
      validator: (v) { final amount = double.tryParse(v ?? ''); return amount == null || !amount.isFinite || amount < 0 || amount > 1000000000 ? 'Enter an amount from 0 to 1,000,000,000' : null; }),
  );
  Widget _status(String label, bool done) => Padding(padding: const EdgeInsets.symmetric(vertical: 8), child: Row(children: [
    Icon(done ? Icons.check_circle : Icons.radio_button_unchecked, color: done ? AppColors.primary : Colors.grey),
    const SizedBox(width: 12), Expanded(child: Text(label)),
  ]));
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(widget.forApplication ? 'Before your first loan' : 'Verification details')),
    body: SafeArea(child: Center(child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 560),
      child: _loading ? const Center(child: CircularProgressIndicator()) : SingleChildScrollView(padding: const EdgeInsets.all(24), child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('Complete your borrower profile', style: TextStyle(fontSize: 26, fontWeight: FontWeight.bold)),
          const SizedBox(height: 12),
          const Text('Verify your identity and wallet, then tell us about your income and regular expenses. Never enter your mobile-money PIN here.'),
          if (_profile?['development'] == true) const Padding(padding: EdgeInsets.symmetric(vertical: 16), child: Text('Development mode: identity and wallet checks are simulated. Use synthetic information only.', style: TextStyle(color: AppColors.warning))),
          if (_profile != null) ...[
            const SizedBox(height: 20),
            _status('Account and address', _profile!['registrationComplete'] == true),
            if (_profile!['registrationComplete'] != true) OutlinedButton(onPressed: _busy ? null : () async {
              final updated = await Navigator.push<bool>(context, MaterialPageRoute(builder: (_) => RegistrationScreen(existingProfile: _profile)));
              if (updated == true && mounted) await _load();
            }, child: const Text('Complete registration')),
            _status('Identity verified', _profile!['identityVerified'] == true),
            if (_profile!['registrationComplete'] == true && _profile!['identityVerified'] != true)
              OutlinedButton(onPressed: _busy ? null : () => _perform(() async { await ApiService.request('/onboarding/verify-identity', method: 'POST', body: {}); }), child: Text(_busy ? 'Checking…' : 'Verify my identity')),
            _status('Income details up to date', _profile!['financialComplete'] == true),
            _status('Mobile-money wallet verified', _profile!['walletVerified'] == true),
            if (_profile!['identityVerified'] == true) ...[
              const Divider(height: 36),
              Form(key: _form, child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                DropdownButtonFormField<String>(initialValue: _employment, decoration: const InputDecoration(labelText: 'Employment status'),
                  items: const [DropdownMenuItem(value: 'EMPLOYED', child: Text('Employed')), DropdownMenuItem(value: 'SELF_EMPLOYED', child: Text('Self-employed / business')), DropdownMenuItem(value: 'OTHER', child: Text('Other income source'))],
                  onChanged: _busy ? null : (v) => setState(() => _employment = v!)),
                const SizedBox(height: 18),
                TextFormField(controller: _occupation, enabled: !_busy, decoration: const InputDecoration(labelText: 'Occupation / business / income source', border: OutlineInputBorder()),
                  validator: (v) => (v?.trim().length ?? 0) < 2 ? 'Enter your occupation or income source' : null),
                const SizedBox(height: 18),
                _amount(_income, 'Typical monthly income'), _amount(_expenses, 'Monthly essential expenses'), _amount(_debts, 'Monthly existing loan repayments'),
                Text('Wallet number: ${_profile!['phone']}'),
                const SizedBox(height: 8),
                const Text('Use a wallet registered in your legal name on this verified phone number.'),
                const SizedBox(height: 16),
                DropdownButtonFormField<String>(initialValue: _wallet, decoration: const InputDecoration(labelText: 'Mobile-money provider'),
                  items: const [DropdownMenuItem(value: 'MPESA', child: Text('M-Pesa')), DropdownMenuItem(value: 'AIRTEL_MONEY', child: Text('Airtel Money')), DropdownMenuItem(value: 'TIGO_PESA', child: Text('Mixx by Yas / Tigo Pesa')), DropdownMenuItem(value: 'HALOPESA', child: Text('HaloPesa'))],
                  onChanged: _busy ? null : (v) => setState(() => _wallet = v!)),
                const SizedBox(height: 24),
                OutlinedButton(onPressed: _busy ? null : () {
                  if (!_form.currentState!.validate()) return;
                  _perform(() async { await ApiService.request('/onboarding/financial', method: 'PUT', body: {
                    'employmentStatus': _employment, 'occupation': _occupation.text.trim(),
                    'monthlyIncome': double.parse(_income.text), 'essentialExpenses': double.parse(_expenses.text),
                    'existingLoanRepayments': double.parse(_debts.text), 'walletPhone': _profile!['phone'], 'walletProvider': _wallet,
                  }); });
                }, child: Text(_busy ? 'Verifying wallet…' : 'Save details and verify wallet')),
              ])),
            ],
            const SizedBox(height: 24),
            FilledButton(onPressed: !_busy && _profile!['canApply'] == true ? () => Navigator.pop(context, true) : null, child: Text(widget.forApplication ? 'Continue to loan application' : 'Done')),
          ],
          if (_error != null) Padding(padding: const EdgeInsets.symmetric(vertical: 16), child: Text(_error!, style: const TextStyle(color: AppColors.error))),
          if (_profile == null) TextButton(onPressed: _load, child: const Text('Retry')),
        ],
      )),
    ))),
  );
}
