import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
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
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final profile = await ApiService.request('/onboarding');
      if (mounted) setState(() => _profile = profile);
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Could not load your profile. Please retry.');
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _verification() async {
    if (_profile?['canApply'] == true) {
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => Scaffold(
            appBar: AppBar(title: const Text('Verification')),
            body: SafeArea(
              child: LayoutBuilder(
                builder: (context, constraints) => SingleChildScrollView(
                  child: ConstrainedBox(
                    constraints: BoxConstraints(
                      minHeight: constraints.maxHeight,
                    ),
                    child: Center(
                      child: Padding(
                        padding: const EdgeInsets.all(32),
                        child: ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 360),
                          child: const Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                Icons.verified_outlined,
                                size: 64,
                                color: AppColors.primary,
                              ),
                              SizedBox(height: 24),
                              Text(
                                'No more verification needed',
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  fontSize: 22,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              SizedBox(height: 12),
                              Text(
                                'Your verification is complete. You can view your submitted information in Personal details.',
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  color: AppColors.textMuted,
                                  height: 1.5,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
      return;
    }
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => const OnboardingScreen(forApplication: false),
      ),
    );
    if (!mounted) return;
    await _load();
    await widget.onUpdated();
  }

  Future<void> _signOut() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Sign out?'),
        content: const Text(
          'You can sign in again with your mobile number and password.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Sign out'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    await PushService.onSignedOut();
    await ApiService.clearToken();
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (_) => false,
    );
  }

  void _information(String title, List<Widget> children) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => Scaffold(
          appBar: AppBar(title: Text(title)),
          body: ListView(padding: const EdgeInsets.all(24), children: children),
        ),
      ),
    );
  }

  Widget _sectionLabel(String title) => Padding(
    padding: const EdgeInsets.fromLTRB(4, 24, 4, 10),
    child: Text(
      title,
      style: const TextStyle(
        fontSize: 13,
        fontWeight: FontWeight.w600,
        color: AppColors.textMuted,
      ),
    ),
  );

  void _personalDetails() {
    final data = _profile!['onboarding'] as Map<String, dynamic>? ?? {};
    final financial = data['financial'] as Map<String, dynamic>? ?? {};
    final wallet = data['wallet'] as Map<String, dynamic>? ?? {};
    final consents = data['consents'] as List<dynamic>? ?? [];
    final consent = consents.isEmpty
        ? <String, dynamic>{}
        : consents.last as Map<String, dynamic>;
    const labels = {
      'NIDA': 'NIDA',
      'VOTER_ID': 'Voter ID',
      'DRIVING_LICENSE': 'Driving licence',
      'PASSPORT': 'Passport',
      'EMPLOYED': 'Employed',
      'SELF_EMPLOYED': 'Self-employed',
      'OTHER': 'Other',
      'MPESA': 'M-Pesa',
      'AIRTEL_MONEY': 'Airtel Money',
      'TIGO_PESA': 'Tigo Pesa',
      'HALOPESA': 'HaloPesa',
    };
    String? money(dynamic value) =>
        value is num ? 'TZS ${NumberFormat('#,##0.##').format(value)}' : null;
    _information('Personal details', [
      _sectionLabel('Personal information'),
      _text('Legal name', _profile!['fullName']),
      _text('Mobile number', _profile!['phone']),
      _text('Email', _profile!['email']),
      _text('Date of birth', data['dateOfBirth']),
      _sectionLabel('Identity document'),
      _text(
        'Document type',
        labels[data['identityType']] ?? data['identityType'],
      ),
      _text('Document number', _profile!['nationalId']),
      if (_profile!['identityVerification'] is Map) ...[
        _text(
          'Document and live selfie status',
          (_profile!['identityVerification']['status'] as String? ??
                  'not_started')
              .replaceAll('_', ' '),
        ),
        if (_profile!['identityVerification']['completedAt'] != null)
          _text(
            'Identity verified on',
            _profile!['identityVerification']['completedAt'],
          ),
      ],
      _sectionLabel('Residential address'),
      _text('Region', data['region']),
      _text('District', data['district']),
      _text('Ward', data['ward']),
      _text('Street', data['street']),
      _text('Landmark', data['landmark']),
      _sectionLabel('Income & expenses'),
      _text(
        'Employment status',
        labels[financial['employmentStatus']] ?? financial['employmentStatus'],
      ),
      _text('Occupation or income source', financial['occupation']),
      _text('Monthly income', money(financial['monthlyIncome'])),
      _text(
        'Monthly essential expenses',
        money(financial['essentialExpenses']),
      ),
      _text(
        'Existing monthly loan repayments',
        money(financial['existingLoanRepayments']),
      ),
      _sectionLabel('Mobile-money wallet'),
      _text('Provider', labels[wallet['provider']] ?? wallet['provider']),
      _text('Wallet mobile number', wallet['phone']),
      _sectionLabel('Consent'),
      _text('Account terms version accepted', consent['termsVersion']),
      _text('Privacy notice version acknowledged', consent['privacyVersion']),
      _text('Accepted on', consent['acceptedAt']),
      _text(
        'Marketing messages',
        consent['marketingConsent'] == null
            ? null
            : consent['marketingConsent'] == true
            ? 'Opted in'
            : 'Opted out',
      ),
    ]);
  }

  void _support() => _information('Help & support', [
    _text(
      'Contact support',
      'Support contact details are not available in this version of the app.',
    ),
    _text(
      'Before contacting support',
      'Have your loan or transaction reference ready. Never share your password, verification codes or mobile-money PIN.',
    ),
    OutlinedButton(onPressed: _faq, child: const Text('Browse FAQ')),
  ]);

  void _faq() => _information('FAQ', [
    _text(
      'Where is my application?',
      'Open My loans to see its current status and details. Applications require credit-officer approval.',
    ),
    _text(
      'How do I repay?',
      'Open Payments, choose an amount and request the mobile-money prompt. Refresh payment history after completing payment.',
    ),
    _text(
      'Where is my receipt?',
      'Open a completed transaction in Payments. Pending and failed attempts are not receipts.',
    ),
    _text(
      'Why can’t I apply?',
      'Complete identity, income and wallet verification in Account. An outstanding loan prevents another application.',
    ),
  ]);

  void _settings() => _information('Settings', [
    _text(
      'Notifications',
      'Manage notification permission in your phone settings under Apps → RealMoney → Notifications. On iPhone, open Settings → Notifications → RealMoney.',
    ),
    _text('Language', 'English'),
    _text('App version', '1.0.0'),
  ]);

  void _deletion() => _information('Delete account & data', [
    const Icon(Icons.delete_outline, size: 36, color: AppColors.error),
    const SizedBox(height: 24),
    _text(
      'Account deletion is not available yet',
      'This version does not support submitting account or data deletion requests. No account information has been deleted.',
    ),
    OutlinedButton(onPressed: _support, child: const Text('Help & support')),
  ]);

  Widget _text(String label, dynamic value) => Padding(
    padding: const EdgeInsets.only(bottom: 18),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(color: AppColors.textMuted)),
        const SizedBox(height: 4),
        SelectableText(
          value?.toString().isNotEmpty == true ? '$value' : 'Not provided',
        ),
      ],
    ),
  );

  bool _done(String key) => _profile![key] == true;

  int get _verificationComplete => [
    _done('registrationComplete'),
    _done('identityVerified'),
    _done('financialComplete'),
    _done('walletVerified'),
  ].where((done) => done).length;

  Widget _menuRow({
    required List<List<dynamic>> icon,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
    bool showDivider = true,
    bool destructive = false,
  }) => Column(
    mainAxisSize: MainAxisSize.min,
    children: [
      ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        leading: Container(
          padding: const EdgeInsets.all(9),
          decoration: BoxDecoration(
            color: (destructive ? AppColors.error : AppColors.primary)
                .withValues(alpha: 0.07),
            borderRadius: BorderRadius.circular(12),
          ),
          child: HugeIcon(
            icon: icon,
            color: destructive ? AppColors.error : AppColors.primary,
            size: 20,
          ),
        ),
        title: Text(
          title,
          style: TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w600,
            color: destructive ? AppColors.error : AppColors.text,
          ),
        ),
        subtitle: Text(
          subtitle,
          style: const TextStyle(fontSize: 12, color: AppColors.textMuted),
        ),
        trailing: const HugeIcon(
          icon: HugeIcons.strokeRoundedArrowRight01,
          size: 18,
          color: AppColors.textMuted,
        ),
        onTap: onTap,
      ),
      if (showDivider)
        Divider(
          height: 1,
          thickness: 0.5,
          indent: 60,
          endIndent: 16,
          color: AppColors.border.withValues(alpha: 0.25),
        ),
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
                  (name == null || name.trim().isEmpty) ? 'Your account' : name,
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  '${_profile!['phone'] ?? ''}',
                  style: const TextStyle(
                    color: AppColors.textMuted,
                    fontSize: 13,
                  ),
                ),
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: verified
                        ? AppColors.successTint
                        : AppColors.warning.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    verified ? 'Verified borrower' : 'Verification in progress',
                    style: TextStyle(
                      color: verified ? AppColors.primary : AppColors.warning,
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

  @override
  Widget build(BuildContext context) => RefreshIndicator(
    onRefresh: _load,
    child: ListView(
      key: const PageStorageKey('borrower-account'),
      padding: const EdgeInsets.all(20),
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        if (_loading) const LinearProgressIndicator(),
        if (_error != null) ...[
          Text(_error!, style: const TextStyle(color: AppColors.error)),
          TextButton(onPressed: _load, child: const Text('Retry')),
        ],
        if (_profile != null) ...[
          _profileHeader(),
          _sectionLabel('Your account'),
          _sectionCard(
            children: [
              _menuRow(
                icon: HugeIcons.strokeRoundedIdVerified,
                title: 'Personal details',
                subtitle: 'View your registered information',
                onTap: _personalDetails,
              ),
              _menuRow(
                icon: HugeIcons.strokeRoundedCheckmarkCircle02,
                title: 'Verification',
                subtitle: _profile!['canApply'] == true
                    ? 'No more verification needed'
                    : 'Complete verification · $_verificationComplete of 4 complete',
                onTap: _verification,
              ),
              _menuRow(
                icon: HugeIcons.strokeRoundedLock,
                title: 'Account security',
                subtitle: 'Protect your password and wallet',
                onTap: () => _information('Account security', const [
                  Text(
                    'Use a unique password and keep your verification codes private.',
                    style: TextStyle(height: 1.6),
                  ),
                  SizedBox(height: 16),
                  Text(
                    'Enter your mobile-money PIN only in the prompt from your mobile-money provider. Never share it with another person.',
                    style: TextStyle(height: 1.6),
                  ),
                  SizedBox(height: 16),
                  Text(
                    'Sign out when using a shared device.',
                    style: TextStyle(height: 1.6),
                  ),
                ]),
              ),
              _menuRow(
                icon: HugeIcons.strokeRoundedSettings01,
                title: 'Settings',
                subtitle: 'Notifications and app information',
                showDivider: false,
                onTap: _settings,
              ),
            ],
          ),
          _sectionLabel('Support'),
          _sectionCard(
            children: [
              _menuRow(
                icon: HugeIcons.strokeRoundedHelpCircle,
                title: 'Help & support',
                subtitle: 'Contact information and assistance',
                onTap: _support,
              ),
              _menuRow(
                icon: HugeIcons.strokeRoundedQuestion,
                title: 'FAQ',
                subtitle: 'Answers to common questions',
                showDivider: false,
                onTap: _faq,
              ),
            ],
          ),
        ],
        _sectionLabel('Account actions'),
        _sectionCard(
          children: [
            _menuRow(
              icon: HugeIcons.strokeRoundedDelete02,
              title: 'Delete account & data',
              subtitle: 'Account closure and data deletion',
              destructive: true,
              onTap: _deletion,
            ),
            ListTile(
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 16,
                vertical: 4,
              ),
              leading: Container(
                padding: const EdgeInsets.all(9),
                decoration: BoxDecoration(
                  color: AppColors.primary.withValues(alpha: 0.07),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const HugeIcon(
                  icon: HugeIcons.strokeRoundedLogout01,
                  color: AppColors.text,
                  size: 20,
                ),
              ),
              title: const Text(
                'Sign out',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: AppColors.text,
                ),
              ),
              onTap: _signOut,
            ),
          ],
        ),
        const SizedBox(height: 28),
        Center(
          child: Column(
            children: [
              Image.asset(
                'assets/images/logo.png',
                height: 28,
                semanticLabel: 'RealMoney',
              ),
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
    ),
  );
}
