import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../services/api_service.dart';
import '../theme/app_colors.dart';
import '../theme/app_icons.dart';

/// Callbacks and promises this collector owes a follow-up on.
///
/// The old app let a collector select `CALLBACK_REQUESTED` but captured no date, so
/// nothing ever came back — the commitment was recorded and then lost. This is the
/// queue that makes it mean something.
class FollowUpsScreen extends StatefulWidget {
  const FollowUpsScreen({super.key});

  @override
  State<FollowUpsScreen> createState() => _FollowUpsScreenState();
}

class _FollowUpsScreenState extends State<FollowUpsScreen> {
  Map<String, dynamic> _data = {};
  bool _loading = true;
  String? _error;

  final _money = NumberFormat('#,##0', 'en_US');

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await ApiService.fetchFollowUps();
      if (!mounted) return;
      setState(() {
        _data = data;
        _loading = false;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.statusCode == 401 ? null : error.message;
        _loading = false;
      });
    }
  }

  List<Map<String, dynamic>> _section(String key) =>
      ((_data[key] as List?) ?? const [])
          .whereType<Map<String, dynamic>>()
          .toList();

  @override
  Widget build(BuildContext context) {
    final callbacks = _section('callbacks');
    final promises = _section('promisesDue');
    final broken = _section('brokenPromises');
    final empty = callbacks.isEmpty && promises.isEmpty && broken.isEmpty;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Follow-ups', style: TextStyle(fontSize: 16)),
        actions: [
          IconButton(
            icon: const HugeIcon(icon: AppIcons.refresh, color: AppColors.primary),
            onPressed: _load,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        color: AppColors.primary,
        backgroundColor: AppColors.surface,
        child: _loading
            ? const Center(
                child: CircularProgressIndicator(color: AppColors.primary))
            : ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  if (_error != null) _banner(_error!),
                  // Broken first: these are the ones already past the point of a
                  // gentle reminder.
                  if (broken.isNotEmpty) ...[
                    _heading('BROKEN PROMISES', broken.length, AppColors.error),
                    ...broken.map(_brokenTile),
                    const SizedBox(height: 20),
                  ],
                  if (callbacks.isNotEmpty) ...[
                    _heading('CALLBACKS DUE', callbacks.length, AppColors.warning),
                    ...callbacks.map(_callbackTile),
                    const SizedBox(height: 20),
                  ],
                  if (promises.isNotEmpty) ...[
                    _heading('PROMISES DUE', promises.length, AppColors.primary),
                    ...promises.map(_promiseTile),
                  ],
                  if (empty && _error == null)
                    const Padding(
                      padding: EdgeInsets.only(top: 100),
                      child: Column(
                        children: [
                          HugeIcon(icon: AppIcons.success,
                              size: 34, color: AppColors.textLabel),
                          SizedBox(height: 12),
                          Text('Nothing to follow up right now.',
                              style: TextStyle(
                                  color: AppColors.textMuted, fontSize: 13)),
                        ],
                      ),
                    ),
                ],
              ),
      ),
    );
  }

  Widget _heading(String text, int count, Color tint) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          Text(text,
              style: const TextStyle(
                  color: AppColors.textLabel,
                  fontSize: 11,
                  fontWeight: FontWeight.bold,
                  letterSpacing: 0.6)),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            decoration: BoxDecoration(
              color: tint.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text('$count',
                style: TextStyle(
                    color: tint, fontSize: 10, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }

  Widget _tile({
    required HugeIconData icon,
    required Color tint,
    required String title,
    required String subtitle,
    required String meta,
    String? trailing,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: tint.withValues(alpha: 0.4)),
      ),
      child: Row(
        children: [
          HugeIcon(icon: icon, size: 18, color: tint),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style: const TextStyle(
                        color: AppColors.text,
                        fontSize: 13,
                        fontWeight: FontWeight.w600)),
                const SizedBox(height: 2),
                Text(subtitle,
                    style: const TextStyle(
                        color: AppColors.textMuted,
                        fontSize: 11,
                        fontFamily: 'monospace')),
                const SizedBox(height: 4),
                Text(meta, style: TextStyle(color: tint, fontSize: 11)),
              ],
            ),
          ),
          if (trailing != null)
            Text(trailing,
                style: const TextStyle(
                    color: AppColors.errorSoft,
                    fontSize: 12,
                    fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  Widget _callbackTile(Map<String, dynamic> row) {
    final at = DateTime.tryParse(row['followUpAt']?.toString() ?? '');
    final overdue = row['overdue'] == true;
    return _tile(
      icon: AppIcons.callback,
      tint: overdue ? AppColors.error : AppColors.warning,
      title: row['borrowerName']?.toString() ?? 'Borrower',
      subtitle:
          '${row['borrowerPhone'] ?? ''} · ${row['loanNumber'] ?? ''}',
      meta: at == null
          ? 'Callback due'
          : '${overdue ? 'Overdue — was due' : 'Due'} ${DateFormat('d MMM, HH:mm').format(at.toLocal())}',
    );
  }

  Widget _promiseTile(Map<String, dynamic> row) {
    final date = DateTime.tryParse(row['promisedDate']?.toString() ?? '');
    final amount = double.tryParse(row['promisedAmount']?.toString() ?? '0') ?? 0;
    final overdue = row['state'] == 'OVERDUE';
    return _tile(
      icon: AppIcons.promises,
      tint: overdue ? AppColors.error : AppColors.primary,
      title: row['borrowerName']?.toString() ?? 'Borrower',
      subtitle:
          '${row['borrowerPhone'] ?? ''} · ${row['loanNumber'] ?? ''}',
      meta: date == null
          ? 'TZS ${_money.format(amount)} promised'
          : 'TZS ${_money.format(amount)} due ${DateFormat('d MMM').format(date.toLocal())}',
    );
  }

  Widget _brokenTile(Map<String, dynamic> row) {
    final date = DateTime.tryParse(row['promisedDate']?.toString() ?? '');
    final amount = double.tryParse(row['promisedAmount']?.toString() ?? '0') ?? 0;
    final outstanding =
        double.tryParse(row['outstandingBalance']?.toString() ?? '0') ?? 0;
    final daysLate = (row['daysLate'] as num?)?.toInt();
    return _tile(
      icon: AppIcons.alert,
      tint: AppColors.error,
      title: row['borrowerName']?.toString() ?? 'Borrower',
      subtitle:
          '${row['borrowerPhone'] ?? ''} · ${row['loanNumber'] ?? ''}',
      meta: 'Broke TZS ${_money.format(amount)}'
          '${date == null ? '' : ' due ${DateFormat('d MMM').format(date.toLocal())}'}'
          '${daysLate == null ? '' : ' · $daysLate d late'}',
      trailing: 'TZS ${_money.format(outstanding)}',
    );
  }

  Widget _banner(String message) {
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.errorTint,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.error),
      ),
      child: Row(
        children: [
          const HugeIcon(icon: AppIcons.offline, size: 16, color: AppColors.errorSoft),
          const SizedBox(width: 10),
          Expanded(
            child: Text(message,
                style: const TextStyle(
                    color: AppColors.errorSoft, fontSize: 12)),
          ),
        ],
      ),
    );
  }
}
