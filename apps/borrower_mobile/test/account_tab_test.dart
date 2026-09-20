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

  testWidgets('account shows profile header, progress and grouped actions',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: AccountTab(onUpdated: () async {}),
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Amina Juma'), findsOneWidget);
    expect(find.text('+255712345678'), findsOneWidget);
    expect(find.text('2 of 4 complete'), findsOneWidget);
    expect(find.text('Verification in progress'), findsOneWidget);
    expect(find.text('Complete verification'), findsOneWidget);
    expect(find.text('Personal details'), findsNWidgets(2));
    expect(find.text('Account security'), findsOneWidget);
    expect(find.text('Help'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Sign out'),
      400,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    expect(find.text('Sign out'), findsOneWidget);
  });

  testWidgets('sign out asks for confirmation and cancels cleanly',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: AccountTab(onUpdated: () async {}),
      ),
    ));
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
