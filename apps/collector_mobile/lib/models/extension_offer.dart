/// What an extension would cost a loan right now, as the server priced it.
///
/// Priced server-side rather than in the app: the fee is a percentage of a balance
/// that can move between screens, and a collector must never quote a figure the
/// borrower will then be charged differently for.
class ExtensionOffer {
  final double fee;
  final DateTime newDueDate;
  final DateTime? currentDueDate;
  final int extensionsGranted;
  final int extensionsRemaining;

  /// Whether one may be granted at all.
  final bool eligible;

  /// Why not, in words a collector can read out. Null when [eligible].
  final String? reason;

  const ExtensionOffer({
    required this.fee,
    required this.newDueDate,
    required this.extensionsRemaining,
    required this.eligible,
    this.currentDueDate,
    this.extensionsGranted = 0,
    this.reason,
  });

  /// Null when the payload carries no usable quote — an older server, or a case whose
  /// terms could not be priced. Callers show the extension tab as unavailable rather
  /// than inventing a fee.
  static ExtensionOffer? fromJson(Map<String, dynamic>? json) {
    if (json == null) return null;
    final due = DateTime.tryParse(json['newDueDate']?.toString() ?? '');
    final fee = double.tryParse(json['fee']?.toString() ?? '');
    if (due == null || fee == null) return null;
    return ExtensionOffer(
      fee: fee,
      newDueDate: due,
      currentDueDate: DateTime.tryParse(json['currentDueDate']?.toString() ?? ''),
      extensionsGranted: (json['extensionsGranted'] as num?)?.toInt() ?? 0,
      extensionsRemaining: (json['extensionsRemaining'] as num?)?.toInt() ?? 0,
      eligible: json['eligible'] == true,
      reason: json['reason']?.toString(),
    );
  }
}
