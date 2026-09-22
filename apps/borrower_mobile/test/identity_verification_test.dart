import 'dart:convert';

import 'package:borrower_mobile/screens/identity_verification_screen.dart';
import 'package:borrower_mobile/services/api_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  tearDown(() {
    ApiService.client.close();
    ApiService.client = http.Client();
  });

  Future<void> show(
    WidgetTester tester,
    Map<String, dynamic> verification,
  ) async {
    ApiService.client = MockClient(
      (request) async => http.Response(
        jsonEncode({'identityVerification': verification}),
        200,
      ),
    );
    await tester.pumpWidget(
      const MaterialApp(home: IdentityVerificationScreen()),
    );
    await tester.pumpAndSettle();
  }

  testWidgets(
    'card capture asks for both sides and blocks unavailable service',
    (tester) async {
      await show(tester, {
        'status': 'not_started',
        'documentType': 'NIDA',
        'available': false,
      });
      expect(find.text('Front of your NIDA card'), findsOneWidget);
      expect(find.text('Back of your NIDA card'), findsOneWidget);
      expect(find.text('Live selfie check'), findsOneWidget);
      expect(find.text('Start secure capture'), findsNothing);
    },
  );

  testWidgets('passport asks for photo page rather than card back', (
    tester,
  ) async {
    await show(tester, {
      'status': 'not_started',
      'documentType': 'PASSPORT',
      'available': false,
    });
    expect(find.text('Passport photo page'), findsOneWidget);
    expect(find.textContaining('Back of'), findsNothing);
  });

  testWidgets('capture requires explicit notice acceptance', (tester) async {
    await show(tester, {
      'status': 'not_started',
      'documentType': 'NIDA',
      'available': true,
      'notice': 'Test privacy notice',
      'noticeVersion': 'test',
    });
    await tester.scrollUntilVisible(find.byType(CheckboxListTile), 200);
    expect(
      tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
      isNull,
    );
    await tester.tap(find.byType(CheckboxListTile));
    await tester.pumpAndSettle();
    expect(
      tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
      isNotNull,
    );
  });

  testWidgets('review offers status refresh without a new capture', (
    tester,
  ) async {
    await show(tester, {'status': 'review', 'available': true});
    expect(find.text('Under review'), findsOneWidget);
    expect(find.text('Check verification status'), findsOneWidget);
    expect(find.byType(CheckboxListTile), findsNothing);
    expect(find.text('Start secure capture'), findsNothing);
  });

  testWidgets(
    'refresh trusts backend result and does not submit a client approval',
    (tester) async {
      var status = 'processing';
      final requests = <http.Request>[];
      ApiService.client = MockClient((request) async {
        requests.add(request);
        if (request.url.path.endsWith('/identity/refresh')) {
          expect(jsonDecode(request.body), isEmpty);
          status = 'verified';
          return http.Response('{}', 200);
        }
        return http.Response(
          jsonEncode({
            'identityVerification': {'status': status, 'available': true},
          }),
          200,
        );
      });
      await tester.pumpWidget(
        const MaterialApp(home: IdentityVerificationScreen()),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Check verification status'));
      await tester.pumpAndSettle();
      expect(find.text('Identity verified'), findsOneWidget);
      expect(
        requests.where((request) => request.method == 'POST'),
        hasLength(1),
      );
    },
  );
}
