import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../models/loan_assignment.dart';
import '../theme/app_colors.dart';
import '../utils/call_matching.dart';
import '../utils/collection_levels.dart';
import '../theme/app_icons.dart';

/// One case in the queue.
///
/// The old row showed only the loan number, phone and a level chip — nothing a
/// collector could triage on. Name, amount owed, last contact and promise state are
/// what decide which case to work next.
class CaseRow extends StatelessWidget {
  final LoanAssignment item;
  final VoidCallback onTap;

  const CaseRow({super.key, required this.item, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final money = NumberFormat('#,##0', 'en_US');
    final preDue = isPreDue(item.level);

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: item.ptpOverdue ? AppColors.error : AppColors.border,
          ),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      if (item.workedToday) ...[
                        const HugeIcon(icon: AppIcons.success,
                            size: 14, color: AppColors.primary),
                        const SizedBox(width: 6),
                      ],
                      Expanded(
                        child: Text(
                          item.borrowerName,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: AppColors.text,
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      // A case that has already been rolled reads very differently
                      // from a fresh one, so it is marked before the level chip.
                      if (item.isExtended) ...[
                        _chip('EXT ${item.extensionCount}', AppColors.warningSoft),
                        const SizedBox(width: 5),
                      ],
                      _chip(
                        item.levelLabel,
                        preDue ? AppColors.primary : AppColors.error,
                      ),
                    ],
                  ),
                  const SizedBox(height: 3),
                  Text(
                    '${item.loanNumber} · ${item.borrowerPhone}',
                    style: const TextStyle(
                      color: AppColors.textMuted,
                      fontSize: 11,
                      fontFamily: 'monospace',
                    ),
                  ),
                  const SizedBox(height: 7),
                  Row(
                    children: [
                      Text(
                        'TZS ${money.format(item.outstandingBalance)}',
                        style: const TextStyle(
                          color: AppColors.errorSoft,
                          fontSize: 13,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Text(
                        _contactSummary(),
                        style: const TextStyle(
                            color: AppColors.textLabel, fontSize: 11),
                      ),
                    ],
                  ),
                  if (item.ptpState != 'NONE') ...[
                    const SizedBox(height: 7),
                    _ptpPill(money),
                  ],
                ],
              ),
            ),
            const HugeIcon(icon: AppIcons.chevron, color: AppColors.textLabel, size: 20),
          ],
        ),
      ),
    );
  }

  /// What has already been tried today, so a collector does not re-dial someone
  /// a colleague just spoke to.
  String _contactSummary() {
    if (item.lastContactAt == null) return 'no contact yet';
    final parts = <String>[_relative(item.lastContactAt!)];
    if (item.touchesToday > 0) {
      parts.add('${item.touchesToday} today');
    }
    if (item.talkTimeTodaySeconds > 0) {
      parts.add(formatDuration(item.talkTimeTodaySeconds));
    }
    return parts.join(' · ');
  }

  static String _relative(DateTime at) {
    final elapsed = DateTime.now().difference(at);
    if (elapsed.inMinutes < 1) return 'just now';
    if (elapsed.inMinutes < 60) return '${elapsed.inMinutes}m ago';
    if (elapsed.inHours < 24) return '${elapsed.inHours}h ago';
    return '${elapsed.inDays}d ago';
  }

  Widget _ptpPill(NumberFormat money) {
    final ptp = item.activePtp;
    if (ptp == null) return const SizedBox.shrink();
    final overdue = item.ptpOverdue;
    final tint = overdue ? AppColors.error : AppColors.primary;
    final date = DateFormat('d MMM').format(ptp.promisedDate.toLocal());

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: tint.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: tint.withValues(alpha: 0.5)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          HugeIcon(icon: overdue ? AppIcons.alert : AppIcons.promises,
              size: 11, color: tint),
          const SizedBox(width: 5),
          Text(
            overdue
                ? 'Broke promise — TZS ${money.format(ptp.promisedAmount)}, $date'
                : 'Promised TZS ${money.format(ptp.promisedAmount)} · $date',
            style: TextStyle(
                color: tint, fontSize: 10, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }

  Widget _chip(String text, Color tint) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: tint.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        text,
        style:
            TextStyle(color: tint, fontSize: 10, fontWeight: FontWeight.bold),
      ),
    );
  }
}
