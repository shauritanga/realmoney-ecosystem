import 'dart:async';
import 'package:borrower_mobile/services/sms_code_service.dart';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/rendering.dart';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:borrower_mobile/services/api_service.dart';
import 'package:borrower_mobile/screens/registration_screen.dart';
import 'package:borrower_mobile/screens/onboarding_screen.dart';

const legal = {
  'terms': {'text': 'Development terms', 'version': 'terms-1'},
  'privacy': {'text': 'Development privacy', 'version': 'privacy-1'},
  'draft': true,
};

Future<void> tapText(WidgetTester tester, String text) async {
  final finder = find.text(text);
  await tester.ensureVisible(finder);
  await tester.tap(finder);
  await tester.pumpAndSettle();
}
Future<void> enter(WidgetTester tester, String label, String value) async {
  final finder = find.widgetWithText(TextFormField, label);
  await tester.ensureVisible(finder);
  await tester.enterText(finder, value);
  await tester.pump();
}


Future<void> capture(WidgetTester tester, String name) async {
  if (!const bool.fromEnvironment('CAPTURE_ONBOARDING')) return;
  await tester.pumpAndSettle();
  final boundary = tester.renderObject<RenderRepaintBoundary>(find.byType(RepaintBoundary).first);
  await tester.runAsync(() async {
    final image = await boundary.toImage(pixelRatio: 1);
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    await File('/tmp/realmoney-$name.png').writeAsBytes(bytes!.buffer.asUint8List());
    image.dispose();
  });
}

class FakeSmsCodeService extends SmsCodeService {
  final code = Completer<String?>();
  bool listening = false;
  int stops = 0;
  @override
  Future<String?> listen() { listening = true; return code.future; }
  @override
  Future<void> stop() async { stops++; }
}

