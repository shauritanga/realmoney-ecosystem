import 'package:flutter/material.dart';
import 'package:hugeicons/hugeicons.dart';
import '../services/api_service.dart';
import '../services/push_service.dart';
import '../theme/app_colors.dart';
import 'login_screen.dart';
import 'onboarding_screen.dart';

class AccountTab extends StatefulWidget {
  final Future<void> Function() onUpdated;
  const AccountTab({super.key, required this.onUpdated});
  @override
  State<AccountTab> createState() => _AccountTabState();
}

class _AccountTabState extends State<AccountTab> {
  Map<String, dynamic>? _profile;
  bool _loading = true;
  String? _error;
  @override
  void initState() { super.initState(); _load(); }
  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final profile = await ApiService.request('/onboarding');
      if (mounted) setState(() => _profile = profile);
    } catch (_) {
      if (mounted) setState(() => _error = 'Could not load your profile. Please retry.');
    } finally { if (mounted) setState(() => _loading = false); }
  }
  Future<void> _verification() async {
    await Navigator.push(context, MaterialPageRoute(builder: (_) => const OnboardingScreen(forApplication: false)));
    if (!mounted) return;
    await _load();
    await widget.onUpdated();
  }
  Future<void> _signOut() async {
    final confirmed = await showDialog<bool>(context: context, builder: (context) => AlertDialog(
      title: const Text('Sign out?'), content: const Text('You can sign in again with your mobile number and password.'),
      actions: [TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
        FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Sign out'))],
    ));
    if (confirmed != true) return;
    await PushService.onSignedOut();
    await ApiService.clearToken();
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const LoginScreen()), (_) => false);
  }
  void _information(String title, List<Widget> children) => showModalBottomSheet<void>(
    context: context, showDragHandle: true, useSafeArea: true, isScrollControlled: true,
    builder: (_) => FractionallySizedBox(heightFactor: 0.75, child: ListView(padding: const EdgeInsets.all(24), children: [
      Text(title, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700)), const SizedBox(height: 20), ...children,
    ])),
  );
  Widget _text(String label, dynamic value) => Padding(padding: const EdgeInsets.only(bottom: 18), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
    Text(label, style: const TextStyle(color: AppColors.textMuted)), const SizedBox(height: 4),
    SelectableText(value?.toString().isNotEmpty == true ? '$value' : 'Not provided'),
  ]));
  Widget _status(String title, bool complete) => ListTile(contentPadding: EdgeInsets.zero,
    leading: HugeIcon(icon: complete ? HugeIcons.strokeRoundedCheckmarkCircle02 : HugeIcons.strokeRoundedCircle, color: complete ? AppColors.primary : AppColors.textMuted),
    title: Text(title), trailing: Text(complete ? 'Complete' : 'To do', style: TextStyle(color: complete ? AppColors.primary : AppColors.textMuted)),
  );
  Widget _action(List<List<dynamic>> icon, String title, String subtitle, VoidCallback action) => ListTile(
    contentPadding: const EdgeInsets.symmetric(vertical: 4), leading: HugeIcon(icon: icon, color: AppColors.primary),
    title: Text(title), subtitle: Text(subtitle), trailing: const HugeIcon(icon: HugeIcons.strokeRoundedArrowRight01, size: 18), onTap: action,
  );
  @override
  Widget build(BuildContext context) => RefreshIndicator(onRefresh: _load, child: ListView(
    key: const PageStorageKey('borrower-account'), padding: const EdgeInsets.all(20), physics: const AlwaysScrollableScrollPhysics(),
    children: [
      if (_loading) const LinearProgressIndicator(),
      if (_error != null) ...[Text(_error!, style: const TextStyle(color: AppColors.error)), TextButton(onPressed: _load, child: const Text('Retry'))],
      if (_profile != null) ...[
        const SizedBox(height: 12),
        Text(_profile!['fullName'] ?? 'Your account', style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w700)),
        const SizedBox(height: 6), Text(_profile!['phone'] ?? '', style: const TextStyle(color: AppColors.textMuted)),
        const SizedBox(height: 28),
        const Text('Verification', style: TextStyle(fontSize: 19, fontWeight: FontWeight.w600)),
        _status('Personal details', _profile!['registrationComplete'] == true),
        _status('Identity', _profile!['identityVerified'] == true),
        _status('Income details', _profile!['financialComplete'] == true),
        _status('Mobile-money wallet', _profile!['walletVerified'] == true),
        OutlinedButton(onPressed: _verification, child: Text(_profile!['canApply'] == true ? 'Review verification details' : 'Complete verification')),
        const SizedBox(height: 20), const Divider(),
        _action(HugeIcons.strokeRoundedIdVerified, 'Personal details', 'View your registered information', () {
          final data = _profile!['onboarding'] as Map<String, dynamic>? ?? {};
          _information('Personal details', [
            _text('Legal name', _profile!['fullName']), _text('Mobile number', _profile!['phone']),
            _text('Email', _profile!['email']), _text('Date of birth', data['dateOfBirth']),
            _text('Address', [data['street'], data['ward'], data['district'], data['region']].whereType<String>().where((v) => v.isNotEmpty).join(', ')),
          ]);
        }),
      ],
      _action(HugeIcons.strokeRoundedLock, 'Account security', 'Protect your password and wallet', () => _information('Account security', const [
        Text('Use a unique password and keep your verification codes private.', style: TextStyle(height: 1.6)),
        SizedBox(height: 16), Text('Enter your mobile-money PIN only in the prompt from your mobile-money provider. Never share it with another person.', style: TextStyle(height: 1.6)),
        SizedBox(height: 16), Text('Sign out when using a shared device.', style: TextStyle(height: 1.6)),
      ])),
      _action(HugeIcons.strokeRoundedHelpCircle, 'Help', 'Applications, payments and verification', () => _information('Help', [
        _text('Where is my application?', 'Open My loans to see its current status and details. Applications require credit-officer approval.'),
        _text('How do I repay?', 'Open Payments, choose an amount and request the mobile-money prompt. Refresh payment history after completing payment.'),
        _text('Where is my receipt?', 'Open a completed transaction in Payments. Pending and failed attempts are not receipts.'),
        _text('Why can’t I apply?', 'Complete identity, income and wallet verification in Account. An outstanding loan prevents another application.'),
      ])),
      const Divider(),
      ListTile(contentPadding: EdgeInsets.zero, leading: const HugeIcon(icon: HugeIcons.strokeRoundedLogout01, color: AppColors.error),
        title: const Text('Sign out', style: TextStyle(color: AppColors.error)), onTap: _signOut),
      const SizedBox(height: 24),
      Center(
        child: Column(
          children: [
            Image.asset('assets/images/logo.png', height: 40),
            const SizedBox(height: 8),
            Image.asset('assets/images/logo_text.png', height: 18),
            const SizedBox(height: 4),
            const Text(
              'RealMoney Microfinance Tanzania · v1.0.0',
              style: TextStyle(color: AppColors.textMuted, fontSize: 11),
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    ],
  ));
}
