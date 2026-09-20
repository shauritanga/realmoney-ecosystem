import '../models/loan_assignment.dart';

/// Daily collection levels — mirrors the backend (collection-level.ts).
/// One collector works ONE level per day; levels are never mixed.
const levelOrder = ['M2', 'M1', 'ZERO', 'T1', 'T2', 'T3'];

const levelLabels = {
  'M2': 'T-2',
  'M1': 'T-1',
  'ZERO': 'T0',
  'T1': 'T1',
  'T2': 'T2',
  'T3': 'T3',
};

const levelDescriptions = {
  'M2': 'Due in 2 days — friendly early reminders.',
  'M1': 'Due tomorrow — remind + offer USSD push.',
  'ZERO': 'Due TODAY — collect a promise, push USSD.',
  'T1': '1 day overdue — firm follow-up.',
  'T2': '2 days overdue — escalate tone, push USSD.',
  'T3': '3+ days overdue — intensive recovery.',
};

bool isPreDue(String level) =>
    level == 'M2' || level == 'M1' || level == 'ZERO';

String levelStatusText(LoanAssignment item) {
  if (item.level == 'ZERO') return 'due today';
  if (isPreDue(item.level)) return 'due in ${item.daysToDue}d';
  return '${item.daysOverdue}d overdue';
}

/// Worked = the collector logged any touch on this case today.
bool workedToday(LoanAssignment item) {
  final now = DateTime.now();
  return item.recentInteractions.any((log) {
    final created =
        DateTime.tryParse(log['createdAt']?.toString() ?? '');
    return created != null &&
        created.year == now.year &&
        created.month == now.month &&
        created.day == now.day;
  });
}

/// Broken promise: a still-pending PTP whose date already passed.
bool ptpBroken(LoanAssignment item) {
  final ptp = item.activePtp;
  if (ptp == null) return false;
  final promised =
      DateTime.tryParse(ptp['promisedDate']?.toString() ?? '');
  return promised != null &&
      promised.isBefore(DateTime.now().subtract(const Duration(hours: 1)));
}