void main() {
  setUp(() { SharedPreferences.setMockInitialValues({}); });
  tearDown(() { ApiService.client.close(); ApiService.client = http.Client(); });

  for (final changeNumber in [false, true]) {
    testWidgets('SMS consent fills code only for the active phone flow: change=$changeNumber', (tester) async {
      final sms = FakeSmsCodeService();
      String? verifiedCode;
      ApiService.client = MockClient((request) async {
        if (request.url.path.endsWith('/legal')) return http.Response(jsonEncode(legal), 200);
        if (request.url.path.endsWith('/phone-code')) {
          expect(sms.listening, isTrue);
          return http.Response('{}', 201);
        }
        verifiedCode = jsonDecode(request.body)['code'];
        return http.Response(jsonEncode({'phone': '+255712345678', 'phoneProof': 'proof'}), 201);
      });
      await tester.pumpWidget(MaterialApp(home: RegistrationScreen(smsCodeService: sms)));
      await tester.pumpAndSettle();
      await enter(tester, 'Mobile number', '0712345678');
      await tapText(tester, 'Send verification code');
      if (changeNumber) await tapText(tester, 'Change number');
      sms.code.complete('654321');
      await tester.pumpAndSettle();
      if (changeNumber) {
        await tapText(tester, 'Continue');
        expect(tester.widget<TextFormField>(find.byKey(const ValueKey('code'))).controller!.text, isEmpty);
        expect(verifiedCode, isNull);
      } else {
        expect(tester.widget<TextFormField>(find.byKey(const ValueKey('code'))).controller!.text, '654321');
        await tapText(tester, 'Verify code');
        expect(verifiedCode, '654321');
        expect(find.text('Create a password'), findsOneWidget);
      }
      await tester.pumpWidget(const SizedBox());
      expect(sms.stops, greaterThan(1));
    });
  }

  testWidgets('registration verifies phone, validates passwords, collects address and records separate consents', (tester) async {
    tester.view.physicalSize = const Size(800, 1400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    Map<String, dynamic>? submitted;
    ApiService.client = MockClient((request) async {
      final path = request.url.path;
      if (path.endsWith('/legal')) return http.Response(jsonEncode(legal), 200);
      if (path.endsWith('/phone-code')) return http.Response(jsonEncode({'developmentCode': '123456'}), 201);
      if (path.endsWith('/verify-phone')) return http.Response(jsonEncode({'phone': '+255712345678', 'phoneProof': 'proof'}), 201);
      if (path.endsWith('/register')) { submitted = jsonDecode(request.body); return http.Response(jsonEncode({'accessToken': 'token'}), 201); }
      return http.Response('{}', 404);
    });
    await tester.pumpWidget(MaterialApp(home: Builder(builder: (context) => Scaffold(body: TextButton(
      onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => RegistrationScreen(smsCodeService: FakeSmsCodeService()))), child: const Text('Start'))))));
    await tapText(tester, 'Start');
    await capture(tester, 'register-account');
    expect(find.byKey(const ValueKey('code')), findsNothing);
    expect(find.byKey(const ValueKey('password')), findsNothing);
    await enter(tester, 'Mobile number', '0712345678');
    await tapText(tester, 'Send verification code');
    expect(find.textContaining('Development code: 123456'), findsOneWidget);
    expect(find.byKey(const ValueKey('phone')), findsNothing);
    expect(find.byKey(const ValueKey('password')), findsNothing);
    await capture(tester, 'register-code');
    await enter(tester, '6-digit SMS code', '123456');
    await tapText(tester, 'Verify code');
    expect(find.byKey(const ValueKey('code')), findsNothing);
    await capture(tester, 'register-password');
    await enter(tester, 'Password', 'LongPassword123');
    await enter(tester, 'Confirm password', 'wrong');
    await tapText(tester, 'Continue');
    expect(find.text('Passwords do not match'), findsOneWidget);
    await enter(tester, 'Confirm password', 'LongPassword123');
    await tapText(tester, 'Continue');
    expect(find.text('Personal details'), findsOneWidget);
    await capture(tester, 'register-personal');
    await enter(tester, 'Full legal name', 'Test Borrower');
    await enter(tester, 'Date of birth (YYYY-MM-DD)', '1990-01-01');
    await enter(tester, 'Identity document number', '19900101123450000101');
    await tapText(tester, 'Continue');
    for (final label in ['Region', 'District', 'Ward', 'Street / village']) { await enter(tester, label, 'Test address'); }
    await capture(tester, 'register-address');
    await tapText(tester, 'Create account');
    expect(submitted, isNull);
    await tapText(tester, 'Account terms');
    expect(find.text('Development terms'), findsOneWidget);
    await tester.tap(find.byTooltip('Back'));
    await tester.pumpAndSettle();
    await tapText(tester, 'Privacy notice');
    expect(find.text('Development privacy'), findsOneWidget);
    await tester.tap(find.byTooltip('Back'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('terms_privacy_checkbox')));
    await tester.pumpAndSettle();
    await tapText(tester, 'Create account');
    expect(submitted!['termsVersion'], 'terms-1');
    expect(submitted!['privacyVersion'], 'privacy-1');
    expect(submitted!['marketingConsent'], false);
    expect(submitted!['phone'], '+255712345678');
    expect(submitted!['phoneProof'], 'proof');
    expect(await ApiService.getToken(), 'token');
    expect(find.text('Start'), findsOneWidget);
  });

  testWidgets('failed SMS leaves an actionable error and never advances registration', (tester) async {
    ApiService.client = MockClient((request) async => request.url.path.endsWith('/legal')
      ? http.Response(jsonEncode(legal), 200) : http.Response(jsonEncode({'message': 'SMS service unavailable'}), 503));
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(MaterialApp(home: RegistrationScreen(smsCodeService: FakeSmsCodeService())));
    await tester.pumpAndSettle();
    await enter(tester, 'Mobile number', '0712345678');
    await tapText(tester, 'Send verification code');
    await capture(tester, 'register-mobile-error');
    expect(find.text('SMS service unavailable'), findsOneWidget);
    expect(find.text('Step 1 of 5'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('wrong codes stay on verification and back navigation preserves verification', (tester) async {
    var attempts = 0;
    var sends = 0;
    ApiService.client = MockClient((request) async {
      if (request.url.path.endsWith('/legal')) return http.Response(jsonEncode(legal), 200);
      if (request.url.path.endsWith('/phone-code')) { sends++; return http.Response('{}', 201); }
      attempts++;
      if (attempts == 1) return http.Response(jsonEncode({'message': 'Invalid or expired code'}), 400);
      return http.Response(jsonEncode({'phone': '+255712345678', 'phoneProof': 'proof'}), 201);
    });
    await tester.pumpWidget(MaterialApp(home: RegistrationScreen(smsCodeService: FakeSmsCodeService())));
    await tester.pumpAndSettle();
    await enter(tester, 'Mobile number', '0712345678');
    await tapText(tester, 'Send verification code');
    await enter(tester, '6-digit SMS code', '111111');
    await tapText(tester, 'Verify code');
    expect(find.text('Invalid or expired code'), findsOneWidget);
    expect(find.byKey(const ValueKey('password')), findsNothing);
    await tapText(tester, 'Change number');
    await tapText(tester, 'Continue');
    expect(sends, 1);
    await enter(tester, '6-digit SMS code', '123456');
    await tapText(tester, 'Verify code');
    expect(find.text('Create a password'), findsOneWidget);
    await tester.tap(find.byTooltip('Back'));
    await tester.pumpAndSettle();
    await tapText(tester, 'Continue');
    expect(find.text('Create a password'), findsOneWidget);
    expect(attempts, 2);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('existing borrowers skip password creation after verifying their phone', (tester) async {
    ApiService.client = MockClient((request) async {
      if (request.url.path.endsWith('/legal')) return http.Response(jsonEncode(legal), 200);
      if (request.url.path.endsWith('/phone-code')) return http.Response('{}', 201);
      return http.Response(jsonEncode({'phone': '+255712345678', 'phoneProof': 'proof'}), 201);
    });
    await tester.pumpWidget(MaterialApp(home: RegistrationScreen(existingProfile: const {'phone': '+255712345678'}, smsCodeService: FakeSmsCodeService())));
    await tester.pumpAndSettle();
    await tapText(tester, 'Send verification code');
    await enter(tester, '6-digit SMS code', '123456');
    await tapText(tester, 'Verify code');
    expect(find.text('Personal details'), findsOneWidget);
    expect(find.text('Step 3 of 4'), findsOneWidget);
    expect(find.byKey(const ValueKey('password')), findsNothing);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('pre-loan flow enables apply only after identity and wallet completion', (tester) async {
    tester.view.physicalSize = const Size(800, 1800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    bool identity = false, complete = false;
    Map<String, dynamic>? financial;
    ApiService.client = MockClient((request) async {
      if (request.url.path.endsWith('/verify-identity')) { identity = true; return http.Response('{}', 201); }
      if (request.url.path.endsWith('/financial')) { complete = true; financial = jsonDecode(request.body); return http.Response('{}', 200); }
      return http.Response(jsonEncode({'phone': '+255712345678', 'registrationComplete': true,
        'identityVerified': identity, 'walletVerified': complete, 'financialComplete': complete,
        'canApply': complete, 'development': true, 'onboarding': {}}), 200);
    });
    await tester.pumpWidget(const MaterialApp(home: OnboardingScreen()));
    await tester.pumpAndSettle();
    expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Continue to loan application')).onPressed, isNull);
    await tapText(tester, 'Verify my identity');
    await capture(tester, 'preloan-profile');
    await enter(tester, 'Occupation / business / income source', 'Teacher');
    await enter(tester, 'Typical monthly income', '500000');
    await enter(tester, 'Monthly essential expenses', '200000');
    await enter(tester, 'Monthly existing loan repayments', '0');
    await tapText(tester, 'Save details and verify wallet');
    expect(financial!['monthlyIncome'], 500000);
    expect(financial!['walletPhone'], '+255712345678');
    expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Continue to loan application')).onPressed, isNotNull);
  });
}
