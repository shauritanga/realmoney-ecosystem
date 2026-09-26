/// A promise to pay.
class Ptp {
  final String id;
  final String loanId;
  final double promisedAmount;
  final DateTime promisedDate;
  final String status;
  final DateTime? resolvedAt;
  final String? resolvedReason;
  final String? notes;
  final DateTime createdAt;

  const Ptp({
    required this.id,
    required this.loanId,
    required this.promisedAmount,
    required this.promisedDate,
    required this.status,
    required this.createdAt,
    this.resolvedAt,
    this.resolvedReason,
    this.notes,
  });

  /// Replaced by a renegotiated promise rather than missed — not the collector's
  /// failure, and excluded from kept-rate on the server for the same reason.
  bool get isSuperseded => resolvedReason == 'SUPERSEDED';

  /// Lapsed before the server tracked outcomes at all.
  bool get isUntracked => resolvedReason == 'BACKFILL_UNVERIFIED';

  /// A genuine miss worth escalating.
  bool get isBroken => status == 'BROKEN' && !isSuperseded && !isUntracked;

  factory Ptp.fromJson(Map<String, dynamic> json) {
    return Ptp(
      id: json['id']?.toString() ?? '',
      loanId: json['loanId']?.toString() ?? '',
      promisedAmount:
          double.tryParse(json['promisedAmount']?.toString() ?? '0') ?? 0,
      promisedDate:
          DateTime.tryParse(json['promisedDate']?.toString() ?? '') ?? DateTime.now(),
      status: json['status']?.toString() ?? 'PENDING',
      resolvedAt: DateTime.tryParse(json['resolvedAt']?.toString() ?? ''),
      resolvedReason: json['resolvedReason']?.toString(),
      notes: json['notes']?.toString(),
      createdAt:
          DateTime.tryParse(json['createdAt']?.toString() ?? '') ?? DateTime.now(),
    );
  }
}
