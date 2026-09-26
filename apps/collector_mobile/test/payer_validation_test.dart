import 'package:flutter_test/flutter_test.dart';
import 'package:collector_mobile/utils/payer_validation.dart';

void main() {
  group('third-party payer number', () {
    test('accepts the local form', () {
      for (final number in ['0712345678', '0687654321', '0621111111']) {
        expect(isValidTzMobile(number), isTrue, reason: number);
      }
    });

    test('accepts the international form, with or without a plus', () {
      for (final number in ['255712345678', '+255712345678', '+255687654321']) {
        expect(isValidTzMobile(number), isTrue, reason: number);
      }
    });

    test('tolerates the spacing and punctuation people actually type', () {
      for (final number in ['0712 345 678', '(0712) 345-678', ' 0712345678 ']) {
        expect(isValidTzMobile(number), isTrue, reason: number);
      }
    });

    test('rejects a prefix that is not a Tanzanian mobile', () {
      // Landlines and the 5-series are not mobile-money capable.
      for (final number in ['0512345678', '0222345678', '0812345678']) {
        expect(isValidTzMobile(number), isFalse, reason: number);
      }
    });

    test('rejects wrong lengths and non-numbers', () {
      for (final number in ['071234567', '07123456789', '', 'not a phone', '25571234567']) {
        expect(isValidTzMobile(number), isFalse, reason: number);
      }
    });

    test('strips punctuation, including the plus, for the value actually sent', () {
      expect(normalisePayerPhone('+255 712-345 678'), '255712345678');
      expect(normalisePayerPhone('(0712) 345678'), '0712345678');
    });
  });

  group('payer validation', () {
    test('an unticked box is not an error', () {
      expect(validatePayer(enabled: false, phone: ''), isNull);
      expect(validatePayer(enabled: false, phone: 'rubbish'), isNull);
    });

    test('asks for a number once the box is ticked', () {
      expect(validatePayer(enabled: true, phone: '   '),
          'Enter the number of the person paying.');
    });

    test('names the problem when the number is wrong', () {
      expect(validatePayer(enabled: true, phone: '0512345678'),
          'That is not a valid Tanzanian mobile number.');
    });

    test('passes a good number', () {
      expect(validatePayer(enabled: true, phone: '0712345678'), isNull);
    });
  });
}
