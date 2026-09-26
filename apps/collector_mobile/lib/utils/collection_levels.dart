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
  // 'S' for the intensive-recovery tier, matching the backend's LEVEL_LABEL.
  // This said 'T3' before, so the app and the dashboard named the same tier
  // differently.
  'T3': 'S',
};

const levelDescriptions = {
  'M2': 'Due in 2 days — friendly early reminders.',
  'M1': 'Due tomorrow — remind, and offer to take payment now.',
  'ZERO': 'Due TODAY — take payment, or get a promise.',
  'T1': '1 day overdue — firm follow-up.',
  'T2': '2 days overdue — escalate, and push for payment today.',
  'T3': '3+ days overdue — intensive recovery.',
};

bool isPreDue(String level) =>
    level == 'M2' || level == 'M1' || level == 'ZERO';

String levelStatusText(LoanAssignment item) {
  if (item.level == 'ZERO') return 'due today';
  if (isPreDue(item.level)) return 'due in ${item.daysToDue}d';
  return '${item.daysOverdue}d overdue';
}

/// Whether this case has been worked today.
///
/// Read straight from the server now. It used to be inferred from a three-item
/// preview of recent interactions, so a case touched four or more times in one day
/// dropped out of that window and looked untouched.
bool workedToday(LoanAssignment item) => item.workedToday;

/// A promise the borrower has already missed.
///
/// Also server-derived: the grace period and the comparison now live in one place
/// (`ptp-status.ts`) instead of the app applying its own one-hour rule.
bool ptpBroken(LoanAssignment item) => item.ptpOverdue;
