import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:collector_mobile/models/extension_offer.dart';
import 'package:collector_mobile/theme/app_theme.dart';
import 'package:collector_mobile/widgets/payment_request_dialog.dart';

/// The dialog is a scroll view, so on the default 800x600 viewport the lower fields
/// are never constructed and cannot be found at all.
void useTallViewport(WidgetTester tester) {
  tester.view.physicalSize = const Size(1200, 4000);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
}

ExtensionOffer offer({
  double fee = 3100,
  int remaining = 2,
  bool eligible = true,
  String? reason,
}) {
  return ExtensionOffer(
    fee: fee,
    newDueDate: DateTime(2026, 10, 4),
    extensionsRemaining: remaining,
    eligible: eligible,
    reason: reason,
  );
}

Widget harness({double outstanding = 12250, ExtensionOffer? extension}) {
  return MaterialApp(
    theme: collectorTheme,
    home: Scaffold(
      body: PaymentRequestDialog(
        loanId: 'loan-1',
        borrowerName: 'Asha Mwinyi',
        borrowerPhone: '0712345678',
        defaultAmount: outstanding,
        extension: extension,
        onPaymentTriggered: () {},
      ),
    ),
  );
}

void main() {
  testWidgets('opens on payment with the full balance filled in', (tester) async {
    useTallViewport(tester);
    await tester.pumpWidget(harness());

    expect(find.text('Request payment'), findsOneWidget);
    expect(find.text('12,250'), findsOneWidget);
    expect(find.text('Asha Mwinyi · 0712345678'), findsOneWidget);
  });

  testWidgets('fills a fraction of the balance so the collector need not do arithmetic',
      (tester) async {
    useTallViewport(tester);
    await tester.pumpWidget(harness());

    await tester.tap(find.text('25%'));
    await tester.pumpAndSettle();
    expect(find.text('3,063'), findsOneWidget);

    await tester.tap(find.text('50%'));
    await tester.pumpAndSettle();
    expect(find.text('6,125'), findsOneWidget);

    await tester.tap(find.text('Full'));
    await tester.pumpAndSettle();
    expect(find.text('12,250'), findsOneWidget);
  });

  testWidgets('rejects a payment below the TZS 500 floor before the round trip',
      (tester) async {
    useTallViewport(tester);
    await tester.pumpWidget(harness());

    await tester.enterText(find.byType(TextField).first, '200');
    await tester.tap(find.text('Send'));
    await tester.pumpAndSettle();

    expect(find.text('The smallest payment is TZS 500.'), findsOneWidget);
  });

  testWidgets('rejects more than the outstanding balance', (tester) async {
    useTallViewport(tester);
    await tester.pumpWidget(harness());

    await tester.enterText(find.byType(TextField).first, '99999');
    await tester.tap(find.text('Send'));
    await tester.pumpAndSettle();

    expect(find.text('More than the outstanding balance.'), findsOneWidget);
  });

  group('extension mode', () {
    testWidgets('shows the fee, the new date, and that the debt does not move',
        (tester) async {
      useTallViewport(tester);
      await tester.pumpWidget(harness(extension: offer()));

      await tester.tap(find.text('Extension'));
      await tester.pumpAndSettle();

      expect(find.text('Extend the due date'), findsOneWidget);
      expect(find.text('TZS 3,100'), findsOneWidget);
      expect(find.text('Moves the due date to 4 Oct.'), findsOneWidget);
      expect(
        find.text('The balance does not change — this buys time only.'),
        findsOneWidget,
      );
    });

    testWidgets('replaces the amount field: there is nothing to type', (tester) async {
      useTallViewport(tester);
      await tester.pumpWidget(harness(extension: offer()));

      await tester.tap(find.text('Extension'));
      await tester.pumpAndSettle();

      expect(find.text('25%'), findsNothing);
      expect(find.text('Send fee request'), findsOneWidget);
    });

    testWidgets('warns when this is the last extension available', (tester) async {
      useTallViewport(tester);
      await tester.pumpWidget(harness(extension: offer(remaining: 1)));

      await tester.tap(find.text('Extension'));
      await tester.pumpAndSettle();

      expect(
        find.text('This is the last extension available on this case.'),
        findsOneWidget,
      );
    });

    testWidgets('states the reason rather than the fee when refused', (tester) async {
      useTallViewport(tester);
      await tester.pumpWidget(harness(
        extension: offer(eligible: false, reason: 'This loan is already settled.'),
      ));

      await tester.tap(find.text('Extension'));
      await tester.pumpAndSettle();

      expect(find.text('This loan is already settled.'), findsOneWidget);
      expect(find.text('TZS 3,100'), findsNothing);
    });

    testWidgets('switching back to payment restores the amount', (tester) async {
      useTallViewport(tester);
      await tester.pumpWidget(harness(extension: offer()));

      await tester.tap(find.text('Extension'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Payment'));
      await tester.pumpAndSettle();

      expect(find.text('Request payment'), findsOneWidget);
      expect(find.text('12,250'), findsOneWidget);
    });
  });

  group('third-party payer', () {
    testWidgets('hides the payer fields until asked for', (tester) async {
      useTallViewport(tester);
      await tester.pumpWidget(harness());

      expect(find.text('Their mobile number'), findsNothing);

      await tester.tap(find.text('Someone else is paying'));
      await tester.pumpAndSettle();

      expect(find.text('Their mobile number'), findsOneWidget);
      expect(find.text('Their name (optional)'), findsOneWidget);
    });

    testWidgets('requires a number once the box is ticked', (tester) async {
      useTallViewport(tester);
      await tester.pumpWidget(harness());

      await tester.tap(find.text('Someone else is paying'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Send'));
      await tester.pumpAndSettle();

      expect(find.text('Enter the number of the person paying.'), findsOneWidget);
    });

    testWidgets('rejects a number that is not a Tanzanian mobile', (tester) async {
      useTallViewport(tester);
      await tester.pumpWidget(harness());

      await tester.tap(find.text('Someone else is paying'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).at(1), '0512345678');
      await tester.tap(find.text('Send'));
      await tester.pumpAndSettle();

      expect(find.text('That is not a valid Tanzanian mobile number.'), findsOneWidget);
    });

    testWidgets('is offered for extensions too, not just payments', (tester) async {
      useTallViewport(tester);
      await tester.pumpWidget(harness(extension: offer()));

      await tester.tap(find.text('Extension'));
      await tester.pumpAndSettle();

      expect(find.text('Someone else is paying'), findsOneWidget);
    });
  });
}
