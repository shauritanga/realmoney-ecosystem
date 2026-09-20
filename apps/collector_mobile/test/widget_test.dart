import 'package:flutter_test/flutter_test.dart';
import 'package:collector_mobile/main.dart';

void main() {
  testWidgets('CollectorApp boots up to LoginScreen', (WidgetTester tester) async {
    await tester.pumpWidget(const CollectorApp(isLoggedIn: false));
    expect(find.text('RealMoney Collector'), findsOneWidget);
  });
}
