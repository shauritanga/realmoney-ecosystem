import 'package:borrower_mobile/screens/home_header.dart';
import 'package:borrower_mobile/screens/notifications_screen.dart';
import 'package:flutter_test/flutter_test.dart';

Map<String, dynamic> loan({
  required String status,
  String loanNumber = 'LN-1',
  String outstanding = '50000',
  String? dueDate,
  List<Map<String, dynamic>> repayments = const [],
}) {
  final map = <String, dynamic>{
    'status': status,
    'loanNumber': loanNumber,
    'outstandingBalance': outstanding,
    'repayments': repayments,
  };
  if (dueDate != null) map['dueDate'] = dueDate;
  return map;
}

void main() {
  group('greetingFor', () {
    test('morning before noon', () {
      expect(greetingFor(DateTime(2026, 1, 1, 8)), 'Good morning');
      expect(greetingFor(DateTime(2026, 1, 1, 11, 59)), 'Good morning');
    });
    test('afternoon from noon', () {
      expect(greetingFor(DateTime(2026, 1, 1, 12)), 'Good afternoon');
      expect(greetingFor(DateTime(2026, 1, 1, 16, 59)), 'Good afternoon');
    });
    test('evening from 5pm', () {
      expect(greetingFor(DateTime(2026, 1, 1, 17)), 'Good evening');
      expect(greetingFor(DateTime(2026, 1, 1, 23)), 'Good evening');
    });
  });

  group('initialsFor / firstNameOf', () {
    test('falls back when the name is unknown', () {
      expect(initialsFor(null), 'RM');
      expect(initialsFor('   '), 'RM');
      expect(firstNameOf(null), isNull);
    });
    test('derives initials from one or two words', () {
      expect(initialsFor('Amina'), 'AM');
      expect(initialsFor('Amina Juma'), 'AJ');
      expect(initialsFor('  amina   juma  '), 'AJ');
      expect(firstNameOf('Amina Juma'), 'Amina');
    });
  });

  group('buildNotificationItems', () {
    final now = DateTime(2026, 9, 20, 10);

    test('empty loans produce an empty inbox', () {
      expect(buildNotificationItems([], now: now), isEmpty);
      expect(unreadNotificationCount([], now: now), 0);
    });

    test('overdue loans are actionable and first', () {
      final items = buildNotificationItems(
        [
          loan(status: 'ACTIVE', dueDate: '2026-12-31'),
          loan(status: 'OVERDUE', dueDate: '2026-09-01'),
        ],
        now: now,
      );
      expect(items.first.title, 'Repayment overdue');
      expect(items.first.isActionable, isTrue);
    });

    test('due-soon loans are actionable, distant loans are reminders', () {
      final soon = buildNotificationItems(
        [loan(status: 'ACTIVE', dueDate: '2026-09-21')],
        now: now,
      );
      expect(soon.single.title, 'Repayment due soon');
      expect(soon.single.isActionable, isTrue);

      final later = buildNotificationItems(
        [loan(status: 'ACTIVE', dueDate: '2026-12-31')],
        now: now,
      );
      expect(later.single.title, 'Repayment reminder');
      expect(later.single.isActionable, isFalse);
    });

    test('pipeline loans surface review and payout updates', () {
      final items = buildNotificationItems(
        [
          loan(status: 'PENDING'),
          loan(status: 'APPROVED'),
        ],
        now: now,
      );
      expect(
        items.map((item) => item.title),
        ['Application under review', 'Loan approved'],
      );
      expect(unreadNotificationCount(
        [loan(status: 'PENDING'), loan(status: 'APPROVED')],
        now: now,
      ), 2);
    });

    test('completed repayments appear as receipts without badge count', () {
      final items = buildNotificationItems(
        [
          loan(status: 'ACTIVE', dueDate: '2026-12-31', repayments: [
            {
              'status': 'COMPLETED',
              'amount': '20000',
              'paidAt': '2026-09-19T10:00:00.000Z',
            },
            {'status': 'PENDING', 'amount': '5000'},
          ]),
        ],
        now: now,
      );
      expect(items.last.title, 'Payment received');
      expect(items.last.isActionable, isFalse);
      expect(unreadNotificationCount(
        [
          loan(status: 'ACTIVE', dueDate: '2026-12-31', repayments: [
            {
              'status': 'COMPLETED',
              'amount': '20000',
              'paidAt': '2026-09-19T10:00:00.000Z',
            },
          ]),
        ],
        now: now,
      ), 0);
    });
  });
}
