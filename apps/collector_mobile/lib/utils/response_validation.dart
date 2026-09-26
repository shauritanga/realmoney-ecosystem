/// Validators for the response sheet.
///
/// Pure functions returning a message or null, so they can be unit-tested without a
/// widget and reused by the form's `validator` callbacks. The old dialog had no
/// validation at all: a `double.tryParse` failure silently dropped the promise while
/// still reporting success to the collector.
library;

const minPtpAmount = 500;
const maxPtpDays = 30;
const maxCallbackDays = 14;

/// Mirrors the server's rule, so a collector learns about a problem before the
/// round trip rather than after it.
String? validatePtpAmount(String? raw, {required double outstandingBalance}) {
  final text = (raw ?? '').replaceAll(',', '').trim();
  if (text.isEmpty) return 'Enter the amount promised.';
  final amount = double.tryParse(text);
  if (amount == null) return 'Enter a number.';
  if (amount <= 0) return 'Amount must be more than zero.';
  if (amount < minPtpAmount) return 'Minimum promise is TZS $minPtpAmount.';
  if (amount > outstandingBalance) {
    return 'Cannot promise more than the outstanding balance.';
  }
  return null;
}

String? validatePtpDate(DateTime? date, {DateTime? now}) {
  if (date == null) return 'Pick the date they promised to pay.';
  final today = _startOfDay(now ?? DateTime.now());
  final picked = _startOfDay(date);
  if (picked.isBefore(today)) return 'Date cannot be in the past.';
  if (picked.difference(today).inDays > maxPtpDays) {
    return 'Date cannot be more than $maxPtpDays days away.';
  }
  return null;
}

String? validateCallback(DateTime? at, {DateTime? now}) {
  if (at == null) return 'Pick when to call back.';
  final current = now ?? DateTime.now();
  if (!at.isAfter(current)) return 'Callback must be in the future.';
  if (at.difference(current).inDays > maxCallbackDays) {
    return 'Callback cannot be more than $maxCallbackDays days away.';
  }
  return null;
}

/// A claim the system cannot verify has to carry an explanation.
String? validateNotes(String? raw, {required String disposition}) {
  final text = (raw ?? '').trim();
  if (disposition == 'PAID' && text.isEmpty) {
    return 'Explain how and when they paid.';
  }
  if (text.length > 500) return 'Keep the note under 500 characters.';
  return null;
}

String? validateManualDuration(String? raw) {
  final text = (raw ?? '').trim();
  if (text.isEmpty) return null;
  final seconds = int.tryParse(text);
  if (seconds == null) return 'Enter the number of seconds.';
  if (seconds < 0) return 'Duration cannot be negative.';
  if (seconds > 14400) return 'That is longer than four hours.';
  return null;
}

DateTime _startOfDay(DateTime d) => DateTime(d.year, d.month, d.day);
