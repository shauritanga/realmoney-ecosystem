import 'package:flutter/material.dart';

import '../models/loan_assignment.dart';
import '../services/api_service.dart';
import '../theme/app_colors.dart';
import 'cases_tab.dart';
import 'home_tab.dart';
import 'profile_tab.dart';
import 'ptp_tab.dart';
import '../theme/app_icons.dart';

/// The app shell: four tabs over one shared load of the collector's day.
///
/// Queue, stats and promises are fetched here rather than per-tab so switching
/// tabs is instant and the four views cannot disagree about the same numbers.
class MainShell extends StatefulWidget {
  const MainShell({super.key});

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  int _tab = 0;

  List<LoanAssignment> _queue = [];
  Map<String, dynamic> _stats = {};
  Map<String, dynamic> _promises = {};
  Map<String, dynamic> _followUps = {};

  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      // One round trip for the whole shell rather than four sequential ones.
      final results = await Future.wait([
        ApiService.fetchMyQueue(),
        ApiService.fetchStats(),
        ApiService.fetchMyPromises(),
        ApiService.fetchFollowUps(),
      ]);
      if (!mounted) return;
      setState(() {
        _queue = results[0] as List<LoanAssignment>;
        _stats = results[1] as Map<String, dynamic>;
        _promises = results[2] as Map<String, dynamic>;
        _followUps = results[3] as Map<String, dynamic>;
        _loading = false;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        // A 401 is handled by AuthGate, which swaps in the login screen.
        _error = error.statusCode == 401 ? null : error.message;
        _loading = false;
      });
    }
  }

  /// Badge on the Promises tab: everything already missed.
  ///
  /// Counts both states, because to a collector they mean the same thing — the
  /// borrower did not pay when they said they would. `overdue` is a promise past its
  /// deadline the sweep has not resolved yet; `broken` is one it has.
  int get _missedPromises =>
      ((_promises['counts']?['overdue'] as num?)?.toInt() ?? 0) +
      ((_promises['counts']?['broken'] as num?)?.toInt() ?? 0);

  /// Badge on Cases: what is still untouched.
  int get _toDo => _queue.where((item) => !item.workedToday).length;

  @override
  Widget build(BuildContext context) {
    final tabs = [
      HomeTab(
        queue: _queue,
        stats: _stats,
        followUps: _followUps,
        promises: _promises,
        loading: _loading,
        error: _error,
        onRefresh: _load,
        onSeeAllCases: () => setState(() => _tab = 1),
        onSeePromises: () => setState(() => _tab = 2),
      ),
      CasesTab(
        queue: _queue,
        loading: _loading,
        error: _error,
        onRefresh: _load,
      ),
      PtpTab(
        promises: _promises,
        followUps: _followUps,
        loading: _loading,
        error: _error,
        onRefresh: _load,
      ),
      ProfileTab(stats: _stats, queue: _queue, onRefresh: _load),
    ];

    return Scaffold(
      body: SafeArea(
        top: false,
        bottom: false,
        child: IndexedStack(index: _tab, children: tabs),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (index) => setState(() => _tab = index),
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        destinations: [
          const NavigationDestination(
            icon: HugeIcon(icon: AppIcons.home),
            selectedIcon: HugeIcon(icon: AppIcons.home),
            label: 'Home',
          ),
          NavigationDestination(
            icon: _badged(const HugeIcon(icon: AppIcons.cases), _toDo),
            selectedIcon: _badged(const HugeIcon(icon: AppIcons.cases), _toDo),
            label: 'Cases',
          ),
          NavigationDestination(
            icon: _badged(
              const HugeIcon(icon: AppIcons.promises),
              _missedPromises,
              tint: AppColors.error,
            ),
            selectedIcon: _badged(
              const HugeIcon(icon: AppIcons.promises),
              _missedPromises,
              tint: AppColors.error,
            ),
            label: 'Promises',
          ),
          const NavigationDestination(
            icon: HugeIcon(icon: AppIcons.profile),
            selectedIcon: HugeIcon(icon: AppIcons.profile),
            label: 'Profile',
          ),
        ],
      ),
    );
  }

  /// A count on a tab icon, so work waiting is visible without opening the tab.
  Widget _badged(Widget icon, int count, {Color tint = AppColors.primary}) {
    if (count <= 0) return icon;
    return Badge(
      label: Text('$count'),
      backgroundColor: tint,
      textColor: Colors.white,
      child: icon,
    );
  }
}
