import 'package:flutter/material.dart';
import 'package:hugeicons/hugeicons.dart';

import '../services/api_service.dart';
import '../theme/app_colors.dart';
import 'registration_screen.dart';
import 'identity_verification_screen.dart';

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
  bool _loading = true;
  bool _busy = false;
  String? _error;
  String _employment = 'EMPLOYED';
  String _wallet = 'MPESA';

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final c in [_occupation, _income, _expenses, _debts]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final profile = await ApiService.request('/onboarding');
      if (!mounted) return;
      final details = profile['onboarding'] as Map<String, dynamic>? ?? {};
      final financial = details['financial'] as Map<String, dynamic>? ?? {};
      setState(() {
        _profile = profile;
        _loading = false;
        _employment = financial['employmentStatus'] ?? 'EMPLOYED';
        _wallet = details['wallet']?['provider'] ?? 'MPESA';
        _occupation.text = financial['occupation'] ?? '';
        _income.text = financial['monthlyIncome']?.toString() ?? '';
        _expenses.text = financial['essentialExpenses']?.toString() ?? '';
        _debts.text = financial['existingLoanRepayments']?.toString() ?? '';
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = e.toString().replaceFirst('Exception: ', '');
        });
      }
    }
  }

  Future<void> _perform(Future<void> Function() action) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
      await _load();
    } catch (e) {
      if (mounted) {
        setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _submitFinancial() async {
    if (!_form.currentState!.validate()) return;
    await _perform(() async {
      await ApiService.request(
        '/onboarding/financial',
        method: 'PUT',
        body: {
          'employmentStatus': _employment,
          'occupation': _occupation.text.trim(),
          'monthlyIncome': double.parse(_income.text),
          'essentialExpenses': double.parse(_expenses.text),
          'existingLoanRepayments': double.parse(_debts.text),
          'walletPhone': _profile!['phone'],
          'walletProvider': _wallet,
        },
      );
    });
  }

  String _maskNationalId(String? id) {
    if (id == null || id.isEmpty) return 'Not provided';
    if (id.length <= 8) return id;
    final start = id.substring(0, 8);
    final end = id.substring(id.length - 4);
    return '$start••••••••$end';
  }

  double get _progressValue {
    if (_profile == null) return 0.0;
    int completed = 0;
    if (_profile!['registrationComplete'] == true) completed++;
    if (_profile!['identityVerified'] == true) completed++;
    if (_profile!['financialComplete'] == true &&
        _profile!['walletVerified'] == true) {
      completed++;
    }
    return completed / 3.0;
  }

  int get _stepsCompletedCount {
    if (_profile == null) return 0;
    int count = 0;
    if (_profile!['registrationComplete'] == true) count++;
    if (_profile!['identityVerified'] == true) count++;
    if (_profile!['financialComplete'] == true &&
        _profile!['walletVerified'] == true) {
      count++;
    }
    return count;
  }

  Widget _buildProgressCard() {
    final count = _stepsCompletedCount;
    final progress = _progressValue;
    final canApply = _profile?['canApply'] == true;

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.border.withValues(alpha: 0.6)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.03),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                canApply ? 'Profile complete' : 'Profile verification',
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: AppColors.text,
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 4,
                ),
                decoration: BoxDecoration(
                  color: canApply
                      ? AppColors.successTint
                      : AppColors.surfaceMuted,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  '$count of 3 completed',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                    color: canApply ? AppColors.primary : AppColors.textMuted,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: LinearProgressIndicator(
              value: progress,
              minHeight: 8,
              backgroundColor: AppColors.surfaceMuted,
              valueColor: AlwaysStoppedAnimation<Color>(
                canApply ? AppColors.primary : AppColors.primary,
              ),
            ),
          ),
          const SizedBox(height: 10),
          Text(
            canApply
                ? 'All verifications are completed. You can now apply for a loan.'
                : 'Complete all steps below to unlock borrowing up to your limit.',
            style: const TextStyle(
              fontSize: 12,
              color: AppColors.textMuted,
              height: 1.4,
            ),
          ),
          if (_profile?['development'] == true) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: AppColors.warning.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Row(
                children: [
                  HugeIcon(
                    icon: HugeIcons.strokeRoundedAlertCircle,
                    color: AppColors.warning,
                    size: 16,
                  ),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Development mode: checks are simulated. Use synthetic info only.',
                      style: TextStyle(color: AppColors.warning, fontSize: 11),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildSectionCard({
    required List<List<dynamic>> icon,
    required String title,
    required String subtitle,
    required bool isComplete,
    required Widget child,
  }) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: isComplete
              ? AppColors.primary.withValues(alpha: 0.3)
              : AppColors.border.withValues(alpha: 0.6),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.02),
            blurRadius: 10,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(9),
                  decoration: BoxDecoration(
                    color: isComplete
                        ? AppColors.successTint
                        : AppColors.surfaceMuted,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: HugeIcon(
                    icon: icon,
                    color: isComplete ? AppColors.primary : AppColors.textMuted,
                    size: 20,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: AppColors.text,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        subtitle,
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppColors.textMuted,
                        ),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: isComplete
                        ? AppColors.successTint
                        : AppColors.surfaceMuted,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      HugeIcon(
                        icon: isComplete
                            ? HugeIcons.strokeRoundedCheckmarkCircle02
                            : HugeIcons.strokeRoundedClock01,
                        color: isComplete
                            ? AppColors.primary
                            : AppColors.textMuted,
                        size: 14,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        isComplete ? 'Verified' : 'To do',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                          color: isComplete
                              ? AppColors.primary
                              : AppColors.textMuted,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          Padding(padding: const EdgeInsets.all(18), child: child),
        ],
      ),
    );
  }

  Widget _buildIdentityCard() {
    final details = _profile?['onboarding'] as Map<String, dynamic>? ?? {};
    final isRegDone = _profile?['registrationComplete'] == true;
    final isIdDone = _profile?['identityVerified'] == true;

    return _buildSectionCard(
      icon: HugeIcons.strokeRoundedIdVerified,
      title: 'Document & live selfie',
      subtitle: 'Document authenticity, liveness and face match',
      isComplete: isIdDone,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _infoRow(switch (details['identityType']) {
            'VOTER_ID' => 'Voter ID document',
            'DRIVING_LICENSE' => 'Driving licence document',
            'PASSPORT' => 'Passport document',
            _ => 'NIDA document',
          }, _maskNationalId(_profile?['nationalId'])),
          const SizedBox(height: 10),
          if (isIdDone) const Text('Document and live selfie verified.'),
          const SizedBox(height: 16),
          if (!isRegDone)
            OutlinedButton.icon(
              onPressed: _busy
                  ? null
                  : () async {
                      final updated = await Navigator.push<bool>(
                        context,
                        MaterialPageRoute(
                          builder: (_) =>
                              RegistrationScreen(existingProfile: _profile),
                        ),
                      );
                      if (updated == true && mounted) await _load();
                    },
              icon: const HugeIcon(
                icon: HugeIcons.strokeRoundedEdit02,
                size: 16,
              ),
              label: const Text('Complete registration'),
              style: OutlinedButton.styleFrom(
                minimumSize: const Size(double.infinity, 44),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
              ),
            ),
          if (isRegDone && !isIdDone)
            ElevatedButton.icon(
              onPressed: _busy
                  ? null
                  : () => _perform(() async {
                      await Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => const IdentityVerificationScreen(),
                        ),
                      );
                    }),
              icon: _busy
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: AppColors.onPrimary,
                      ),
                    )
                  : const HugeIcon(
                      icon: HugeIcons.strokeRoundedShieldEnergy,
                      color: AppColors.onPrimary,
                      size: 18,
                    ),
              label: Text(
                _busy ? 'Please wait…' : 'Verify document & live selfie',
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                minimumSize: const Size(double.infinity, 46),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildFinancialCard() {
    final isDone = _profile?['financialComplete'] == true;

    return _buildSectionCard(
      icon: HugeIcons.strokeRoundedBriefcase01,
      title: 'Income & Employment',
      subtitle: 'Used to determine borrowing limit',
      isComplete: isDone,
      child: Form(
        key: _form,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Employment status',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: AppColors.text,
              ),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _employmentChip('Employed', 'EMPLOYED'),
                _employmentChip('Self-employed / business', 'SELF_EMPLOYED'),
                _employmentChip('Other income source', 'OTHER'),
              ],
            ),
            const SizedBox(height: 18),
            TextFormField(
              controller: _occupation,
              enabled: !_busy,
              decoration: InputDecoration(
                labelText: 'Occupation / business / income source',
                hintText: 'e.g. Accountant, Trader, Tailor',
                filled: true,
                fillColor: AppColors.surfaceMuted,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: AppColors.border),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: AppColors.border),
                ),
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 14,
                ),
              ),
              validator: (v) => (v?.trim().length ?? 0) < 2
                  ? 'Enter your occupation or income source'
                  : null,
            ),
            const SizedBox(height: 14),
            _amountField(
              controller: _income,
              label: 'Typical monthly income',
              hint: 'Average monthly earnings',
            ),
            const SizedBox(height: 14),
            _amountField(
              controller: _expenses,
              label: 'Monthly essential expenses',
              hint: 'Rent, food, utilities, school fees',
            ),
            const SizedBox(height: 14),
            _amountField(
              controller: _debts,
              label: 'Monthly existing loan repayments',
              hint: 'Other repayments (enter 0 if none)',
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildWalletCard() {
    final isDone = _profile?['walletVerified'] == true;
    final phone = _profile?['phone'] ?? '';

    return _buildSectionCard(
      icon: HugeIcons.strokeRoundedWallet01,
      title: 'Disbursement Mobile Wallet',
      subtitle: 'Loans are sent directly to this wallet',
      isComplete: isDone,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppColors.surfaceMuted,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: AppColors.border.withValues(alpha: 0.6),
              ),
            ),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: AppColors.primary.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const HugeIcon(
                    icon: HugeIcons.strokeRoundedSmartPhone01,
                    color: AppColors.primary,
                    size: 20,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Wallet number: $phone',
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: AppColors.text,
                        ),
                      ),
                      const SizedBox(height: 2),
                      const Text(
                        'Verified mobile number for disbursements',
                        style: TextStyle(
                          fontSize: 11,
                          color: AppColors.textMuted,
                        ),
                      ),
                    ],
                  ),
                ),
                const HugeIcon(
                  icon: HugeIcons.strokeRoundedLock,
                  color: AppColors.primary,
                  size: 18,
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          const Text(
            'Select mobile-money provider',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: AppColors.text,
            ),
          ),
          const SizedBox(height: 8),
          DropdownButtonFormField<String>(
            key: ValueKey(_wallet),
            initialValue: _wallet,
            decoration: InputDecoration(
              filled: true,
              fillColor: AppColors.surfaceMuted,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: AppColors.border),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: AppColors.border),
              ),
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 14,
                vertical: 14,
              ),
            ),
            items: const [
              DropdownMenuItem(value: 'MPESA', child: Text('M-Pesa (Vodacom)')),
              DropdownMenuItem(
                value: 'TIGO_PESA',
                child: Text('Mixx by Yas / Tigo Pesa'),
              ),
              DropdownMenuItem(
                value: 'AIRTEL_MONEY',
                child: Text('Airtel Money'),
              ),
              DropdownMenuItem(value: 'HALOPESA', child: Text('HaloPesa')),
            ],
            onChanged: _busy ? null : (v) => setState(() => _wallet = v!),
          ),
          const SizedBox(height: 10),
          const Text(
            'Use a wallet registered in your legal name on this verified phone number.',
            style: TextStyle(
              fontSize: 11,
              color: AppColors.textMuted,
              height: 1.4,
            ),
          ),
        ],
      ),
    );
  }

  Widget _employmentChip(String label, String value) {
    final selected = _employment == value;
    return ChoiceChip(
      label: Text(
        label,
        style: TextStyle(
          fontSize: 12,
          fontWeight: selected ? FontWeight.bold : FontWeight.w500,
          color: selected ? AppColors.onPrimary : AppColors.text,
        ),
      ),
      selected: selected,
      selectedColor: AppColors.primary,
      backgroundColor: AppColors.surfaceMuted,
      showCheckmark: false,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      onSelected: _busy
          ? null
          : (bool isSelected) {
              if (isSelected) setState(() => _employment = value);
            },
    );
  }

  Widget _amountField({
    required TextEditingController controller,
    required String label,
    required String hint,
  }) {
    return TextFormField(
      controller: controller,
      enabled: !_busy,
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        prefixText: 'TZS ',
        prefixStyle: const TextStyle(
          fontWeight: FontWeight.bold,
          color: AppColors.text,
        ),
        filled: true,
        fillColor: AppColors.surfaceMuted,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 14,
          vertical: 14,
        ),
      ),
      validator: (v) {
        final amount = double.tryParse(v ?? '');
        return amount == null ||
                !amount.isFinite ||
                amount < 0 ||
                amount > 1000000000
            ? 'Enter an amount from 0 to 1,000,000,000'
            : null;
      },
    );
  }

  Widget _infoRow(String label, String value) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 120,
          child: Text(
            label,
            style: const TextStyle(fontSize: 12, color: AppColors.textMuted),
          ),
        ),
        Expanded(
          child: Text(
            value,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: AppColors.text,
            ),
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final canApply = _profile?['canApply'] == true;
    final isIdDone = _profile?['identityVerified'] == true;

    return Scaffold(
      appBar: AppBar(
        title: Text(
          widget.forApplication
              ? 'Before your first loan'
              : 'Complete verification',
        ),
        centerTitle: false,
      ),
      body: SafeArea(
        child: _loading
            ? const Center(
                child: CircularProgressIndicator(color: AppColors.primary),
              )
            : Column(
                children: [
                  Expanded(
                    child: RefreshIndicator(
                      onRefresh: _load,
                      color: AppColors.primary,
                      child: ListView(
                        padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
                        children: [
                          _buildProgressCard(),
                          const SizedBox(height: 16),
                          _buildIdentityCard(),
                          const SizedBox(height: 16),
                          if (isIdDone) ...[
                            _buildFinancialCard(),
                            const SizedBox(height: 16),
                            _buildWalletCard(),
                            const SizedBox(height: 16),
                          ],
                          if (_error != null)
                            Container(
                              padding: const EdgeInsets.all(12),
                              margin: const EdgeInsets.only(bottom: 16),
                              decoration: BoxDecoration(
                                color: AppColors.error.withValues(alpha: 0.1),
                                borderRadius: BorderRadius.circular(10),
                                border: Border.all(
                                  color: AppColors.error.withValues(alpha: 0.4),
                                ),
                              ),
                              child: Row(
                                children: [
                                  const HugeIcon(
                                    icon: HugeIcons.strokeRoundedAlertCircle,
                                    color: AppColors.error,
                                    size: 18,
                                  ),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: Text(
                                      _error!,
                                      style: const TextStyle(
                                        color: AppColors.error,
                                        fontSize: 12,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          if (_profile == null)
                            Center(
                              child: TextButton.icon(
                                onPressed: _load,
                                icon: const HugeIcon(
                                  icon: HugeIcons.strokeRoundedRefresh,
                                  size: 16,
                                ),
                                label: const Text('Retry'),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 20,
                      vertical: 14,
                    ),
                    decoration: BoxDecoration(
                      color: AppColors.surface,
                      border: Border(
                        top: BorderSide(
                          color: AppColors.border.withValues(alpha: 0.6),
                        ),
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.04),
                          offset: const Offset(0, -3),
                          blurRadius: 10,
                        ),
                      ],
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (isIdDone && !canApply)
                          ElevatedButton.icon(
                            onPressed: _busy ? null : _submitFinancial,
                            icon: _busy
                                ? const SizedBox(
                                    width: 16,
                                    height: 16,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      color: AppColors.onPrimary,
                                    ),
                                  )
                                : const HugeIcon(
                                    icon:
                                        HugeIcons.strokeRoundedCheckmarkBadge01,
                                    color: AppColors.onPrimary,
                                    size: 18,
                                  ),
                            label: Text(
                              _busy
                                  ? 'Saving details…'
                                  : 'Save details and verify wallet',
                            ),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppColors.primary,
                              minimumSize: const Size(double.infinity, 48),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                            ),
                          ),
                        if (canApply || !isIdDone)
                          FilledButton.icon(
                            onPressed: canApply && !_busy
                                ? () => Navigator.pop(context, true)
                                : null,
                            icon: const HugeIcon(
                              icon: HugeIcons.strokeRoundedArrowRight01,
                              color: AppColors.onPrimary,
                              size: 18,
                            ),
                            label: Text(
                              widget.forApplication
                                  ? 'Continue to loan application'
                                  : 'Done',
                              style: const TextStyle(
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            style: FilledButton.styleFrom(
                              backgroundColor: AppColors.primary,
                              minimumSize: const Size(double.infinity, 48),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
      ),
    );
  }
}
