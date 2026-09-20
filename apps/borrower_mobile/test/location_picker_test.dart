import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:borrower_mobile/widgets/location_picker_sheet.dart';
import 'package:borrower_mobile/services/locations_service.dart';

void main() {
  testWidgets('LocationPickerSheet displays items, filters by search, and selects item', (tester) async {
    String? selected;

    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Builder(
          builder: (context) => ElevatedButton(
            onPressed: () async {
              selected = await LocationPickerSheet.show(
                context: context,
                title: 'Select Region',
                items: const ['Arusha', 'Dar es Salaam', 'Dodoma', 'Kilimanjaro', 'Mwanza'],
                selectedItem: 'Dodoma',
                searchHint: 'Search region…',
              );
            },
            child: const Text('Open Picker'),
          ),
        ),
      ),
    ));

    // Tap button to open bottom sheet
    await tester.tap(find.text('Open Picker'));
    await tester.pumpAndSettle();

    // Verify title, badge, and items are visible
    expect(find.text('Select Region'), findsOneWidget);
    expect(find.text('5'), findsOneWidget); // Count badge
    expect(find.text('Arusha'), findsOneWidget);
    expect(find.text('Dodoma'), findsOneWidget);

    // Selected item indicator
    expect(find.byIcon(Icons.check_circle_rounded), findsOneWidget);

    // Filter using search
    await tester.enterText(find.byType(TextField), 'dar');
    await tester.pumpAndSettle();

    expect(find.text('Dar es Salaam'), findsOneWidget);
    expect(find.text('Arusha'), findsNothing);
    expect(find.text('Dodoma'), findsNothing);

    // Tap item
    await tester.tap(find.text('Dar es Salaam'));
    await tester.pumpAndSettle();

    // Sheet dismissed, return value received
    expect(selected, 'Dar es Salaam');
  });

  test('LocationsService parses hierarchy and filters regions, districts, and wards', () {
    final mockData = {
      'Dodoma': {
        'Kondoa District Council': ['Bereko', 'Busi'],
        'Kondoa Town Council': ['Bolisa'],
      },
      'Arusha': {
        'Arusha City Council': ['Kaloleni'],
      },
    };

    final parsed = LocationsService.getRegions(mockData);
    expect(parsed, ['Arusha', 'Dodoma']);

    final districts = LocationsService.getDistricts('Dodoma', mockData);
    expect(districts, ['Kondoa District Council', 'Kondoa Town Council']);

    final wards = LocationsService.getWards('Dodoma', 'Kondoa District Council', mockData);
    expect(wards, ['Bereko', 'Busi']);
  });
}
