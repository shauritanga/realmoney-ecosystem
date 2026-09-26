/// One logged contact attempt.
///
/// Replaces the `Map<String, dynamic>` the timeline used to index into, where a
/// renamed field would have failed silently at runtime.
class InteractionLog {
  final String id;
  final String loanId;
  final String channel;
  final String disposition;
  final String? outcome;
  final String? notes;
  final int durationSeconds;
  final String? durationSource;
  final String? callOutcome;
  final bool? connected;
  final DateTime? followUpAt;
  final DateTime createdAt;

  /// 'SYSTEM' rows are written by the server (a USSD push it sent), not by a
  /// collector. Useful on a timeline, excluded from activity counts.
  final String origin;
  final String? collectorName;

  const InteractionLog({
    required this.id,
    required this.loanId,
    required this.channel,
    required this.disposition,
    required this.createdAt,
    required this.origin,
    this.outcome,
    this.notes,
    this.durationSeconds = 0,
    this.durationSource,
    this.callOutcome,
    this.connected,
    this.followUpAt,
    this.collectorName,
  });

  bool get isCall => channel == 'CALL';

  /// A duration is worth showing only on a call that recorded one.
  bool get hasDuration => isCall && durationSeconds > 0;

  /// True only when the device call log supplied the duration.
  bool get isVerified => durationSource == 'CALL_LOG';

  bool get isSystem => origin == 'SYSTEM';

  factory InteractionLog.fromJson(Map<String, dynamic> json) {
    final collector = json['collector'];
    return InteractionLog(
      id: json['id']?.toString() ?? '',
      loanId: json['loanId']?.toString() ?? '',
      channel: json['channel']?.toString() ?? 'CALL',
      disposition: json['disposition']?.toString() ?? 'UNREACHABLE',
      outcome: json['outcome']?.toString(),
      notes: json['notes']?.toString(),
      durationSeconds: (json['durationSeconds'] as num?)?.toInt() ?? 0,
      durationSource: json['durationSource']?.toString(),
      callOutcome: json['callOutcome']?.toString(),
      connected: json['connected'] as bool?,
      followUpAt: DateTime.tryParse(json['followUpAt']?.toString() ?? ''),
      createdAt:
          DateTime.tryParse(json['createdAt']?.toString() ?? '') ?? DateTime.now(),
      origin: json['origin']?.toString() ?? 'COLLECTOR',
      collectorName: collector is Map ? collector['fullName']?.toString() : null,
    );
  }
}
