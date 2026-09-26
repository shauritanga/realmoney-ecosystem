import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:collector_mobile/theme/app_theme.dart';
import 'package:collector_mobile/utils/call_matching.dart';
import 'package:collector_mobile/widgets/response_sheet.dart';

/// The sheet is a lazily-built scroll view, so on the default 800x600 test viewport
/// the lower fields are never constructed and cannot be found at all. A tall viewport
/// renders the whole form, which is what these tests are about.
void useTallViewport(WidgetTester tester) {
  tester.view.physicalSize = const Size(1200, 4000);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
}

Future<void> typeIn(WidgetTester tester, Key key, String text) async {
  await tester.enterText(find.byKey(key), text);
  await tester.pumpAndSettle();
}

Future<void> tapSave(WidgetTester tester) async {
  await tester.tap(find.text('Save response'));
  await tester.pumpAndSettle();
}

/// Wraps the sheet in enough app to pump it.
Widget harness({
  String channel = 'CALL',
  CallEvidence evidence = CallEvidence.none,
  double outstanding = 100000,
  VoidCallback? onSaved,
}) {
  return MaterialApp(
    theme: collectorTheme,
    home: Scaffold(
      body: ResponseSheet(
        loanId: '00000000-0000-0000-0000-000000000001',
        borrowerName: 'Asha Mwakasege',
        loanNumber: '6501',
        channel: channel,
        outstandingBalance: outstanding,
        evidence: evidence,
        onSaved: onSaved ?? () {},
      ),
    ),
  );
}

void main() {
  testWidgets('shows the borrower and defaults to a promise to pay', (tester) async {
    useTallViewport(tester);
    await tester.pumpWidget(harness());
    expect(find.text('Asha Mwakasege'), findsOneWidget);
    expect(find.text('Case 6501'), findsOneWidget);
    expect(find.text('Promise to pay'), findsWidgets);
  });

  testWidgets('presents a verified call as locked and measured', (tester) async {
    useTallViewport(tester);
    await tester.pumpWidget(harness(
      evidence: const CallEvidence(
        durationSeconds: 134,
        callOutcome: 'ANSWERED',
        durationSource: 'CALL_LOG',
      ),
    ));
    expect(find.text('Connected · 2m 14s'), findsOneWidget);
    expect(find.text('Verified from your call log'), findsOneWidget);
    // Nothing to ask: the log already said whether it connected.
    expect(find.text('DID YOU REACH THE CUSTOMER?'), findsNothing);
  });

  testWidgets('asks for the outcome itself when no call was found', (tester) async {
    useTallViewport(tester);
    await tester.pumpWidget(harness());
    expect(find.text('No call found in the log'), findsOneWidget);
    expect(find.text('Self-reported — tell us what happened.'), findsOneWidget);
    expect(find.text('DID YOU REACH THE CUSTOMER?'), findsOneWidget);
  });

  testWidgets('labels a message as initiated, never as delivered', (tester) async {
    useTallViewport(tester);
    await tester.pumpWidget(harness(channel: 'WHATSAPP'));
    expect(find.text('WhatsApp handed to your phone'), findsOneWidget);
    expect(
      find.text('Logged as initiated — delivery cannot be confirmed.'),
      findsOneWidget,
    );
  });

  testWidgets('blocks submission when the promise amount is cleared', (tester) async {
    useTallViewport(tester);
    var saved = false;
    await tester.pumpWidget(harness(onSaved: () => saved = true));

    // The amount is prefilled with the balance; empty it.
    await typeIn(tester, const Key('response.ptpAmount'), '');
    await tapSave(tester);

    expect(find.text('Enter the amount promised.'), findsOneWidget);
    expect(saved, isFalse);
  });

  testWidgets('blocks a promise larger than the outstanding balance', (tester) async {
    useTallViewport(tester);
    await tester.pumpWidget(harness(outstanding: 50000));
    await typeIn(tester, const Key('response.ptpAmount'), '60000');
    await tapSave(tester);

    expect(
      find.text('Cannot promise more than the outstanding balance.'),
      findsOneWidget,
    );
  });

  testWidgets('blocks a zero amount, which the old dialog silently discarded',
      (tester) async {
    useTallViewport(tester);
    await tester.pumpWidget(harness());
    await typeIn(tester, const Key('response.ptpAmount'), '0');
    await tapSave(tester);

    expect(find.text('Amount must be more than zero.'), findsOneWidget);
  });

  testWidgets('offers PAID, which the old dialog omitted entirely', (tester) async {
    useTallViewport(tester);
    await tester.pumpWidget(harness());

    // Open the dropdown and confirm every backend disposition is reachable.
    await tester.ensureVisible(find.byType(DropdownButton<String>));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(DropdownButton<String>));
    await tester.pumpAndSettle();
    expect(find.text('Already paid'), findsWidgets);
    expect(find.text('Wrong number'), findsWidgets);
  });

  testWidgets('requires a note before claiming the loan was paid', (tester) async {
    useTallViewport(tester);
    await tester.pumpWidget(harness());
    await tester.ensureVisible(find.byType(DropdownButton<String>));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(DropdownButton<String>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Already paid').last);
    await tester.pumpAndSettle();

    await tapSave(tester);

    expect(find.text('Explain how and when they paid.'), findsOneWidget);
  });
}
