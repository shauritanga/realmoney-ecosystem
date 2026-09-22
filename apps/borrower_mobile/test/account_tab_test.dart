import 'dart:convert';

import 'package:borrower_mobile/screens/account_tab.dart';
import 'package:borrower_mobile/services/api_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

const _profile = {
  'fullName': 'Amina Juma',
  'phone': '+255712345678',
  'email': 'amina@example.com',
  'registrationComplete': true,
  'identityVerified': true,
  'financialComplete': false,
  'walletVerified': false,
  'canApply': false,
  'onboarding': {},
};

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    ApiService.client = MockClient((request) async {
      if (request.url.path.endsWith('/onboarding')) {
        return http.Response(jsonEncode(_profile), 200);
      }
      return http.Response('{}', 404);
    });
  });
  tearDown(() {
    ApiService.client.close();
    ApiService.client = http.Client();
  });

  testWidgets('account shows profile header, progress and grouped actions', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: AccountTab(onUpdated: () async {})),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Amina Juma'), findsOneWidget);
    expect(find.text('+255712345678'), findsOneWidget);
    expect(
      find.text('Complete verification · 2 of 4 complete'),
      findsOneWidget,
    );
    expect(find.text('Verification in progress'), findsOneWidget);
    expect(find.byType(LinearProgressIndicator), findsNothing);
    expect(find.text('Your account'), findsOneWidget);
    expect(find.text('Personal details'), findsOneWidget);
    expect(find.text('Account security'), findsOneWidget);
    expect(find.text('Settings'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Sign out'),
      400,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    expect(find.text('Sign out'), findsOneWidget);
  });

  testWidgets('account destinations open and return to the menu', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: AccountTab(onUpdated: () async {})),
      ),
    );
    await tester.pumpAndSettle();

    for (final destination in {
      'Personal details': 'Legal name',
      'Account security': 'Sign out when using a shared device.',
      'Settings': 'Notifications',
      'Help & support': 'Contact support',
      'FAQ': 'How do I repay?',
      'Delete account & data': 'Account deletion is not available yet',
    }.entries) {
      await tester.scrollUntilVisible(
        find.text(destination.key),
        150,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.text(destination.key));
      await tester.pumpAndSettle();
      expect(find.text(destination.value), findsOneWidget);
      await tester.pageBack();
      await tester.pumpAndSettle();
    }
    expect(tester.takeException(), isNull);
  });

  testWidgets('verified account opens confirmation instead of onboarding', (
    tester,
  ) async {
    ApiService.client = MockClient(
      (request) async => http.Response(
        jsonEncode({
          ..._profile,
          'canApply': true,
          'financialComplete': true,
          'walletVerified': true,
        }),
        200,
      ),
    );
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: AccountTab(onUpdated: () async {})),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Verification'));
    await tester.pumpAndSettle();
    expect(find.text('No more verification needed'), findsOneWidget);
    expect(find.text('Complete verification'), findsNothing);
  });

  testWidgets('personal details includes financial and wallet submissions', (
    tester,
  ) async {
    ApiService.client = MockClient(
      (request) async => http.Response(
        jsonEncode({
          ..._profile,
          'nationalId': '12345678901234567890',
          'onboarding': {
            'identityType': 'NIDA',
            'landmark': 'Near the market',
            'financial': {
              'employmentStatus': 'SELF_EMPLOYED',
              'occupation': 'Shop owner',
              'monthlyIncome': 650000,
              'essentialExpenses': 200000,
              'existingLoanRepayments': 0,
            },
            'wallet': {'provider': 'MPESA', 'phone': '+255712345678'},
          },
        }),
        200,
      ),
    );
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: AccountTab(onUpdated: () async {})),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Personal details'));
    await tester.pumpAndSettle();
    for (final value in [
      '12345678901234567890',
      'Near the market',
      'Self-employed',
      'Shop owner',
      'TZS 650,000',
      'TZS 200,000',
      'TZS 0',
      'M-Pesa',
    ]) {
      await tester.scrollUntilVisible(find.text(value), 150,
          scrollable: find.byType(Scrollable).first);
      expect(find.text(value), findsOneWidget);
    }
    expect(tester.takeException(), isNull);
  });

  testWidgets('sign out asks for confirmation and cancels cleanly', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: AccountTab(onUpdated: () async {})),
      ),
    );
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.text('Sign out'),
      400,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Sign out'));
    await tester.pumpAndSettle();
    expect(find.text('Sign out?'), findsOneWidget);

    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(find.text('Sign out?'), findsNothing);
    await tester.scrollUntilVisible(
      find.text('Amina Juma'),
      -400,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    expect(find.text('Amina Juma'), findsOneWidget);
  });
}
