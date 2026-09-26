/// Accepts the local `0XXXXXXXXX` and international `255XXXXXXXXX` forms of a
/// Tanzanian mobile number, with or without a leading `+`.
///
/// Mirrors the server's own rule (`TZ_MOBILE` in collections.dto.ts) so a number the
/// collector types is never accepted here only to be rejected a round trip later,
/// mid-call, with the borrower waiting.
final _tzMobile = RegExp(r'^(?:\+?255|0)[67]\d{8}$');

/// Strips the punctuation people type into phone fields. Kept separate from the test
/// so the caller can send the cleaned value rather than the raw one.
String normalisePayerPhone(String raw) =>
    raw.replaceAll(RegExp(r'[\s()+-]'), '').trim();

bool isValidTzMobile(String raw) => _tzMobile.hasMatch(raw.replaceAll(RegExp(r'[\s()-]'), '').trim());

/// Why the payer fields are not yet usable, or null when they are.
///
/// Returns null when [enabled] is false: an unticked box is not an error, it just
/// means the borrower's own number is being prompted.
String? validatePayer({required bool enabled, required String phone}) {
  if (!enabled) return null;
  final cleaned = phone.trim();
  if (cleaned.isEmpty) return 'Enter the number of the person paying.';
  if (!isValidTzMobile(cleaned)) return 'That is not a valid Tanzanian mobile number.';
  return null;
}
