import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../models/loan_assignment.dart';
import '../theme/app_colors.dart';
import '../utils/call_matching.dart';
import '../utils/collection_levels.dart';
import '../widgets/ui.dart';
import 'case_detail_screen.dart';
import '../theme/app_icons.dart';

/// The day at a glance: what was done, what is waiting, what needs chasing.
class HomeTab extends StatelessWidget {
  final List<LoanAssignment> queue;
  final Map<String, dynamic> stats;
  final Map<String, dynamic> followUps;
  final Map<String, dynamic> promises;
  final bool loading;
  final String? error;
  final Future<void> Function() onRefresh;
  final VoidCallback onSeeAllCases;
  final VoidCallback onSeePromises;

  const HomeTab({
    super.key,
    required this.queue,
    required this.stats,
    required this.followUps,
    required this.promises,
    required this.loading,
    required this.error,
    required this.onRefresh,
    required this.onSeeAllCases,
    required this.onSeePromises,
  });

  int _stat(String key) => (stats[key] as num?)?.toInt() ?? 0;

  List<Map<String, dynamic>> _section(String key) =>
      ((followUps[key] as List?) ?? const [])
          .whereType<Map<String, dynamic>>()
          .toList();

  @override
  Widget build(BuildContext context) {
    final money = NumberFormat('#,##0', 'en_US');
    final worked = queue.where((item) => item.workedToday).length;
    final total = queue.length;
    final talkTime =
        queue.fold<int>(0, (sum, item) => sum + item.talkTimeTodaySeconds);
    final callbacks = _section('callbacks');
    final broken = _section('brokenPromises');
    final nextUp = queue.where((item) => !item.workedToday).take(3).toList();

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 20,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              _greeting(),
              style: const TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w700,
                color: AppColors.text,
              ),
            ),
            Text(
              DateFormat('EEEE d MMMM').format(DateTime.now()),
              style: const TextStyle(fontSize: 11, color: AppColors.textMuted),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const HugeIcon(icon: AppIcons.refresh, color: AppColors.primary),
            onPressed: onRefresh,
          ),
          const SizedBox(width: 6),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: onRefresh,
        color: AppColors.primary,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
          children: [
            if (error != null) ...[
              ErrorBanner(message: error!, onRetry: onRefresh),
              const SizedBox(height: 16),
            ],
            _summaryCard(money, worked, total, talkTime),
            const SizedBox(height: 22),
            if (broken.isNotEmpty) ...[
              _alertCard(
                context,
                icon: AppIcons.alert,
                tint: AppColors.error,
                title: '${broken.length} broken '
                    '${broken.length == 1 ? 'promise' : 'promises'}',
                detail: 'Borrowers who missed what they committed to. Chase first.',
                onTap: onSeePromises,
              ),
              const SizedBox(height: 12),
            ],
            if (callbacks.isNotEmpty) ...[
              _alertCard(
                context,
                icon: AppIcons.callback,
                tint: AppColors.warning,
                title: '${callbacks.length} '
                    '${callbacks.length == 1 ? 'callback' : 'callbacks'} due',
                detail: 'You promised to call these borrowers back.',
                onTap: onSeePromises,
              ),
              const SizedBox(height: 12),
            ],
            const SizedBox(height: 4),
            SectionLabel(
              'Next up',
              trailing: TextButton(
                onPressed: onSeeAllCases,
                style: TextButton.styleFrom(
                  padding: EdgeInsets.zero,
                  minimumSize: Size.zero,
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                child: const Text(
                  'All cases',
                  style: TextStyle(
                    color: AppColors.primary,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 10),
            if (loading && queue.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 40),
                child: Center(
                  child: CircularProgressIndicator(color: AppColors.primary),
                ),
              )
            else if (nextUp.isEmpty)
              AppCard(
                child: Row(
                  children: [
                    const HugeIcon(icon: AppIcons.success,
                        color: AppColors.primary, size: 20),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        total == 0
                            ? 'No cases assigned for today.'
                            : 'Every case worked today. Well done.',
                        style: const TextStyle(
                          color: AppColors.text,
                          fontSize: 13,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  ],
                ),
              )
            else
              ...nextUp.map(
                (item) => Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: _nextUpRow(context, item, money),
                ),
              ),
          ],
        ),
      ),
    );
  }

  String _greeting() {
    final hour = DateTime.now().hour;
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }

  /// The day summary. Inverted against the light page so the headline numbers
  /// read first.
  Widget _summaryCard(NumberFormat money, int worked, int total, int talkTime) {
    final assignedLevel = stats['assignedLevel']?.toString();
    final recovered = (stats['recoveredTodayAmount'] as num?)?.toDouble() ?? 0;

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.inverseSurface,
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              if (assignedLevel != null && assignedLevel != 'null')
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(7),
                  ),
                  child: Text(
                    'TIER ${levelLabels[assignedLevel] ?? assignedLevel}',
                    style: const TextStyle(
                      color: AppColors.onInverse,
                      fontSize: 10,
                      fontWeight: FontWeight.bold,
                      letterSpacing: 0.4,
                    ),
                  ),
                ),
              const Spacer(),
              if (talkTime > 0)
                Text(
                  '${formatDuration(talkTime)} on calls',
                  style: const TextStyle(
                    color: AppColors.onInverseMuted,
                    fontSize: 11,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text(
                '$worked',
                style: const TextStyle(
                  color: AppColors.onInverse,
                  fontSize: 34,
                  fontWeight: FontWeight.bold,
                  height: 1,
                ),
              ),
              Text(
                ' of $total worked',
                style: const TextStyle(
                  color: AppColors.onInverseMuted,
                  fontSize: 14,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            'TZS ${money.format(recovered)} recovered today',
            style: const TextStyle(
              color: AppColors.onInverseMuted,
              fontSize: 12,
            ),
          ),
          const SizedBox(height: 14),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: total == 0 ? 0 : worked / total,
              minHeight: 6,
              backgroundColor: Colors.white.withValues(alpha: 0.12),
              valueColor: const AlwaysStoppedAnimation(Color(0xFF34D399)),
            ),
          ),
          const SizedBox(height: 18),
          Row(
            children: [
              _inverseStat('Calls', _stat('callsToday')),
              _inverseStat('WhatsApp', _stat('whatsappToday')),
              _inverseStat('SMS', _stat('smsToday')),
              _inverseStat('Settled', _stat('settledToday')),
            ],
          ),
        ],
      ),
    );
  }

  Widget _inverseStat(String label, int value) {
    return Expanded(
      child: Column(
        children: [
          Text(
            '$value',
            style: const TextStyle(
              color: AppColors.onInverse,
              fontSize: 18,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: const TextStyle(
              color: AppColors.onInverseMuted,
              fontSize: 10,
            ),
          ),
        ],
      ),
    );
  }

  Widget _alertCard(
    BuildContext context, {
    required HugeIconData icon,
    required Color tint,
    required String title,
    required String detail,
    required VoidCallback onTap,
  }) {
    return AppCard(
      onTap: onTap,
      borderColor: tint.withValues(alpha: 0.35),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(9),
            decoration: BoxDecoration(
              color: tint.withValues(alpha: 0.10),
              borderRadius: BorderRadius.circular(10),
            ),
            child: HugeIcon(icon: icon, size: 18, color: tint),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    color: AppColors.text,
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  detail,
                  style: const TextStyle(
                    color: AppColors.textMuted,
                    fontSize: 11,
                  ),
                ),
              ],
            ),
          ),
          const HugeIcon(icon: AppIcons.chevron, color: AppColors.textLabel, size: 20),
        ],
      ),
    );
  }

  Widget _nextUpRow(
      BuildContext context, LoanAssignment item, NumberFormat money) {
    return AppCard(
      onTap: () => Navigator.of(context)
          .push(MaterialPageRoute(builder: (_) => CaseDetailScreen(item: item)))
          .then((_) => onRefresh()),
      borderColor:
          item.ptpOverdue ? AppColors.error.withValues(alpha: 0.4) : null,
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.borrowerName,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: AppColors.text,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  'TZS ${money.format(item.outstandingBalance)} · '
                  '${levelStatusText(item)}',
                  style: const TextStyle(
                    color: AppColors.textMuted,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
          Pill(item.levelLabel,
              tint: isPreDue(item.level) ? AppColors.primary : AppColors.error),
          const SizedBox(width: 6),
          const HugeIcon(icon: AppIcons.chevron, color: AppColors.textLabel, size: 20),
        ],
      ),
    );
  }
}
