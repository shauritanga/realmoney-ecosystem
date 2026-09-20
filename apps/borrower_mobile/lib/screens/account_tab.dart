import 'package:flutter/material.dart';
import 'package:hugeicons/hugeicons.dart';
import '../services/api_service.dart';
import '../services/push_service.dart';
import '../theme/app_colors.dart';
import 'home_header.dart';
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

  bool _done(String key) => _profile![key] == true;

  int get _verificationComplete => [
    _done('registrationComplete'),
    _done('identityVerified'),
    _done('financialComplete'),
    _done('walletVerified'),
  ].where((done) => done).length;

  Widget _status(String title, bool complete) => ListTile(
    contentPadding: EdgeInsets.zero,
    dense: true,
    leading: HugeIcon(
      icon: complete
          ? HugeIcons.strokeRoundedCheckmarkCircle02
          : HugeIcons.strokeRoundedCircle,
      color: complete ? AppColors.primary : AppColors.textMuted,
      size: 22,
    ),
    title: Text(title, style: const TextStyle(fontSize: 14)),
    trailing: Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: complete
            ? AppColors.successTint
            : AppColors.textMuted.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        complete ? 'Complete' : 'To do',
        style: TextStyle(
          color: complete ? AppColors.primary : AppColors.textMuted,
          fontSize: 11,
          fontWeight: FontWeight.w700,
        ),
      ),
    ),
  );

  Widget _menuRow({
    required List<List<dynamic>> icon,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
    bool showDivider = true,
  }) =>
      Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ListTile(
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            leading: Container(
              padding: const EdgeInsets.all(9),
              decoration: BoxDecoration(
                color: AppColors.primary.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: HugeIcon(
                  icon: icon, color: AppColors.primary, size: 20),
            ),
            title: Text(title,
                style:
                    const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
            subtitle: Text(subtitle,
                style: const TextStyle(
                    fontSize: 12, color: AppColors.textMuted)),
            trailing: const HugeIcon(
                icon: HugeIcons.strokeRoundedArrowRight01,
                size: 18,
                color: AppColors.textMuted),
            onTap: onTap,
          ),
          if (showDivider)
            const Divider(height: 1, indent: 60, endIndent: 16),
        ],
      );

  Widget _sectionCard({required List<Widget> children}) => Material(
        color: AppColors.surface,
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: BorderSide(color: AppColors.border.withValues(alpha: 0.6)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: children,
        ),
      );

  Widget _profileHeader() {
    final name = _profile!['fullName']?.toString();
    final verified = _profile!['canApply'] == true;
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.border.withValues(alpha: 0.6)),
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 30,
            backgroundColor: AppColors.primary,
            child: Text(
              initialsFor(name),
              style: const TextStyle(
                color: AppColors.onPrimary,
                fontWeight: FontWeight.w700,
                fontSize: 20,
              ),
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  (name == null || name.trim().isEmpty)
                      ? 'Your account'
                      : name,
                  style: const TextStyle(
                      fontSize: 20, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 4),
                Text(
                  '${_profile!['phone'] ?? ''}',
                  style: const TextStyle(
                      color: AppColors.textMuted, fontSize: 13),
                ),
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: verified
                        ? AppColors.successTint
                        : AppColors.warning.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    verified ? 'Verified borrower' : 'Verification in progress',
                    style: TextStyle(
                      color: verified
                          ? AppColors.primary
                          : AppColors.warning,
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _verificationCard() {
    final complete = _verificationComplete;
    final canApply = _profile!['canApply'] == true;
    return _sectionCard(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(18, 16, 18, 4),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text('Verification',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            Text('$complete of 4 complete',
                style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.textMuted,
                    fontWeight: FontWeight.w600)),
          ],
        ),
      ),
      Padding(
        padding: const EdgeInsets.fromLTRB(18, 10, 18, 4),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: LinearProgressIndicator(
            value: complete / 4,
            minHeight: 8,
            backgroundColor: AppColors.surfaceMuted,
            valueColor:
                const AlwaysStoppedAnimation(AppColors.primary),
          ),
        ),
      ),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _status('Personal details', _done('registrationComplete')),
            _status('Identity', _done('identityVerified')),
            _status('Income details', _done('financialComplete')),
            _status('Mobile-money wallet', _done('walletVerified')),
          ],
        ),
      ),
      Padding(
        padding: const EdgeInsets.fromLTRB(18, 8, 18, 18),
        child: canApply
            ? OutlinedButton(
                onPressed: _verification,
                child: const Text('Review verification details'),
              )
            : FilledButton(
                onPressed: _verification,
                style: FilledButton.styleFrom(
                  minimumSize: const Size(double.infinity, 48),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                ),
                child: const Text('Complete verification'),
              ),
      ),
    ]);
  }

  @override
  Widget build(BuildContext context) => RefreshIndicator(onRefresh: _load, child: ListView(
    key: const PageStorageKey('borrower-account'), padding: const EdgeInsets.all(20), physics: const AlwaysScrollableScrollPhysics(),
    children: [
      if (_loading) const LinearProgressIndicator(),
      if (_error != null) ...[Text(_error!, style: const TextStyle(color: AppColors.error)), TextButton(onPressed: _load, child: const Text('Retry'))],
      if (_profile != null) ...[
        _profileHeader(),
        const SizedBox(height: 16),
        _verificationCard(),
        const SizedBox(height: 16),
        _sectionCard(children: [
          _menuRow(
            icon: HugeIcons.strokeRoundedIdVerified,
            title: 'Personal details',
            subtitle: 'View your registered information',
            onTap: () {
              final data = _profile!['onboarding'] as Map<String, dynamic>? ?? {};
              _information('Personal details', [
                _text('Legal name', _profile!['fullName']), _text('Mobile number', _profile!['phone']),
                _text('Email', _profile!['email']), _text('Date of birth', data['dateOfBirth']),
                _text('Address', [data['street'], data['ward'], data['district'], data['region']].whereType<String>().where((v) => v.isNotEmpty).join(', ')),
              ]);
            },
          ),
          _menuRow(
            icon: HugeIcons.strokeRoundedLock,
            title: 'Account security',
            subtitle: 'Protect your password and wallet',
            onTap: () => _information('Account security', const [
              Text('Use a unique password and keep your verification codes private.', style: TextStyle(height: 1.6)),
              SizedBox(height: 16), Text('Enter your mobile-money PIN only in the prompt from your mobile-money provider. Never share it with another person.', style: TextStyle(height: 1.6)),
              SizedBox(height: 16), Text('Sign out when using a shared device.', style: TextStyle(height: 1.6)),
            ]),
          ),
          _menuRow(
            icon: HugeIcons.strokeRoundedHelpCircle,
            title: 'Help',
            subtitle: 'Applications, payments and verification',
            showDivider: false,
            onTap: () => _information('Help', [
              _text('Where is my application?', 'Open My loans to see its current status and details. Applications require credit-officer approval.'),
              _text('How do I repay?', 'Open Payments, choose an amount and request the mobile-money prompt. Refresh payment history after completing payment.'),
              _text('Where is my receipt?', 'Open a completed transaction in Payments. Pending and failed attempts are not receipts.'),
              _text('Why can’t I apply?', 'Complete identity, income and wallet verification in Account. An outstanding loan prevents another application.'),
            ]),
          ),
        ]),
      ],
      const SizedBox(height: 16),
      _sectionCard(children: [
        ListTile(
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
          leading: Container(
            padding: const EdgeInsets.all(9),
            decoration: BoxDecoration(
              color: AppColors.error.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const HugeIcon(
                icon: HugeIcons.strokeRoundedLogout01,
                color: AppColors.error,
                size: 20),
          ),
          title: const Text('Sign out',
              style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: AppColors.error)),
          onTap: _signOut,
        ),
      ]),
      const SizedBox(height: 28),
      Center(
        child: Column(
          children: [
            Image.asset('assets/images/logo.png',
                height: 28, semanticLabel: 'RealMoney'),
            const SizedBox(height: 8),
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
