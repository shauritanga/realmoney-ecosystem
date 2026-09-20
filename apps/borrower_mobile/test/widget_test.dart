import 'package:flutter_test/flutter_test.dart';
import 'package:borrower_mobile/main.dart';

void main() {
  testWidgets('RealMoneyBorrowerApp boots up', (WidgetTester tester) async {
    await tester.pumpWidget(const RealMoneyBorrowerApp(isLoggedIn: false));
    expect(find.bySemanticsLabel('RealMoney'), findsOneWidget);
    expect(find.text('Sign in to manage your loans.'), findsOneWidget);
  });
}
