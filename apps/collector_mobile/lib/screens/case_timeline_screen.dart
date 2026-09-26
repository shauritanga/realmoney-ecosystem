import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../models/enums.dart';
import '../models/interaction_log.dart';
import '../services/api_service.dart';
import '../theme/app_colors.dart';
import '../utils/call_matching.dart';
import '../theme/app_icons.dart';

/// A case's full contact history.
///
/// The old app showed only the three most recent touches, embedded in the case
/// screen, with no way to see further back — so a collector picking up someone
/// else's case could not tell what had already been tried.
class CaseTimelineScreen extends StatefulWidget {
  final String loanId;
  final String borrowerName;
  final String loanNumber;

  const CaseTimelineScreen({
    super.key,
    required this.loanId,
    required this.borrowerName,
    required this.loanNumber,
  });

  @override
  State<CaseTimelineScreen> createState() => _CaseTimelineScreenState();
}

class _CaseTimelineScreenState extends State<CaseTimelineScreen> {
  final _logs = <InteractionLog>[];
  final _scrollController = ScrollController();

  String? _nextCursor;
  bool _loading = true;
  bool _loadingMore = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    _load();
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent - 200) {
      _loadMore();
    }
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final page = await ApiService.fetchCaseHistory(widget.loanId);
      if (!mounted) return;
      setState(() {
        _logs
          ..clear()
          ..addAll(page.items);
        _nextCursor = page.nextCursor;
        _loading = false;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.message;
        _loading = false;
      });
    }
  }

  Future<void> _loadMore() async {
    if (_loadingMore || _nextCursor == null) return;
    setState(() => _loadingMore = true);
    try {
      final page = await ApiService.fetchCaseHistory(
        widget.loanId,
        before: _nextCursor,
      );
      if (!mounted) return;
      setState(() {
        _logs.addAll(page.items);
        _nextCursor = page.nextCursor;
        _loadingMore = false;
      });
    } on ApiException {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  /// Groups by calendar day so a run of calls on one day reads as one visit.
  List<(String, List<InteractionLog>)> get _days {
    final formatter = DateFormat('EEEE d MMMM yyyy');
    final grouped = <String, List<InteractionLog>>{};
    for (final log in _logs) {
      final key = formatter.format(log.createdAt.toLocal());
      grouped.putIfAbsent(key, () => []).add(log);
    }
    return grouped.entries.map((entry) => (entry.key, entry.value)).toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Contact history', style: TextStyle(fontSize: 15)),
            Text(
              '${widget.borrowerName} · case ${widget.loanNumber}',
              style: const TextStyle(fontSize: 11, color: AppColors.textMuted),
            ),
          ],
        ),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        color: AppColors.primary,
        backgroundColor: AppColors.surface,
        child: _buildBody(),
      ),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(
          child: CircularProgressIndicator(color: AppColors.primary));
    }
    if (_error != null) {
      return ListView(
        children: [
          const SizedBox(height: 80),
          Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                children: [
                  const HugeIcon(icon: AppIcons.offline, color: AppColors.textLabel, size: 32),
                  const SizedBox(height: 12),
                  Text(
                    _error!,
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: AppColors.textMuted, fontSize: 13),
                  ),
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: _load,
                    style: FilledButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        foregroundColor: AppColors.onPrimary),
                    child: const Text('Try again'),
                  ),
                ],
              ),
            ),
          ),
        ],
      );
    }
    if (_logs.isEmpty) {
      return ListView(
        children: const [
          SizedBox(height: 120),
          Center(
            child: Text(
              'No contact yet — be the first touch.',
              style: TextStyle(color: AppColors.textMuted, fontSize: 13),
            ),
          ),
        ],
      );
    }

    final days = _days;
    return ListView.builder(
      controller: _scrollController,
      padding: const EdgeInsets.all(16),
      itemCount: days.length + 1,
      itemBuilder: (context, index) {
        if (index == days.length) {
          if (_loadingMore) {
            return const Padding(
              padding: EdgeInsets.symmetric(vertical: 20),
              child: Center(
                child: SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: AppColors.primary),
                ),
              ),
            );
          }
          return const SizedBox(height: 32);
        }

        final (day, logs) = days[index];
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: EdgeInsets.only(top: index == 0 ? 0 : 20, bottom: 10),
              child: Text(
                day.toUpperCase(),
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.bold,
                  letterSpacing: 0.6,
                  color: AppColors.textLabel,
                ),
              ),
            ),
            ...logs.map(_tile),
          ],
        );
      },
    );
  }

  Widget _tile(InteractionLog log) {
    final (icon, tint) = switch (log.channel) {
      'CALL' => (AppIcons.call, AppColors.channelCall),
      'WHATSAPP' => (AppIcons.whatsapp, AppColors.channelWhatsapp),
      _ => (AppIcons.sms, AppColors.channelSms),
    };

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              HugeIcon(icon: icon, size: 15, color: tint),
              const SizedBox(width: 8),
              Text(
                DateFormat('HH:mm').format(log.createdAt.toLocal()),
                style: const TextStyle(
                  fontSize: 12,
                  fontFamily: 'monospace',
                  color: AppColors.textMuted,
                ),
              ),
              if (log.hasDuration) ...[
                const SizedBox(width: 10),
                Text(
                  formatDuration(log.durationSeconds),
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: AppColors.text,
                  ),
                ),
                const SizedBox(width: 6),
                // Says whether the number was measured or claimed — the same
                // distinction the admin dashboard shows.
                HugeIcon(
                  icon: log.isVerified ? AppIcons.verified : AppIcons.selfReported,
                  size: 12,
                  color: log.isVerified ? AppColors.primary : AppColors.warning,
                ),
              ],
              const Spacer(),
              if (log.connected == true)
                const HugeIcon(icon: AppIcons.success, size: 13, color: AppColors.primary)
              else if (log.isCall && log.connected == false)
                const HugeIcon(icon: AppIcons.noAnswer,
                    size: 13, color: AppColors.textLabel),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            dispositionLabels[log.disposition] ?? log.disposition,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: AppColors.text,
            ),
          ),
          if (log.outcome != null)
            Padding(
              padding: const EdgeInsets.only(top: 3),
              child: Text(
                'Customer: ${outcomeLabels[log.outcome] ?? log.outcome}',
                style: const TextStyle(fontSize: 12, color: AppColors.textDim),
              ),
            ),
          if (log.notes != null && log.notes!.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                '“${log.notes}”',
                style: const TextStyle(
                  fontSize: 12,
                  fontStyle: FontStyle.italic,
                  color: AppColors.textMuted,
                ),
              ),
            ),
          if (log.followUpAt != null)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                'Callback set for ${DateFormat('d MMM, HH:mm').format(log.followUpAt!.toLocal())}',
                style: const TextStyle(fontSize: 11, color: AppColors.warningSoft),
              ),
            ),
          const SizedBox(height: 6),
          Text(
            log.isSystem
                ? 'Automatic system event'
                : (log.collectorName ?? 'Collector'),
            style: const TextStyle(fontSize: 10, color: AppColors.textLabel),
          ),
        ],
      ),
    );
  }
}
