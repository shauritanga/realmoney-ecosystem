/// Matching a dialled number against device call-log entries, and reading a
/// duration out of them.
///
/// Deliberately free of plugin imports so it can be unit-tested without a device:
/// `CallRecord` is a plain value object that `CallLogService` maps the plugin's
/// entries into.
library;

/// A call-log entry, reduced to what we need.
class CallRecord {
  /// The number as the dialer recorded it — formatting varies by handset.
  final String number;

  /// Plugin call type, e.g. 'outgoing', 'missed', 'rejected'.
  final String type;
  final int durationSeconds;
  final DateTime startedAt;

  const CallRecord({
    required this.number,
    required this.type,
    required this.durationSeconds,
    required this.startedAt,
  });
}

/// What we learned about a call after the collector returned to the app.
class CallEvidence {
  final int durationSeconds;
  final String callOutcome;

  /// 'CALL_LOG' when read from the device, 'NONE' when nothing was found.
  final String durationSource;

  const CallEvidence({
    required this.durationSeconds,
    required this.callOutcome,
    required this.durationSource,
  });

  static const none = CallEvidence(
    durationSeconds: 0,
    callOutcome: 'UNKNOWN',
    durationSource: 'NONE',
  );

  bool get isVerified => durationSource == 'CALL_LOG';
}

/// Strips formatting and normalises a Tanzanian number to `255XXXXXXXXX`.
///
/// Borrower records store `+255…`, a collector may dial `0712…`, and the call log
/// keeps whatever the dialer was handed — so neither side can be compared raw.
String normalizeTz(String raw) {
  var digits = raw.replaceAll(RegExp(r'[^0-9]'), '');
  if (digits.startsWith('00')) digits = digits.substring(2);
  if (digits.startsWith('0') && digits.length == 10) {
    digits = '255${digits.substring(1)}';
  }
  return digits;
}

/// Whether two numbers refer to the same subscriber.
///
/// Compares the last nine digits — the national significant number — which makes
/// `+255712345678`, `0712345678` and `255 712 345 678` all match, without the false
/// positives a shorter suffix would produce.
bool phoneMatches(String a, String b) {
  final left = normalizeTz(a);
  final right = normalizeTz(b);
  if (left.length < 9 || right.length < 9) return false;
  return left.substring(left.length - 9) == right.substring(right.length - 9);
}

/// Maps a plugin call type to our `CallOutcome` vocabulary.
///
/// An outgoing call of zero seconds never connected, which is the distinction the
/// contact rate depends on.
String mapCallType(String rawType, int durationSeconds) {
  switch (rawType.toLowerCase()) {
    case 'outgoing':
      return durationSeconds > 0 ? 'ANSWERED' : 'NO_ANSWER';
    case 'incoming':
      return durationSeconds > 0 ? 'ANSWERED' : 'MISSED';
    case 'answeredexternally':
      return 'ANSWERED';
    case 'missed':
      return 'MISSED';
    case 'rejected':
      return 'DECLINED';
    case 'blocked':
      return 'DECLINED';
    default:
      return durationSeconds > 0 ? 'ANSWERED' : 'UNKNOWN';
  }
}

/// Picks the call the collector just made out of the log.
///
/// Filters to entries for this number that started at or after `since`, then takes
/// the most recent. `since` should be backdated a few seconds by the caller to
/// absorb clock skew between the app and the dialer.
CallEvidence? pickCall(
  List<CallRecord> entries, {
  required String phone,
  required DateTime since,
}) {
  final candidates = entries
      .where((entry) => phoneMatches(entry.number, phone))
      .where((entry) => !entry.startedAt.isBefore(since))
      .toList()
    ..sort((a, b) => b.startedAt.compareTo(a.startedAt));

  if (candidates.isEmpty) return null;
  final match = candidates.first;
  return CallEvidence(
    durationSeconds: match.durationSeconds,
    callOutcome: mapCallType(match.type, match.durationSeconds),
    durationSource: 'CALL_LOG',
  );
}

/// mm:ss for display next to a duration field.
String formatDuration(int seconds) {
  if (seconds <= 0) return '0s';
  if (seconds < 60) return '${seconds}s';
  final minutes = seconds ~/ 60;
  final rest = seconds % 60;
  return '${minutes}m ${rest.toString().padLeft(2, '0')}s';
}
