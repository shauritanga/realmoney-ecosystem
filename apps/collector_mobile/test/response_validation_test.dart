import 'package:flutter_test/flutter_test.dart';
import 'package:collector_mobile/utils/response_validation.dart';

final now = DateTime(2026, 9, 25, 10, 0);
DateTime inDays(int n) => now.add(Duration(days: n));

void main() {
  group('validatePtpAmount', () {
    const outstanding = 100000.0;

    test('accepts a sensible amount', () {
      expect(validatePtpAmount('40000', outstandingBalance: outstanding), isNull);
    });

    test('accepts an amount typed with thousands separators', () {
      expect(validatePtpAmount('40,000', outstandingBalance: outstanding), isNull);
    });

    test('rejects an empty field instead of silently dropping the promise', () {
      expect(validatePtpAmount('', outstandingBalance: outstanding), isNotNull);
      expect(validatePtpAmount(null, outstandingBalance: outstanding), isNotNull);
    });

    test('rejects unparseable text', () {
      expect(validatePtpAmount('soon', outstandingBalance: outstanding),
          'Enter a number.');
    });

    test('rejects zero and negatives', () {
      expect(validatePtpAmount('0', outstandingBalance: outstanding),
          'Amount must be more than zero.');
      expect(validatePtpAmount('-5000', outstandingBalance: outstanding),
          'Amount must be more than zero.');
    });

    test('enforces the recording floor', () {
      expect(validatePtpAmount('499', outstandingBalance: outstanding), isNotNull);
      expect(validatePtpAmount('500', outstandingBalance: outstanding), isNull);
    });

    test('will not promise more than is owed', () {
      expect(validatePtpAmount('100001', outstandingBalance: outstanding), isNotNull);
      expect(validatePtpAmount('100000', outstandingBalance: outstanding), isNull);
    });
  });

  group('validatePtpDate', () {
    test('accepts today and the cap', () {
      expect(validatePtpDate(now, now: now), isNull);
      expect(validatePtpDate(inDays(maxPtpDays), now: now), isNull);
    });

    test('rejects a missing date', () {
      expect(validatePtpDate(null, now: now), isNotNull);
    });

    test('rejects the past and beyond the cap', () {
      expect(validatePtpDate(inDays(-1), now: now), 'Date cannot be in the past.');
      expect(validatePtpDate(inDays(maxPtpDays + 1), now: now), isNotNull);
    });

    test('compares calendar days, not instants', () {
      // 07:00 on the same day is earlier than `now` but is not a past date.
      expect(validatePtpDate(DateTime(2026, 9, 25, 7), now: now), isNull);
    });
  });

  group('validateCallback', () {
    test('accepts a future time', () {
      expect(validateCallback(now.add(const Duration(hours: 4)), now: now), isNull);
    });

    test('requires a time at all — the old app captured none', () {
      expect(validateCallback(null, now: now), isNotNull);
    });

    test('rejects the past, now, and beyond the cap', () {
      expect(validateCallback(inDays(-1), now: now), isNotNull);
      expect(validateCallback(now, now: now), 'Callback must be in the future.');
      expect(validateCallback(inDays(maxCallbackDays + 1), now: now), isNotNull);
    });
  });

  group('validateNotes', () {
    test('requires an explanation when claiming the loan was paid', () {
      expect(validateNotes('', disposition: 'PAID'), isNotNull);
      expect(validateNotes('   ', disposition: 'PAID'), isNotNull);
      expect(validateNotes('Paid cash at the branch.', disposition: 'PAID'), isNull);
    });

    test('leaves notes optional for other dispositions', () {
      expect(validateNotes('', disposition: 'UNREACHABLE'), isNull);
    });

    test('caps the length to what the API accepts', () {
      expect(validateNotes('x' * 501, disposition: 'UNREACHABLE'), isNotNull);
      expect(validateNotes('x' * 500, disposition: 'UNREACHABLE'), isNull);
    });
  });

  group('validateManualDuration', () {
    test('treats an empty field as "not reported"', () {
      expect(validateManualDuration(''), isNull);
      expect(validateManualDuration(null), isNull);
    });

    test('accepts whole seconds and rejects nonsense', () {
      expect(validateManualDuration('134'), isNull);
      expect(validateManualDuration('abc'), isNotNull);
      expect(validateManualDuration('-1'), isNotNull);
      expect(validateManualDuration('14401'), isNotNull);
    });
  });
}
