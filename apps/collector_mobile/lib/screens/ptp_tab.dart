import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../theme/app_colors.dart';
import '../widgets/ui.dart';
import '../theme/app_icons.dart';

/// Promises and callbacks: what borrowers committed to, and whether they kept it.
///
/// Renegotiated promises and those predating promise tracking are deliberately kept
/// out of the "Broken" tally — neither is a borrower failing, and counting them
/// would make a collector's record look worse than it is.
class PtpTab extends StatefulWidget {
  final Map<String, dynamic> promises;
  final Map<String, dynamic> followUps;
  final bool loading;
  final String? error;
  final Future<void> Function() onRefresh;

  const PtpTab({
    super.key,
    required this.promises,
    required this.followUps,
    required this.loading,
    required this.error,
    required this.onRefresh,
  });

  @override
  State<PtpTab> createState() => _PtpTabState();
}

enum _PtpFilter { due, upcoming, broken, kept }

const _filterLabels = {
  _PtpFilter.due: 'Overdue',
  _PtpFilter.upcoming: 'Upcoming',
  _PtpFilter.broken: 'Broken',
  _PtpFilter.kept: 'Kept',
};

class _PtpTabState extends State<PtpTab> {
  _PtpFilter? _filter;
  final _money = NumberFormat('#,##0', 'en_US');

  /// Opens on whatever needs attention rather than always on "Overdue".
  ///
  /// Landing on an empty tab while five broken promises sit one chip away reads as
  /// "nothing to do", which is the opposite of the truth. Once the collector picks a
  /// filter themselves, that choice sticks.
  _PtpFilter get _selected {
    if (_filter != null) return _filter!;
    if (_count('overdue') > 0) return _PtpFilter.due;
    if (_count('broken') > 0) return _PtpFilter.broken;
    if (_count('pending') > 0) return _PtpFilter.upcoming;
    return _PtpFilter.due;
  }

  List<Map<String, dynamic>> get _all =>
      ((widget.promises['items'] as List?) ?? const [])
          .whereType<Map<String, dynamic>>()
          .toList();

  List<Map<String, dynamic>> get _callbacks =>
      ((widget.followUps['callbacks'] as List?) ?? const [])
          .whereType<Map<String, dynamic>>()
          .toList();

  int _count(String key) =>
      (widget.promises['counts']?[key] as num?)?.toInt() ?? 0;

  /// A broken promise that is genuinely a miss — not renegotiated, not predating
  /// tracking.
  bool _isMiss(Map<String, dynamic> row) {
    if (row['status'] != 'BROKEN') return false;
    final reason = row['resolvedReason'];
    return reason != 'SUPERSEDED' && reason != 'BACKFILL_UNVERIFIED';
  }

  List<Map<String, dynamic>> _filtered() => switch (_selected) {
        _PtpFilter.due => _all.where((r) => r['state'] == 'OVERDUE').toList(),
        _PtpFilter.upcoming =>
          _all.where((r) => r['state'] == 'PENDING').toList(),
        _PtpFilter.broken => _all.where(_isMiss).toList(),
        _PtpFilter.kept =>
          _all.where((r) => r['status'] == 'HONORED').toList(),
      };

  int _filterCount(_PtpFilter filter) => switch (filter) {
        _PtpFilter.due => _count('overdue'),
        _PtpFilter.upcoming => _count('pending'),
        _PtpFilter.broken => _count('broken'),
        _PtpFilter.kept => _count('honored'),
      };

