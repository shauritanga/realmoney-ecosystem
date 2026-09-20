import 'dart:convert';

import 'package:borrower_mobile/screens/dashboard_screen.dart';
import 'package:borrower_mobile/services/api_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

Map<String, dynamic> pendingLoan(String number) => {
      'id': 'id-$number',
      'loanNumber': number,
      'status': 'PENDING',
      'principalAmount': '50000',
      'totalAmount': '55000',
      'totalPaid': '0',
      'outstandingBalance': '55000',
      'dueDate': '2026-12-31',
      'repayments': [],
    };

void mockBackend(List<Map<String, dynamic>> loans) {
  ApiService.client = MockClient((request) async {
    final path = request.url.path;
    if (path.endsWith('/my-loans')) {
      return http.Response(jsonEncode(loans), 200);
    }
    if (path.endsWith('/my-limit')) {
      return http.Response(jsonEncode({'amount': 200000}), 200);
    }
    if (path.endsWith('/onboarding')) {
      return http.Response(jsonEncode({'fullName': 'Amina Juma'}), 200);
    }
    return http.Response('{}', 404);
  });
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  tearDown(() {
    ApiService.client.close();
    ApiService.client = http.Client();
  });

  testWidgets('home lists three recent loans with view all shortcut',
      (tester) async {
    mockBackend([
      pendingLoan('LN-1'),
      pendingLoan('LN-2'),
      pendingLoan('LN-3'),
      pendingLoan('LN-4'),
    ]);
    await tester.pumpWidget(const MaterialApp(home: DashboardScreen()));
    await tester.pumpAndSettle();

    expect(find.text('Recent loans'), findsOneWidget);
    expect(find.text('View all'), findsOneWidget);
    expect(find.text('LN-1'), findsOneWidget);
    expect(find.text('LN-3'), findsOneWidget);
    expect(find.text('LN-4'), findsNothing);

    await tester.drag(
      find.byKey(const PageStorageKey('borrower-tab-0')),
      const Offset(0, -300),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('View all'));
    await tester.pumpAndSettle();
    expect(find.text('Your loans'), findsOneWidget);
    expect(find.text('LN-4'), findsOneWidget);
  });

  testWidgets('home shows a designed empty card when there are no loans',
      (tester) async {
    mockBackend([]);
    await tester.pumpWidget(const MaterialApp(home: DashboardScreen()));
    await tester.pumpAndSettle();

    await tester.drag(
      find.byKey(const PageStorageKey('borrower-tab-0')),
      const Offset(0, -600),
    );
    await tester.pumpAndSettle();
    expect(find.text('Recent loans'), findsOneWidget);
    expect(find.text('View all'), findsNothing);
    expect(find.text('No loans yet'), findsOneWidget);
    expect(
      find.text('Your applications and loan history will appear here.'),
      findsOneWidget,
    );
  });
}
