import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../models/loan_assignment.dart';
import '../services/api_service.dart';
import '../services/call_log_service.dart';
import '../theme/app_colors.dart';
import '../utils/call_matching.dart';
import '../utils/collection_levels.dart';
import '../widgets/ui.dart';
import 'login_screen.dart';
import '../theme/app_icons.dart';

/// Who the collector is, how they are doing, and the settings they control.
class ProfileTab extends StatefulWidget {
  final Map<String, dynamic> stats;
  final List<LoanAssignment> queue;
  final Future<void> Function() onRefresh;

  const ProfileTab({
    super.key,
    required this.stats,
    required this.queue,
    required this.onRefresh,
  });

  @override
  State<ProfileTab> createState() => _ProfileTabState();
}

class _ProfileTabState extends State<ProfileTab> {
  Map<String, dynamic> _me = {};
  Map<String, dynamic> _performance = {};
  bool _callLogGranted = false;
  bool _loading = true;
  String _version = '';

  final _money = NumberFormat('#,##0', 'en_US');

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) setState(() => _loading = true);
    try {
      final results = await Future.wait([
        ApiService.fetchMe(),
        ApiService.fetchMyPerformance(),
      ]);
      final granted = await CallLogService.hasPermission();
      final package = await PackageInfo.fromPlatform();
      if (!mounted) return;
      setState(() {
        _me = results[0];
        _performance = results[1];
        _callLogGranted = granted;
        _version = '${package.version} (${package.buildNumber})';
        _loading = false;
      });
    } on ApiException {
      if (mounted) setState(() => _loading = false);
    }
  }

  num _total(String key) =>
      (_performance['totals']?[key] as num?) ?? 0;

  Future<void> _logout() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Sign out?', style: TextStyle(fontSize: 17)),
        content: const Text(
          'You will need your email and password to sign back in.',
          style: TextStyle(fontSize: 13),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel',
                style: TextStyle(color: AppColors.textMuted)),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child:
                const Text('Sign out', style: TextStyle(color: AppColors.error)),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    await ApiService.clearToken();
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (route) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    final name = _me['fullName']?.toString() ?? 'Collector';
    final assignedLevel = widget.stats['assignedLevel']?.toString();

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 20,
        title: const Text(
          'Profile',
          style: TextStyle(
            fontSize: 17,
            fontWeight: FontWeight.w700,
            color: AppColors.text,
          ),
        ),
        actions: [
          IconButton(
            icon: const HugeIcon(icon: AppIcons.refresh, color: AppColors.primary),
            onPressed: () {
              _load();
              widget.onRefresh();
            },
          ),
          const SizedBox(width: 6),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          await _load();
          await widget.onRefresh();
        },
        color: AppColors.primary,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 28),
          children: [
            _identityCard(name, assignedLevel),
            const SizedBox(height: 22),
            const SectionLabel('Today'),
            const SizedBox(height: 10),
            AppCard(
              child: Row(
                children: [
                  StatTile(
                    label: 'Cases',
                    value: '${widget.queue.length}',
                    tint: AppColors.info,
                    icon: AppIcons.cases,
                  ),
                  StatTile(
                    label: 'Worked',
                    value: '${widget.queue.where((i) => i.workedToday).length}',
                    tint: AppColors.primary,
                    icon: AppIcons.success,
                  ),
                  StatTile(
                    label: 'Talk time',
                    value: formatDuration(
                      widget.queue.fold<int>(
                          0, (sum, i) => sum + i.talkTimeTodaySeconds),
                    ),
                    tint: AppColors.channelSms,
                    icon: AppIcons.clock,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 22),
            const SectionLabel('Last 30 days'),
            const SizedBox(height: 10),
            AppCard(
              child: _loading
                  ? const Padding(
                      padding: EdgeInsets.symmetric(vertical: 20),
                      child: Center(
                        child: SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: AppColors.primary),
                        ),
                      ),
                    )
                  : Column(
                      children: [
                        DetailRow('Calls placed', '${_total('calls')}'),
                        DetailRow('Reached', '${_total('callsConnected')}'),
                        DetailRow(
                          'Talk time',
                          formatDuration(_total('talkTimeSeconds').toInt()),
                        ),
                        DetailRow(
                          'Messages initiated',
                          '${_total('smsInitiated') + _total('whatsappInitiated')}',
                        ),
                        DetailRow('Borrowers reached',
                            '${_total('borrowersTouched')}'),
                        const Divider(height: 20),
                        DetailRow(
                          'Recovered',
                          'TZS ${_money.format(_performance['byCollector'] is List && (_performance['byCollector'] as List).isNotEmpty ? ((_performance['byCollector'] as List).first['recoveredInitiatedAmount'] ?? 0) : 0)}',
                          valueColor: AppColors.primary,
                        ),
                      ],
                    ),
            ),
            const SizedBox(height: 22),
            const SectionLabel('Settings'),
            const SizedBox(height: 10),
            AppCard(
              padding: EdgeInsets.zero,
              child: Column(
                children: [
                  _settingRow(
                    icon: AppIcons.call,
                    title: 'Automatic call length',
                    subtitle: _callLogGranted
                        ? 'On — talk time is read from your call log'
                        : CallLogService.isSupported
                            ? 'Off — you enter call length yourself'
                            : 'Not available on this device',
                    trailing: _callLogGranted
                        ? const Pill('ON', tint: AppColors.primary)
                        : CallLogService.isSupported
                            ? TextButton(
                                onPressed: () async {
                                  await CallLogService.openSettings();
                                },
                                style: TextButton.styleFrom(
                                  padding: EdgeInsets.zero,
                                  minimumSize: Size.zero,
                                  tapTargetSize:
                                      MaterialTapTargetSize.shrinkWrap,
                                ),
                                child: const Text(
                                  'Enable',
                                  style: TextStyle(
                                    color: AppColors.primary,
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              )
                            : null,
                  ),
                  const Divider(height: 1),
                  // The API base URL used to sit here. A collector cannot act on it,
                  // it is fixed at build time, and on a lost or shared handset it
                  // hands out infrastructure detail for nothing. The build number is
                  // what support actually needs when someone reports a problem.
                  _settingRow(
                    icon: AppIcons.info,
                    title: 'App version',
                    subtitle: _version.isEmpty ? '—' : _version,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 22),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: _logout,
                style: OutlinedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  side: BorderSide(color: AppColors.error.withValues(alpha: 0.4)),
                ),
                icon: const HugeIcon(icon: AppIcons.signOut, size: 17, color: AppColors.error),
                label: const Text(
                  'Sign out',
                  style: TextStyle(
                    color: AppColors.error,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _identityCard(String name, String? assignedLevel) {
    final initials = name
        .trim()
        .split(RegExp(r'\s+'))
        .where((part) => part.isNotEmpty)
        .take(2)
        .map((part) => part[0].toUpperCase())
        .join();

    return AppCard(
      padding: const EdgeInsets.all(18),
      child: Row(
        children: [
          Container(
            width: 54,
            height: 54,
            decoration: const BoxDecoration(
              color: AppColors.successTint,
              shape: BoxShape.circle,
            ),
            alignment: Alignment.center,
            child: Text(
              initials.isEmpty ? '?' : initials,
              style: const TextStyle(
                color: AppColors.primary,
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  style: const TextStyle(
                    color: AppColors.text,
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  _me['phone']?.toString() ?? '',
                  style: const TextStyle(
                    color: AppColors.textMuted,
                    fontSize: 12,
                    fontFamily: 'monospace',
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    const Pill('COLLECTOR', tint: AppColors.info),
                    if (assignedLevel != null && assignedLevel != 'null') ...[
                      const SizedBox(width: 6),
                      Pill(
                        'TIER ${levelLabels[assignedLevel] ?? assignedLevel}',
                        tint: AppColors.primary,
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _settingRow({
    required HugeIconData icon,
    required String title,
    required String subtitle,
    Widget? trailing,
  }) {
    return Padding(
      padding: const EdgeInsets.all(14),
      child: Row(
        children: [
          HugeIcon(icon: icon, size: 19, color: AppColors.textMuted),
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
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: const TextStyle(
                    color: AppColors.textMuted,
                    fontSize: 11,
                  ),
                ),
              ],
            ),
          ),
          ?trailing,
        ],
      ),
    );
  }
}
