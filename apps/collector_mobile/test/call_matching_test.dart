import 'package:flutter_test/flutter_test.dart';
import 'package:collector_mobile/utils/call_matching.dart';

final now = DateTime.utc(2026, 9, 25, 10, 0);

CallRecord record({
  String number = '+255712345678',
  String type = 'outgoing',
  int duration = 134,
  Duration offset = Duration.zero,
}) {
  return CallRecord(
    number: number,
    type: type,
    durationSeconds: duration,
    startedAt: now.add(offset),
  );
}

void main() {
  group('normalizeTz', () {
    test('converts every common local format to 255XXXXXXXXX', () {
      expect(normalizeTz('0712345678'), '255712345678');
      expect(normalizeTz('+255712345678'), '255712345678');
      expect(normalizeTz('255712345678'), '255712345678');
      expect(normalizeTz('0712 345 678'), '255712345678');
      expect(normalizeTz('+255 712-345-678'), '255712345678');
      expect(normalizeTz('00255712345678'), '255712345678');
    });

    test('leaves an unrecognisable string as bare digits rather than throwing', () {
      expect(normalizeTz('not a number'), '');
      expect(normalizeTz(''), '');
    });
  });

  group('phoneMatches', () {
    test('matches the same subscriber across formats', () {
      expect(phoneMatches('+255712345678', '0712345678'), isTrue);
      expect(phoneMatches('0712 345 678', '255712345678'), isTrue);
    });

    test('does not match a different subscriber', () {
      expect(phoneMatches('+255712345678', '+255754987654'), isFalse);
    });

    test('refuses to match on too few digits, avoiding false positives', () {
      expect(phoneMatches('5678', '+255712345678'), isFalse);
      expect(phoneMatches('', '+255712345678'), isFalse);
    });
  });

  group('mapCallType', () {
    test('an outgoing call with talk time answered; without, it did not', () {
      expect(mapCallType('outgoing', 45), 'ANSWERED');
      expect(mapCallType('outgoing', 0), 'NO_ANSWER');
    });

    test('maps the refusal types', () {
      expect(mapCallType('rejected', 0), 'DECLINED');
      expect(mapCallType('blocked', 0), 'DECLINED');
      expect(mapCallType('missed', 0), 'MISSED');
    });

    test('is case-insensitive, since plugins differ on casing', () {
      expect(mapCallType('OUTGOING', 45), 'ANSWERED');
      expect(mapCallType('Rejected', 0), 'DECLINED');
    });

    test('falls back to talk time for an unknown type', () {
      expect(mapCallType('wifi_incoming', 30), 'ANSWERED');
      expect(mapCallType('wifi_incoming', 0), 'UNKNOWN');
    });
  });

  group('pickCall', () {
    test('returns null when the log is empty', () {
      expect(pickCall([], phone: '+255712345678', since: now), isNull);
    });

    test('finds the call and reads a verified duration off it', () {
      final evidence = pickCall(
        [record(offset: const Duration(seconds: 5))],
        phone: '0712345678',
        since: now,
      );
      expect(evidence, isNotNull);
      expect(evidence!.durationSeconds, 134);
      expect(evidence.callOutcome, 'ANSWERED');
      expect(evidence.durationSource, 'CALL_LOG');
      expect(evidence.isVerified, isTrue);
    });

    test('ignores calls that started before the collector tapped Call', () {
      // Otherwise yesterday's call to the same borrower would be logged as today's.
      final evidence = pickCall(
        [record(offset: const Duration(hours: -3))],
        phone: '+255712345678',
        since: now,
      );
      expect(evidence, isNull);
    });

    test('ignores calls to a different number made in the same window', () {
      final evidence = pickCall(
        [record(number: '+255754987654', offset: const Duration(seconds: 10))],
        phone: '+255712345678',
        since: now,
      );
      expect(evidence, isNull);
    });

    test('takes the most recent when the collector redialled', () {
      final evidence = pickCall(
        [
          record(duration: 10, offset: const Duration(seconds: 5)),
          record(duration: 99, offset: const Duration(seconds: 60)),
          record(duration: 40, offset: const Duration(seconds: 30)),
        ],
        phone: '+255712345678',
        since: now,
      );
      expect(evidence!.durationSeconds, 99);
    });

    test('accepts a call starting exactly at the boundary', () {
      final evidence = pickCall([record()], phone: '+255712345678', since: now);
      expect(evidence, isNotNull);
    });

    test('reports an unanswered call as evidence, not as nothing found', () {
      // A ring-out is a real, countable attempt; it must not look like a missing log.
      final evidence = pickCall(
        [record(duration: 0, offset: const Duration(seconds: 5))],
        phone: '+255712345678',
        since: now,
      );
      expect(evidence!.durationSeconds, 0);
      expect(evidence.callOutcome, 'NO_ANSWER');
      expect(evidence.durationSource, 'CALL_LOG');
    });
  });

  group('formatDuration', () {
    test('renders seconds, minutes and zero', () {
      expect(formatDuration(0), '0s');
      expect(formatDuration(-5), '0s');
      expect(formatDuration(45), '45s');
      expect(formatDuration(134), '2m 14s');
      expect(formatDuration(120), '2m 00s');
    });
  });
}
