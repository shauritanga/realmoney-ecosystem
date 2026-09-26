import '../theme/app_colors.dart';
import 'onboarding_screen.dart';
import 'package:flutter/material.dart';
import 'package:hugeicons/hugeicons.dart';
import 'package:intl/intl.dart';
import '../services/api_service.dart';
import '../services/push_service.dart';
import 'home_header.dart';
import 'loan_apply_screen.dart';
import 'account_tab.dart';
import 'notifications_screen.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  List<dynamic> _loans = [];
  int _tab = 0;
  String? _loadError;
  String? _borrowerName;
  bool _canApply = false;
  final _scrollControllers = List.generate(3, (_) => ScrollController());
  bool _isLoading = true;
  double? _currentLimit;
  final currencyFormat = NumberFormat('#,##0', 'en_US');
  final _payController = TextEditingController();

  @override
  void dispose() {
    for (final controller in _scrollControllers) { controller.dispose(); }
    _payController.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    PushService.onAuthenticated();
    _loadLoans();
    _loadProfile();
  }

  /// Best-effort fetch of the borrower's name for the home header greeting.
  /// A missing profile never blocks the loan list.
  Future<void> _loadProfile() async {
    try {
      final profile = await ApiService.request('/onboarding');
      if (!mounted) return;
      final name = profile['fullName']?.toString().trim();
      setState(() {
        _borrowerName = (name == null || name.isEmpty) ? null : name;
        _canApply = profile['canApply'] == true;
      });
    } catch (_) {}
  }

  Future<void> _loadLoans() async {
    setState(() { _isLoading = true; _loadError = null; });
    try {
      final loans = await ApiService.fetchMyLoans();
      final limit = await ApiService.fetchBorrowingLimit();
      if (!mounted) return;
      setState(() {
        _loans = loans;
        _currentLimit = (limit['amount'] as num).toDouble();
        _isLoading = false;
      });
      // Default the repayment field to the full outstanding balance.
      final active = _payableLoan;
      if (active != null && _payController.text.isEmpty) {
        final outstanding =
            double.tryParse(active['outstandingBalance'].toString()) ?? 0;
        _payController.text = outstanding.toStringAsFixed(0);
      }
      _syncDueReminders();
    } catch (e) {
      if (!mounted) return;
      setState(() { _isLoading = false; _currentLimit = null; _loadError = 'Unable to refresh your loans. Check your connection and retry.'; });
    }
  }

  /// Loans that can be repaid right now.
  dynamic get _payableLoan {
    try {
      return _loans.firstWhere(
        (l) => ['ACTIVE', 'OVERDUE', 'DEFAULTED'].contains(l['status']),
      );
    } catch (_) {
      return null;
    }
  }

  /// Keeps the on-device repayment reminders aligned with the payable loan.
  void _syncDueReminders() {
    final active = _payableLoan;
    if (active == null) {
      PushService.cancelReminders();
      return;
    }
    final due = DateTime.tryParse('${active['dueDate']}')?.toLocal();
    if (due == null) return;
    PushService.scheduleDueReminders(
      dueDate: due,
      outstanding:
          double.tryParse(active['outstandingBalance'].toString()) ?? 0,
      loanNumber: '${active['loanNumber']}',
    );
  }

  /// Loans waiting on the credit-officer pipeline.
  dynamic get _pipelineLoan {
    try {
      return _loans.firstWhere(
        (l) => l['status'] == 'PENDING' || l['status'] == 'APPROVED',
      );
    } catch (_) {
      return null;
    }
  }

  Future<void> _triggerRepayment(String loanId, double amount) async {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => const Center(
        child: CircularProgressIndicator(color: AppColors.primary),
      ),
    );

    final res =
        await ApiService.triggerSelfRepayment(loanId: loanId, amount: amount);
    if (!mounted) return;
    Navigator.pop(context); // Close loading

    final orderId = res['orderId']?.toString();
    if (orderId != null && (res['success'] == true || res['retryable'] == true)) {
      _showPinPromptDialog(orderId, amount);
    } else {
      _showResultDialog(
        success: false,
        title: 'Repayment Error',
        message: res['message']?.toString() ?? 'Could not start repayment.',
      );
    }
  }

  /// M-KOPA-style: the USSD prompt is on the borrower's phone — this dialog
  /// lets the borrower check the verified payment status after authorizing.
  void _showPinPromptDialog(String orderId, double amount) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) {
        var simulating = false;
        return StatefulBuilder(
          builder: (ctx, setDialogState) => AlertDialog(
            backgroundColor: AppColors.surface,
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            title: const Row(
              children: [
                HugeIcon(icon: HugeIcons.strokeRoundedSmartPhone01, color: AppColors.primary),
                SizedBox(width: 8),
                Text('Check your phone',
                    style: TextStyle(color: AppColors.text, fontSize: 16)),
              ],
            ),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'If a ClickPesa prompt appears on your phone, authorize it there with your mobile-money PIN. Then check the payment status below.',
                  style:
                      const TextStyle(color: AppColors.textMuted, fontSize: 13),
                ),
                const SizedBox(height: 8),
                Text('Order: $orderId',
                    style: const TextStyle(
                        color: AppColors.textMuted,
                        fontSize: 11,
                        fontFamily: 'monospace')),
              ],
            ),
            actions: [
              TextButton(
                onPressed: simulating
                    ? null
                    : () {
                        Navigator.pop(ctx);
                        _loadLoans();
                      },
                child: const Text('I’ll pay later',
                    style: TextStyle(color: AppColors.textMuted)),
              ),
              ElevatedButton(
                onPressed: simulating
                    ? null
                    : () async {
                        final dialogNavigator = Navigator.of(ctx);
                        setDialogState(() => simulating = true);
                        final sim = await ApiService.checkPaymentStatus(
                            orderId: orderId);
                        if (!mounted) return;
                        dialogNavigator.pop();
                        final ok = sim['status'] == 'COMPLETED';
                        _showResultDialog(
                          success: ok,
                          title: ok ? 'Payment received' : 'Payment status',
                          message: sim['message']?.toString() ??
                              'Repayment status updated.',
                        );
                        _payController.clear();
                        _loadLoans();
                      },
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10)),
                ),
                child: simulating
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: AppColors.onPrimary),
                      )
                    : const Text('Check payment status',
                        style: TextStyle(
                            color: AppColors.onPrimary,
                            fontWeight: FontWeight.bold,
                            fontSize: 12)),
              ),
            ],
          ),
        );
      },
    );
  }

  void _showResultDialog(
      {required bool success, required String title, required String message}) {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: AppColors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Row(
          children: [
            HugeIcon(
              icon: success
                  ? HugeIcons.strokeRoundedCheckmarkCircle01
                  : HugeIcons.strokeRoundedAlertCircle,
              color: success
                  ? AppColors.primary
                  : AppColors.error,
            ),
            const SizedBox(width: 8),
            Text(title,
                style: const TextStyle(color: AppColors.text, fontSize: 16)),
          ],
        ),
        content: Text(message,
            style: const TextStyle(color: AppColors.textMuted, fontSize: 13)),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.pop(context);
              _loadLoans();
            },
            child:
                const Text('OK', style: TextStyle(color: AppColors.primary)),
          ),
        ],
      ),
    );
  }

  /// Home-header bell: opens the notifications screen with the latest loans.
  /// The badge counts actionable items (overdue, due soon, pipeline updates).
  Widget _notificationButton() {
    final unread = unreadNotificationCount(_loans);
    return IconButton(
      tooltip: 'Notifications',
      onPressed: () => Navigator.push(
        context,
        MaterialPageRoute(
            builder: (_) => NotificationsScreen(loans: _loans)),
      ),
      icon: Stack(
        clipBehavior: Clip.none,
        children: [
          const HugeIcon(icon: HugeIcons.strokeRoundedNotification01),
          if (unread > 0)
            Positioned(
              right: -2,
              top: -2,
              child: Container(
                constraints:
                    const BoxConstraints(minWidth: 16, minHeight: 16),
                padding: const EdgeInsets.symmetric(horizontal: 4),
                decoration: const BoxDecoration(
                  color: AppColors.error,
                  borderRadius: BorderRadius.all(Radius.circular(8)),
                ),
                child: Text(
                  unread > 9 ? '9+' : '$unread',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: AppColors.onPrimary,
                    fontSize: 10,
                    fontWeight: FontWeight.bold,
                    height: 1.6,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: _tab == 0,
    onPopInvokedWithResult: (didPop, result) { if (!didPop) setState(() => _tab = 0); },
    child: Scaffold(
      appBar: AppBar(
        title: _tab == 0
            ? HomeHeaderTitle(fullName: _borrowerName)
            : Text(['RealMoney', 'My loans', 'Payments', 'Account'][_tab]),
        actions: [
          if (_tab == 0) _notificationButton(),
          if (_tab != 3)
            IconButton(
              tooltip: 'Refresh',
              onPressed: _isLoading
                  ? null
                  : () {
                      _loadLoans();
                      _loadProfile();
                    },
              icon: const HugeIcon(icon: HugeIcons.strokeRoundedRefresh),
            ),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (index) { FocusScope.of(context).unfocus(); setState(() => _tab = index); },
        backgroundColor: AppColors.surface,
        indicatorColor: AppColors.successTint,
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        destinations: const [
          NavigationDestination(icon: HugeIcon(icon: HugeIcons.strokeRoundedHome01), selectedIcon: HugeIcon(icon: HugeIcons.strokeRoundedHome01), label: 'Home'),
          NavigationDestination(icon: HugeIcon(icon: HugeIcons.strokeRoundedFile02), selectedIcon: HugeIcon(icon: HugeIcons.strokeRoundedFile02), label: 'My loans'),
          NavigationDestination(icon: HugeIcon(icon: HugeIcons.strokeRoundedWallet01), selectedIcon: HugeIcon(icon: HugeIcons.strokeRoundedWallet01), label: 'Payments'),
          NavigationDestination(icon: HugeIcon(icon: HugeIcons.strokeRoundedUser), selectedIcon: HugeIcon(icon: HugeIcons.strokeRoundedUser), label: 'Account'),
        ],
      ),
      body: SafeArea(top: false, child: IndexedStack(index: _tab, children: [
        _page(0, [
          _heading('Your money, at a glance'),
          if (_payableLoan != null) _buildActiveLoanCard(_payableLoan)
          else if (_pipelineLoan != null) _buildPipelineCard(_pipelineLoan)
          else _buildNoLoanBanner(),
          const SizedBox(height: 20),
          _buildLimitLadder(),
          const SizedBox(height: 24),
          _buildRecentLoans(),
        ]),
        _page(1, [
          _heading('Your loans'),
          const Text('Track applications and review your borrowing history.', style: TextStyle(color: AppColors.textMuted)),
          const SizedBox(height: 20),
          if (_loans.isEmpty) _empty(HugeIcons.strokeRoundedFile02, 'No loans yet', 'Your applications and loans will appear here.')
          else ..._loans.map((loan) => Padding(padding: const EdgeInsets.only(bottom: 12), child: Material(
            color: AppColors.surface, borderRadius: BorderRadius.circular(14),
            child: InkWell(borderRadius: BorderRadius.circular(14), onTap: () => _showLoan(loan), child: _buildHistoryItem(loan)),
          ))),
          if (_loans.isEmpty) TextButton(onPressed: () => setState(() => _tab = 0), child: const Text('Explore borrowing on Home')),
        ]),
        _page(2, [
          _heading('Make a payment'),
          if (_payableLoan != null) _buildActiveLoanCard(_payableLoan, showRepayment: true)
          else _empty(HugeIcons.strokeRoundedCheckmarkCircle02, 'Nothing to repay', 'Repayment becomes available after a loan is disbursed.'),
          const SizedBox(height: 28),
          _heading('Payment history'),
          if (_payments.isEmpty) _empty(HugeIcons.strokeRoundedInvoice01, 'No payments yet', 'Payment attempts and confirmed receipts will appear here.')
          else ..._payments.map((payment) => Card(elevation: 0, color: AppColors.surface, child: ListTile(
            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            leading: HugeIcon(icon: payment['status'] == 'COMPLETED' ? HugeIcons.strokeRoundedCheckmarkCircle02 : HugeIcons.strokeRoundedClock01, color: AppColors.primary),
            title: Text(_money(payment['amount'])),
            subtitle: Text('${payment['loanNumber']} · ${_date(payment['paidAt'] ?? payment['createdAt'])}\n${_status(payment['status'])}'),
            isThreeLine: true,
            trailing: const HugeIcon(icon: HugeIcons.strokeRoundedArrowRight01, size: 18),
            onTap: () => _showPayment(payment),
          ))),
        ]),
        AccountTab(onUpdated: _loadLoans),
      ])),
    ),
  );

  Widget _page(int index, List<Widget> children) {
    return RefreshIndicator(onRefresh: _loadLoans, child: ListView(
      key: PageStorageKey('borrower-tab-$index'), controller: _scrollControllers[index],
      physics: const AlwaysScrollableScrollPhysics(), padding: const EdgeInsets.all(20),
      children: [
        if (_isLoading) const Padding(padding: EdgeInsets.only(bottom: 20), child: LinearProgressIndicator()),
        if (_loadError != null) ...[
          Text(_loadError!, style: const TextStyle(color: AppColors.error)),
          TextButton(onPressed: _loadLoans, child: const Text('Retry')),
        ],
        if (!_isLoading && _loadError == null || _loans.isNotEmpty) ...children,
      ],
    ));
  }

  Widget _heading(String title) => Padding(padding: const EdgeInsets.only(bottom: 16), child: Text(title, style: const TextStyle(fontSize: 23, fontWeight: FontWeight.w700)));
  Widget _empty(List<List<dynamic>> icon, String title, String message) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 24), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      HugeIcon(icon: icon, size: 32, color: AppColors.primary), const SizedBox(height: 12),
      Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
      const SizedBox(height: 8), Text(message, style: const TextStyle(color: AppColors.textMuted, height: 1.5)),
    ]),
  );
  String _money(dynamic value) => 'TZS ${currencyFormat.format(num.tryParse('$value') ?? 0)}';
  String _date(dynamic value) { final date = DateTime.tryParse('$value'); return date == null ? 'Not available' : DateFormat('d MMM yyyy').format(date.toLocal()); }
  String _status(dynamic value) => (value ?? 'Unknown').toString().toLowerCase().replaceAll('_', ' ');
  List<Map<String, dynamic>> get _payments {
    final payments = <Map<String, dynamic>>[
      for (final loan in _loans)
        for (final payment in (loan['repayments'] as List? ?? []))
          {...Map<String, dynamic>.from(payment), 'loanNumber': loan['loanNumber']},
    ];
    payments.sort((a, b) => (b['createdAt'] ?? '').toString().compareTo((a['createdAt'] ?? '').toString()));
    return payments;
  }
  Widget _detail(String label, String value) => Padding(padding: const EdgeInsets.symmetric(vertical: 10), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
    Text(label, style: const TextStyle(color: AppColors.textMuted)), const SizedBox(height: 4), SelectableText(value, style: const TextStyle(fontWeight: FontWeight.w600)),
  ]));
  void _sheet(String title, List<Widget> children) => showModalBottomSheet<void>(context: context, showDragHandle: true, isScrollControlled: true, useSafeArea: true,
    builder: (context) => FractionallySizedBox(heightFactor: 0.85, child: ListView(padding: const EdgeInsets.fromLTRB(24, 8, 24, 32), children: [_heading(title), ...children])));
  void _showLoan(dynamic loan) => _sheet('Loan ${loan['loanNumber']}', [
    _detail('Status', _status(loan['status'])),
    _detail('Product', loan['product']?['name']?.toString() ?? 'Loan'),
    _detail('Principal', _money(loan['principalAmount'])),
    _detail('Total repayment', _money(loan['totalAmount'])),
    // Shown only when there is one, but shown plainly when there is: a balance that
    // grew without a payment is the thing a borrower most needs explained.
    if ((double.tryParse(loan['penaltyAmount']?.toString() ?? '0') ?? 0) > 0)
      _detail('Late penalty', _money(loan['penaltyAmount'])),
    _detail('Paid', _money(loan['totalPaid'])),
    _detail('Outstanding balance', _money(loan['outstandingBalance'])),
    _detail('Due date', _date(loan['dueDate'])),
    if (loan['originalDueDate'] != null && loan['originalDueDate'] != loan['dueDate'])
      _detail('Originally due', _date(loan['originalDueDate'])),
    if (['ACTIVE', 'OVERDUE', 'DEFAULTED'].contains(loan['status'])) FilledButton(onPressed: () { Navigator.pop(context); setState(() => _tab = 2); }, child: const Text('Go to payments')),
  ]);
  void _showPayment(Map<String, dynamic> payment) => _sheet(payment['status'] == 'COMPLETED' ? 'Payment receipt' : 'Payment details', [
    _detail('Amount', _money(payment['amount'])), _detail('Status', _status(payment['status'])),
    _detail('Loan', '${payment['loanNumber']}'),
    _detail(payment['status'] == 'COMPLETED' ? 'Paid on' : 'Requested on', _date(payment['paidAt'] ?? payment['createdAt'])),
    _detail('Payment method', _status(payment['channel'])),
    _detail('Transaction reference', '${payment['providerTransId'] ?? payment['providerReference'] ?? payment['id']}'),
    if (payment['status'] != 'COMPLETED') const Text('This is not a receipt. The payment has not been confirmed.', style: TextStyle(color: AppColors.warning)),
  ]);

  Widget _buildActiveLoanCard(dynamic loan, {bool showRepayment = false}) {
    final status = loan['status'];
    final outstanding = double.tryParse(loan['outstandingBalance'].toString()) ?? 0;
    final contracted = double.tryParse(loan['totalAmount'].toString()) ?? 0;
    final penalty = double.tryParse(loan['penaltyAmount']?.toString() ?? '0') ?? 0;
    // Late penalties are owed on top of the contracted amount, so they belong in the
    // denominator. Without them the bar reaches 100% while money is still due.
    final total = contracted + penalty;
    final paid = double.tryParse(loan['totalPaid'].toString()) ?? 0;
    final progress = total > 0 ? (paid / total).clamp(0.0, 1.0) : 0.0;
    final isOverdue = status == 'OVERDUE' || status == 'DEFAULTED';
    // An extension moved the due date. Saying so stops it reading as an error.
    final extended = loan['originalDueDate'] != null &&
        loan['originalDueDate'] != loan['dueDate'];

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: isOverdue
              ? [AppColors.errorTint, AppColors.surface]
              : [AppColors.successTint, AppColors.surface],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: isOverdue ? AppColors.error : AppColors.primary.withValues(alpha: 0.5),
        ),
        boxShadow: [
          BoxShadow(
            color: isOverdue
                ? AppColors.error.withValues(alpha: 0.15)
                : AppColors.primary.withValues(alpha: 0.15),
            blurRadius: 20,
            offset: const Offset(0, 8),
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
                'Loan #${loan['loanNumber']}',
                style: const TextStyle(color: AppColors.textMuted, fontSize: 13, fontFamily: 'monospace'),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: isOverdue ? AppColors.error : AppColors.primary,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  status,
                  style: const TextStyle(color: AppColors.onPrimary, fontWeight: FontWeight.bold, fontSize: 11),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          const Text(
            'Outstanding Balance',
            style: TextStyle(color: AppColors.textMuted, fontSize: 12),
          ),
          const SizedBox(height: 4),
          Text(
            'TZS ${currencyFormat.format(outstanding)}',
            style: const TextStyle(
              color: AppColors.text,
              fontSize: 30,
              fontWeight: FontWeight.bold,
              letterSpacing: -0.5,
            ),
          ),
          const SizedBox(height: 12),
          // M-KOPA-style repayment progress
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: LinearProgressIndicator(
              value: progress,
              minHeight: 8,
              backgroundColor: AppColors.surfaceMuted,
              valueColor: const AlwaysStoppedAnimation(AppColors.primary),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'Paid TZS ${currencyFormat.format(paid)} of TZS ${currencyFormat.format(total)} • ${(progress * 100).toStringAsFixed(0)}%',
            style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
          ),
          if (penalty > 0) ...[
            const SizedBox(height: 4),
            Text(
              'Includes TZS ${currencyFormat.format(penalty)} in late penalties.',
              style: const TextStyle(color: AppColors.warning, fontSize: 12),
            ),
          ],
          if (extended) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                color: AppColors.warningTint,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                'Due date extended to '
                '${loan['dueDate'].toString().substring(0, 10)}. '
                'The amount you owe has not changed.',
                style: const TextStyle(color: AppColors.warning, fontSize: 12),
              ),
            ),
          ],
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Total Loan: TZS ${currencyFormat.format(total)}',
                style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
              ),
              Text(
                'Due: ${loan['dueDate'] != null ? loan['dueDate'].toString().substring(0, 10) : 'N/A'}',
                style: TextStyle(
                  color: isOverdue ? AppColors.error : AppColors.primary,
                  fontSize: 12,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          if (!showRepayment) FilledButton.icon(onPressed: () => setState(() => _tab = 2), icon: const HugeIcon(icon: HugeIcons.strokeRoundedWallet01), label: const Text('Make a payment')),
          if (showRepayment) ...[
          // Repayment controls live in the Payments tab.
          const Text('REPAY AMOUNT (TZS)',
              style: TextStyle(
                  color: AppColors.textMuted,
                  fontSize: 11,
                  fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Row(
            children: [
              _payChip('25%', outstanding * 0.25),
              const SizedBox(width: 8),
              _payChip('50%', outstanding * 0.5),
              const SizedBox(width: 8),
              _payChip('Full', outstanding),
            ],
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _payController,
            keyboardType: TextInputType.number,
            style: const TextStyle(color: AppColors.text, fontSize: 16, fontWeight: FontWeight.bold),
            decoration: InputDecoration(
              prefixText: 'TZS ',
              prefixStyle: const TextStyle(color: AppColors.textMuted, fontSize: 14),
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
              contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            ),
          ),
          const SizedBox(height: 12),
          ElevatedButton(
            onPressed: () {
              final amount = double.tryParse(_payController.text.trim()) ?? 0;
              if (amount <= 0 || amount > outstanding) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(
                        'Enter an amount between 1 and TZS ${currencyFormat.format(outstanding)}.'),
                    backgroundColor: AppColors.error,
                  ),
                );
                return;
              }
              _triggerRepayment(loan['id'], amount);
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primary,
              minimumSize: const Size(double.infinity, 48),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            child: const Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                HugeIcon(icon: HugeIcons.strokeRoundedZap, color: AppColors.onPrimary, size: 20),
                SizedBox(width: 8),
                Text(
                  'Repay via ClickPesa USSD',
                  style: TextStyle(color: AppColors.onPrimary, fontWeight: FontWeight.bold, fontSize: 14),
                ),
              ],
            ),
          ),
          ],
        ],
      ),
    );
  }

  Widget _payChip(String label, double amount) {
    return Expanded(
      child: OutlinedButton(
        onPressed: () =>
            setState(() => _payController.text = amount.toStringAsFixed(0)),
        style: OutlinedButton.styleFrom(
          backgroundColor: AppColors.surfaceMuted,
          side: const BorderSide(color: AppColors.border),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          padding: const EdgeInsets.symmetric(vertical: 10),
        ),
        child: Text(label,
            style: const TextStyle(color: AppColors.text, fontSize: 12, fontWeight: FontWeight.bold)),
      ),
    );
  }

  /// Tala-style pipeline explainer: PENDING/APPROVED is not yet payable.
  Widget _buildPipelineCard(dynamic loan) {
    final isApproved = loan['status'] == 'APPROVED';
    final accentColor = isApproved ? AppColors.primary : AppColors.warning;
    final statusIcon = isApproved
        ? HugeIcons.strokeRoundedCheckmarkBadge01
        : HugeIcons.strokeRoundedHourglass;
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: accentColor.withValues(alpha: 0.5)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              HugeIcon(icon: statusIcon, color: accentColor, size: 22),
              const SizedBox(width: 8),
              Text(
                isApproved ? 'Loan approved — payout soon' : 'Application under review',
                style: const TextStyle(color: AppColors.text, fontSize: 15, fontWeight: FontWeight.bold),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            isApproved
                ? 'Your loan #${loan['loanNumber']} was approved. Funds are being disbursed to your mobile wallet via ClickPesa — usually within minutes.'
                : 'Your loan #${loan['loanNumber']} is with a credit officer. You’ll be notified once it’s approved — no action needed.',
            style: const TextStyle(color: AppColors.textMuted, fontSize: 13),
          ),
          const SizedBox(height: 12),
          _pipelineStep('Applied', true),
          _pipelineStep(isApproved ? 'Approved' : 'Credit review', isApproved),
          _pipelineStep('Disbursed to wallet', false),
        ],
      ),
    );
  }

  Widget _pipelineStep(String label, bool done) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          HugeIcon(icon: done ? HugeIcons.strokeRoundedCheckmarkCircle01 : HugeIcons.strokeRoundedCircle,
              color: done ? AppColors.primary : AppColors.textMuted, size: 16),
          const SizedBox(width: 8),
          Text(label, style: const TextStyle(color: AppColors.textMuted, fontSize: 12)),
        ],
      ),
    );
  }

  Widget _buildLimitLadder() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('YOUR BORROWING LIMIT'),
          const SizedBox(height: 8),
          Text(
            _currentLimit == null ? 'Limit unavailable — refresh to retry' : 'TZS ${currencyFormat.format(_currentLimit)}',
            style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          const Text(
            'Repay in full by your due time to qualify for 25% more than that loan’s principal. Paying late, or extending your due date, keeps the same limit. Product maximums apply.',
            style: TextStyle(color: AppColors.textMuted, fontSize: 12),
          ),
        ],
      ),
    );
  }

  Widget _buildNoLoanBanner() {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              HugeIcon(icon: HugeIcons.strokeRoundedCheckmarkBadge01, color: AppColors.primary, size: 24),
              SizedBox(width: 8),
              Text(
                'Ready for your next step?',
                style: TextStyle(color: AppColors.text, fontSize: 16, fontWeight: FontWeight.bold),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            'Choose an available loan product within your borrowing limit. Applications are subject to approval.',
            style: const TextStyle(color: AppColors.textMuted, fontSize: 13),
          ),
          const SizedBox(height: 20),
          ElevatedButton(
            onPressed: _currentLimit == null ? null : () async {
              if (!_canApply) {
                try {
                  final profile = await ApiService.request('/onboarding');
                  _canApply = profile['canApply'] == true;
                } catch (_) {}
              }
              if (!_canApply) {
                if (!mounted) return;
                final ready = await Navigator.push<bool>(
                  context,
                  MaterialPageRoute(builder: (_) => const OnboardingScreen()),
                );
                if (!mounted || ready != true) return;
                _canApply = true;
              }
              if (!mounted || !context.mounted) return;
              final res = await Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const LoanApplyScreen()),
              );
              if (res == true) {
                _payController.clear();
                _loadLoans();
                _loadProfile();
              }
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primary,
              minimumSize: const Size(double.infinity, 48),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            child: const Text(
              'Apply for a loan',
              style: TextStyle(color: AppColors.onPrimary, fontWeight: FontWeight.bold, fontSize: 14),
            ),
          ),
        ],
      ),
    );
  }

  /// Home-tab section: the three latest loans with a "View all" shortcut
  /// to the full history on the My loans tab.
  Widget _buildRecentLoans() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            const Text('Recent loans',
                style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
            if (_loans.isNotEmpty)
              TextButton(
                onPressed: () => setState(() => _tab = 1),
                style: TextButton.styleFrom(
                  visualDensity: VisualDensity.compact,
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                ),
                child: const Text('View all'),
              ),
          ],
        ),
        const SizedBox(height: 12),
        if (_loans.isEmpty)
          _buildEmptyLoansCard()
        else
          ..._loans.take(3).map((loan) => Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Material(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(14),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(14),
                    onTap: () => _showLoan(loan),
                    child: _buildHistoryItem(loan),
                  ),
                ),
              )),
      ],
    );
  }

  Widget _buildEmptyLoansCard() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 28, horizontal: 20),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.border.withValues(alpha: 0.6)),
      ),
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppColors.primary.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(16),
            ),
            child: const HugeIcon(
              icon: HugeIcons.strokeRoundedFile02,
              color: AppColors.primary,
              size: 28,
            ),
          ),
          const SizedBox(height: 12),
          const Text('No loans yet',
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          const Text(
            'Your applications and loan history will appear here.',
            textAlign: TextAlign.center,
            style: TextStyle(color: AppColors.textMuted, fontSize: 13),
          ),
        ],
      ),
    );
  }

  Widget _buildHistoryItem(dynamic loan) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Expanded(child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                loan['loanNumber'],
                style: const TextStyle(color: AppColors.text, fontWeight: FontWeight.bold, fontSize: 14),
              ),
              const SizedBox(height: 4),
              Text(
                'Principal: TZS ${currencyFormat.format(double.tryParse(loan['principalAmount'].toString()) ?? 0)}',
                style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
              ),
            ],
          )),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: AppColors.surfaceMuted,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              loan['status'],
              style: const TextStyle(color: AppColors.primary, fontSize: 11, fontWeight: FontWeight.bold),
            ),
          ),
        ],
      ),
    );
  }
}
