import 'package:flutter/material.dart';
import 'package:hugeicons/hugeicons.dart';
import 'package:intl/intl.dart';

import '../theme/app_colors.dart';

/// A single loan-activity notification shown on the notifications screen.
///
/// The borrower backend exposes device-token registration for push delivery
/// but no notification-inbox endpoint, so the inbox is derived locally from
/// the borrower's loans and repayments. It stays useful even when push is
/// unavailable.
class BorrowerNotification {
  const BorrowerNotification({
    required this.icon,
    required this.color,
    required this.title,
    required this.body,
    required this.detail,
    required this.isActionable,
  });

  final List<List<dynamic>> icon;
  final Color color;
  final String title;
  final String body;
  final String detail;
  final bool isActionable;
}

final _moneyFormat = NumberFormat('#,##0', 'en_US');

String _money(dynamic value) =>
    'TZS ${_moneyFormat.format(num.tryParse('$value') ?? 0)}';

String _date(dynamic value) {
  final date = DateTime.tryParse('$value');
  return date == null
      ? 'Date not available'
      : DateFormat('d MMM yyyy').format(date.toLocal());
}

/// Builds inbox items from the borrower's loans, actionable items first.
List<BorrowerNotification> buildNotificationItems(
  List<dynamic> loans, {
  DateTime? now,
}) {
  final current = now ?? DateTime.now();
  final actionable = <BorrowerNotification>[];
  final informational = <BorrowerNotification>[];

  for (final loan in loans) {
    if (loan is! Map) continue;
    final status = '${loan['status']}';
    final loanNumber = '${loan['loanNumber']}';
    final outstanding =
        double.tryParse('${loan['outstandingBalance']}') ?? 0;

    switch (status) {
      case 'OVERDUE':
      case 'DEFAULTED':
        actionable.add(BorrowerNotification(
          icon: HugeIcons.strokeRoundedAlertCircle,
          color: AppColors.error,
          title: 'Repayment overdue',
          body:
              'Loan $loanNumber has ${_money(outstanding)} outstanding. Repay now to avoid further penalties.',
          detail: 'Due ${_date(loan['dueDate'])}',
          isActionable: true,
        ));
      case 'ACTIVE':
        final due = DateTime.tryParse('${loan['dueDate']}');
        if (due != null && due.isBefore(current)) {
          actionable.add(BorrowerNotification(
            icon: HugeIcons.strokeRoundedAlertCircle,
            color: AppColors.error,
            title: 'Repayment due',
            body:
                'Loan $loanNumber has ${_money(outstanding)} outstanding. Its due date has passed.',
            detail: 'Due ${_date(loan['dueDate'])}',
            isActionable: true,
          ));
        } else if (due != null &&
            due.difference(current) <= const Duration(days: 2)) {
          actionable.add(BorrowerNotification(
            icon: HugeIcons.strokeRoundedClock01,
            color: AppColors.warning,
            title: 'Repayment due soon',
            body:
                'Loan $loanNumber is due on ${_date(loan['dueDate'])} with ${_money(outstanding)} outstanding.',
            detail: 'Loan $loanNumber',
            isActionable: true,
          ));
        } else {
          informational.add(BorrowerNotification(
            icon: HugeIcons.strokeRoundedWallet01,
            color: AppColors.primary,
            title: 'Repayment reminder',
            body:
                'Loan $loanNumber has ${_money(outstanding)} outstanding.',
            detail: 'Due ${_date(loan['dueDate'])}',
            isActionable: false,
          ));
        }
      case 'APPROVED':
        actionable.add(BorrowerNotification(
          icon: HugeIcons.strokeRoundedCheckmarkCircle01,
          color: AppColors.primary,
          title: 'Loan approved',
          body:
              'Loan $loanNumber was approved. Funds are on the way to your mobile wallet.',
          detail: 'Loan $loanNumber',
          isActionable: true,
        ));
      case 'PENDING':
        actionable.add(BorrowerNotification(
          icon: HugeIcons.strokeRoundedHourglass,
          color: AppColors.warning,
          title: 'Application under review',
          body:
              'Loan $loanNumber is with a credit officer. No action is needed right now.',
          detail: 'Loan $loanNumber',
          isActionable: true,
        ));
      case 'REJECTED':
        informational.add(BorrowerNotification(
          icon: HugeIcons.strokeRoundedInformationCircle,
          color: AppColors.textMuted,
          title: 'Application update',
          body:
              'Loan $loanNumber was not approved. Open My loans for details.',
          detail: 'Loan $loanNumber',
          isActionable: false,
        ));
    }
  }

  final receipts = <Map<String, dynamic>>[
    for (final loan in loans)
      if (loan is Map)
        for (final payment in (loan['repayments'] as List? ?? []))
          if (payment is Map && '${payment['status']}' == 'COMPLETED')
            {
              ...Map<String, dynamic>.from(payment),
              'loanNumber': loan['loanNumber'],
            },
  ]..sort((a, b) => (b['paidAt'] ?? b['createdAt'] ?? '')
      .toString()
      .compareTo(
          (a['paidAt'] ?? a['createdAt'] ?? '').toString()));
  for (final payment in receipts.take(20)) {
    informational.add(BorrowerNotification(
      icon: HugeIcons.strokeRoundedInvoice01,
      color: AppColors.primary,
      title: 'Payment received',
      body:
          '${_money(payment['amount'])} was credited to loan ${payment['loanNumber']}.',
      detail: _date(payment['paidAt'] ?? payment['createdAt']),
      isActionable: false,
    ));
  }

  return [...actionable, ...informational];
}

/// Number of items that deserve the header badge.
int unreadNotificationCount(List<dynamic> loans, {DateTime? now}) =>
    buildNotificationItems(loans, now: now)
        .where((item) => item.isActionable)
        .length;

class NotificationsScreen extends StatelessWidget {
  final List<dynamic> loans;

  const NotificationsScreen({super.key, required this.loans});

  @override
  Widget build(BuildContext context) {
    final items = buildNotificationItems(loans);
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          tooltip: 'Back',
          onPressed: () => Navigator.pop(context),
          icon: const HugeIcon(
              icon: HugeIcons.strokeRoundedArrowLeft01),
        ),
        title: const Text('Notifications'),
      ),
      body: items.isEmpty
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: const [
                    HugeIcon(
                      icon: HugeIcons.strokeRoundedNotification01,
                      size: 48,
                      color: AppColors.textMuted,
                    ),
                    SizedBox(height: 16),
                    Text(
                      "You're all caught up",
                      style: TextStyle(
                          fontSize: 18, fontWeight: FontWeight.w600),
                    ),
                    SizedBox(height: 8),
                    Text(
                      'Loan approvals, payouts and repayment reminders will appear here.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: AppColors.textMuted),
                    ),
                  ],
                ),
              ),
            )
          : ListView.separated(
              padding: const EdgeInsets.all(20),
              itemCount: items.length,
              separatorBuilder: (_, _) => const SizedBox(height: 12),
              itemBuilder: (context, index) {
                final item = items[index];
                return Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: AppColors.surface,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: AppColors.border),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: item.color.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: HugeIcon(
                          icon: item.icon,
                          color: item.color,
                          size: 22,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              item.title,
                              style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 14),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              item.body,
                              style: const TextStyle(
                                  color: AppColors.textMuted,
                                  fontSize: 13,
                                  height: 1.4),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              item.detail,
                              style: const TextStyle(
                                  color: AppColors.textMuted,
                                  fontSize: 11),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
    );
  }
}