  @override
  Widget build(BuildContext context) {
    final items = _filtered();

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 20,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Promises',
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w700,
                color: AppColors.text,
              ),
            ),
            Text(
              'TZS ${_money.format(_count('promisedAmount'))} outstanding',
              style: const TextStyle(fontSize: 11, color: AppColors.textMuted),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const HugeIcon(icon: AppIcons.refresh, color: AppColors.primary),
            onPressed: widget.onRefresh,
          ),
          const SizedBox(width: 6),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(50),
          child: SizedBox(
            height: 50,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 20),
              children: _PtpFilter.values.map(_chip).toList(),
            ),
          ),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: widget.onRefresh,
        color: AppColors.primary,
        child: widget.loading && _all.isEmpty
            ? const Center(
                child: CircularProgressIndicator(color: AppColors.primary))
            : ListView(
                padding: const EdgeInsets.fromLTRB(20, 14, 20, 28),
                children: [
                  if (widget.error != null) ...[
                    ErrorBanner(
                        message: widget.error!, onRetry: widget.onRefresh),
                    const SizedBox(height: 16),
                  ],
                  // Callbacks live alongside promises: both are commitments the
                  // collector made or took, and both come due on a date.
                  if (_selected == _PtpFilter.due && _callbacks.isNotEmpty) ...[
                    const SectionLabel('Callbacks you owe'),
                    const SizedBox(height: 10),
                    ..._callbacks.map(_callbackCard),
                    const SizedBox(height: 22),
                    SectionLabel(_filterLabels[_selected]!),
                    const SizedBox(height: 10),
                  ],
                  if (items.isEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 40),
                      child: EmptyState(
                        icon: _emptyIcon(),
                        title: _emptyTitle(),
                        detail: _emptyDetail(),
                      ),
                    )
                  else
                    ...items.map(_promiseCard),
                ],
              ),
      ),
    );
  }

  Widget _chip(_PtpFilter filter) {
    final selected = _selected == filter;
    final count = _filterCount(filter);
    final alarming =
        (filter == _PtpFilter.due || filter == _PtpFilter.broken) && count > 0;
    final tint = alarming ? AppColors.error : AppColors.primary;

    return Padding(
      padding: const EdgeInsets.only(right: 8, bottom: 8),
      child: GestureDetector(
        onTap: () => setState(() => _filter = filter),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 8),
          decoration: BoxDecoration(
            color: selected ? tint : AppColors.surface,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: selected
                  ? tint
                  : (alarming
                      ? AppColors.error.withValues(alpha: 0.4)
                      : AppColors.border),
            ),
          ),
          child: Text(
            '${_filterLabels[filter]} ($count)',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: selected
                  ? Colors.white
                  : (alarming ? AppColors.error : AppColors.textMuted),
            ),
          ),
        ),
      ),
    );
  }

  Widget _promiseCard(Map<String, dynamic> row) {
    final amount = double.tryParse(row['promisedAmount']?.toString() ?? '0') ?? 0;
    final date = DateTime.tryParse(row['promisedDate']?.toString() ?? '');
    final state = row['state']?.toString() ?? 'NONE';
    final status = row['status']?.toString() ?? 'PENDING';
    final phone = row['borrowerPhone']?.toString() ?? '';

    final (tint, label) = switch (status) {
      'HONORED' => (AppColors.primary, 'Kept'),
      'BROKEN' when _isMiss(row) => (AppColors.error, 'Broken'),
      'BROKEN' when row['resolvedReason'] == 'SUPERSEDED' => (
          AppColors.textLabel,
          'Renegotiated'
        ),
      'BROKEN' => (AppColors.textLabel, 'Before tracking'),
      _ when state == 'OVERDUE' => (AppColors.error, 'Overdue'),
      _ => (AppColors.warning, 'Pending'),
    };

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: AppCard(
        borderColor: state == 'OVERDUE' || (status == 'BROKEN' && _isMiss(row))
            ? AppColors.error.withValues(alpha: 0.35)
            : null,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    row['borrowerName']?.toString() ?? 'Borrower',
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: AppColors.text,
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                Pill(label, tint: tint),
              ],
            ),
            const SizedBox(height: 3),
            Text(
              '${row['loanNumber'] ?? ''} · $phone',
              style: const TextStyle(
                color: AppColors.textMuted,
                fontSize: 11,
                fontFamily: 'monospace',
              ),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Text(
                  'TZS ${_money.format(amount)}',
                  style: const TextStyle(
                    color: AppColors.text,
                    fontSize: 15,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(width: 8),
                if (date != null)
                  Text(
                    status == 'HONORED'
                        ? 'promised ${DateFormat('d MMM').format(date.toLocal())}'
                        : 'due ${DateFormat('d MMM').format(date.toLocal())}',
                    style: TextStyle(color: tint, fontSize: 12),
                  ),
                const Spacer(),
                if (phone.isNotEmpty && state != 'NONE')
                  _quickCall(phone),
              ],
            ),
            if (row['notes'] != null &&
                row['notes'].toString().isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                '"${row['notes']}"',
                style: const TextStyle(
                  color: AppColors.textMuted,
                  fontSize: 12,
                  fontStyle: FontStyle.italic,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _callbackCard(Map<String, dynamic> row) {
    final at = DateTime.tryParse(row['followUpAt']?.toString() ?? '');
    final overdue = row['overdue'] == true;
    final phone = row['borrowerPhone']?.toString() ?? '';

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: AppCard(
        borderColor: overdue ? AppColors.error.withValues(alpha: 0.35) : null,
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: (overdue ? AppColors.error : AppColors.warning)
                    .withValues(alpha: 0.10),
                borderRadius: BorderRadius.circular(9),
              ),
              child: HugeIcon(icon: AppIcons.callback,
                size: 16,
                color: overdue ? AppColors.error : AppColors.warning,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    row['borrowerName']?.toString() ?? 'Borrower',
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: AppColors.text,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    at == null
                        ? 'Callback due'
                        : '${overdue ? 'Was due' : 'Due'} '
                            '${DateFormat('d MMM, HH:mm').format(at.toLocal())}',
                    style: TextStyle(
                      color: overdue ? AppColors.error : AppColors.textMuted,
                      fontSize: 11,
                    ),
                  ),
                ],
              ),
            ),
            if (phone.isNotEmpty) _quickCall(phone),
          ],
        ),
      ),
    );
  }

  /// Opens the dialer only. Logging still happens on the case screen, where the
  /// call log can be read and the response recorded.
  Widget _quickCall(String phone) {
    return IconButton(
      visualDensity: VisualDensity.compact,
      icon: const HugeIcon(icon: AppIcons.call, size: 18, color: AppColors.primary),
      tooltip: 'Call $phone',
      onPressed: () async {
        final uri = Uri.parse('tel:$phone');
        if (await canLaunchUrl(uri)) await launchUrl(uri);
      },
    );
  }

  HugeIconData _emptyIcon() => switch (_selected) {
        _PtpFilter.due => AppIcons.calendar,
        _PtpFilter.upcoming => AppIcons.promises,
        _PtpFilter.broken => AppIcons.verified,
        _PtpFilter.kept => AppIcons.money,
      };

  String _emptyTitle() => switch (_selected) {
        _PtpFilter.due => 'Nothing overdue',
        _PtpFilter.upcoming => 'No promises outstanding',
        _PtpFilter.broken => 'No broken promises',
        _PtpFilter.kept => 'No promises kept yet',
      };

  String _emptyDetail() => switch (_selected) {
        _PtpFilter.due => 'No borrower has missed a promised date.',
        _PtpFilter.upcoming =>
          'Promises you secure on a call will be listed here.',
        _PtpFilter.broken =>
          'Renegotiated promises are not counted as broken.',
        _PtpFilter.kept => 'A promise counts as kept once payment arrives.',
      };
}
