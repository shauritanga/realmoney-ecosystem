import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/enums.dart';
import '../models/interaction_log.dart';
import '../models/loan_assignment.dart';
import '../services/api_service.dart';
import '../services/call_log_service.dart';
import '../theme/app_colors.dart';
import '../utils/call_matching.dart';
import '../utils/collection_levels.dart';
import '../widgets/response_sheet.dart';
import '../widgets/payment_request_dialog.dart';
import 'case_timeline_screen.dart';
import '../theme/app_icons.dart';

/// Case detail: everything a collector can do on one account —
/// call / WhatsApp / SMS / payment request, promise status, contact history.
class CaseDetailScreen extends StatefulWidget {
  final LoanAssignment item;

  const CaseDetailScreen({super.key, required this.item});

  @override
  State<CaseDetailScreen> createState() => _CaseDetailScreenState();
}

/// Shorter than this away from the app and no call can plausibly have been placed
/// and ended -- the collector backed out of the dialer.
const _minimumCallRoundTrip = Duration(seconds: 7);

class _CaseDetailScreenState extends State<CaseDetailScreen>
    with WidgetsBindingObserver {
  late LoanAssignment _item;
  final currencyFormat = NumberFormat('#,##0', 'en_US');

  /// Where to start searching the call log. Backdated a few seconds to absorb clock
  /// skew between the app and the dialer.
  DateTime? _dialStartedAt;

  /// When the dialer was actually opened. Kept separate from [_dialStartedAt]:
  /// measuring "was the collector away long enough to have called?" against a
  /// deliberately backdated timestamp would subtract the skew allowance from the
  /// threshold.
  DateTime? _dialLaunchedAt;
  String? _dialedPhone;
  bool _awaitingCallReturn = false;

  /// Set while the call log is being polled, so the screen can say why it is busy.
  bool _readingCallLog = false;

  @override
  void initState() {
    super.initState();
    _item = widget.item;
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  /// Fetches just this case. The old version re-pulled the whole queue and picked
  /// itself out of it, which also meant a case could not be opened from anywhere
  /// that was not the queue.
  Future<void> _refresh() async {
    try {
      final data = await ApiService.fetchCase(_item.loanId);
      if (!mounted) return;
      setState(() => _item = LoanAssignment.fromCaseJson(data));
    } catch (_) {
      // Keep showing the last known state on network errors.
    }
  }

  String _messageText() {
    final amount = currencyFormat.format(_item.outstandingBalance);
    if (isPreDue(_item.level)) {
      final due = _item.dueDate.length >= 10
          ? _item.dueDate.substring(0, 10)
          : _item.dueDate;
      return 'Habari ${_item.borrowerName}, kumbusho kutoka RealMoney: mkopo wako namba ${_item.loanNumber} wa TZS $amount unastahili tarehe $due. Tafadhali lipa mapema kupitia simu yako ili kuepuka faini. Asante!';
    }
    return 'Habari ${_item.borrowerName}, hili ni kumbusho kutoka RealMoney kuhusu deni lako la mkopo namba ${_item.loanNumber} la TZS $amount lililochelewa kwa siku ${_item.daysOverdue}. Tafadhali lipa kupitia simu yako au wasiliana nasi.${_extensionClause()}';
  }

  /// Offers the extension in the overdue message, when one is actually available.
  ///
  /// Neither existing template fits an extension on its own: both say *lipa* — pay
  /// the whole thing — and the pre-due one promises penalty avoidance, which an
  /// extension does not deliver. Appending it to the overdue message puts the offer
  /// exactly where it is relevant, and states plainly that the fee buys time rather
  /// than reducing the debt, which is what borrowers most often misunderstand.
  String _extensionClause() {
    final offer = _item.extensionOffer;
    if (offer == null || !offer.eligible) return '';
    final fee = currencyFormat.format(offer.fee);
    final newDue = DateFormat('d/M/yyyy').format(offer.newDueDate.toLocal());
    return ' Kama huwezi kulipa yote sasa, unaweza kuongeza muda hadi $newDue '
        'kwa kulipa TZS $fee. Ada hii huongeza muda tu, haipunguzi deni lako.';
  }

  /// Places a call and arms the lifecycle observer to read its real duration.
  ///
  /// The old version opened the disposition dialog immediately and unconditionally —
  /// even when `canLaunchUrl` returned false — so a "logged call" did not mean a call
  /// had happened, and no duration was ever captured.
  Future<void> _handleCall() async {
    final uri = Uri.parse('tel:${_item.borrowerPhone}');
    if (!await canLaunchUrl(uri)) {
      if (mounted) _snackDialerFailed();
      return;
    }

    // Permission first, while this screen is still in front. Asking after the
    // dialer opens puts the system prompt behind it, so it surfaces on return and
    // collides with the response sheet — and the dial timestamp below would be
    // stamped however long the collector took to answer it, by which point the call
    // it is meant to find has already started.
    await _ensureCallLogAccess();
    if (!mounted) return;

    final now = DateTime.now();
    _dialLaunchedAt = now;
    _dialStartedAt = now.subtract(const Duration(seconds: 5));
    _dialedPhone = _item.borrowerPhone;
    _awaitingCallReturn = true;

    if (!await launchUrl(uri)) {
      // Nothing was opened, so nothing is coming back to observe.
      _awaitingCallReturn = false;
      if (mounted) _snackDialerFailed();
    }
  }

  void _snackDialerFailed() {
    _snack(
      'Could not open the dialer. Call ${_item.borrowerPhone} yourself, then tap '
      '"Record outcome".',
    );
  }

  /// Asks for call-log access the first time it is needed, explaining why.
  ///
  /// Never at launch, and never blocking: a collector who declines still gets to make
  /// the call and report the outcome themselves.
  Future<void> _ensureCallLogAccess() async {
    if (!CallLogService.isSupported) return;
    if (await CallLogService.hasPermission()) return;
    if (await CallLogService.isPermanentlyDenied()) return;
    if (!mounted) return;

    final agreed = await showModalBottomSheet<bool>(
      context: context,
      builder: (context) => Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Record call length automatically?',
              style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: AppColors.text),
            ),
            const SizedBox(height: 10),
            const Text(
              'RealMoney can read your phone\'s call log so your talk time is '
              'recorded for you and you never have to type it in. We only read '
              'calls to numbers in your assigned queue.',
              style: TextStyle(fontSize: 13, color: AppColors.textMuted),
            ),
            const SizedBox(height: 18),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => Navigator.of(context).pop(false),
                    child: const Text('Not now',
                        style: TextStyle(color: AppColors.textMuted)),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton(
                    onPressed: () => Navigator.of(context).pop(true),
                    style: FilledButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        foregroundColor: AppColors.onPrimary),
                    child: const Text('Allow'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );

    if (agreed == true) await CallLogService.requestPermission();
  }

  /// Reads the call log when the collector comes back from the dialer.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed || !_awaitingCallReturn) return;
    _awaitingCallReturn = false;
    final phone = _dialedPhone;
    final since = _dialStartedAt;
    final launchedAt = _dialLaunchedAt;
    if (phone == null || since == null || launchedAt == null) return;

    // A collector back within a few seconds never placed a call — they dismissed the
    // dialer. Offering a full response sheet would invite logging a call that did
    // not happen. Measured from the launch instant, not the backdated search window.
    if (DateTime.now().difference(launchedAt) < _minimumCallRoundTrip) {
      _snack('No call detected. Tap "Record outcome" if you called another way.');
      return;
    }

    unawaited(_readEvidenceAndPrompt(phone: phone, since: since));
  }

  Future<void> _readEvidenceAndPrompt({
    required String phone,
    required DateTime since,
  }) async {
    if (mounted) setState(() => _readingCallLog = true);
    final evidence = await CallLogService.findCall(phone: phone, since: since);
    if (!mounted) return;
    setState(() => _readingCallLog = false);
    _showResponseSheet('CALL', evidence: evidence);
  }

  Future<void> _handleWhatsApp() async {
    final phone = _item.borrowerPhone.replaceAll(RegExp(r'[^0-9]'), '');
    final uri =
        Uri.parse('https://wa.me/$phone?text=${Uri.encodeComponent(_messageText())}');
    if (!await canLaunchUrl(uri) || !await launchUrl(uri, mode: LaunchMode.externalApplication)) {
      if (mounted) _snack('Could not open WhatsApp on this phone.');
      return;
    }
    if (mounted) _showResponseSheet('WHATSAPP');
  }

  Future<void> _handleSms() async {
    final uri = Uri.parse(
        'sms:${_item.borrowerPhone}?body=${Uri.encodeComponent(_messageText())}');
    if (!await canLaunchUrl(uri) || !await launchUrl(uri)) {
      if (mounted) _snack('Could not open the messaging app.');
      return;
    }
    if (mounted) _showResponseSheet('SMS');
  }

  void _showResponseSheet(
    String channel, {
    CallEvidence evidence = CallEvidence.none,
    bool manualEntry = false,
  }) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => ResponseSheet(
        loanId: _item.loanId,
        borrowerName: _item.borrowerName,
        loanNumber: _item.loanNumber,
        channel: channel,
        outstandingBalance: _item.outstandingBalance,
        evidence: evidence,
        manualEntry: manualEntry,
        onSaved: _refresh,
      ),
    );
  }

  void _snack(String message) {
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  void _openTimeline() {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => CaseTimelineScreen(
          loanId: _item.loanId,
          borrowerName: _item.borrowerName,
          loanNumber: _item.loanNumber,
        ),
      ),
    );
  }

  void _showPaymentRequest() {
    showDialog(
      context: context,
      builder: (_) => PaymentRequestDialog(
        loanId: _item.loanId,
        borrowerName: _item.borrowerName,
        borrowerPhone: _item.borrowerPhone,
        defaultAmount: _item.outstandingBalance,
        // Already priced by the case payload, so the extension tab opens with a fee
        // rather than a spinner.
        extension: _item.extensionOffer,
        onPaymentTriggered: _refresh,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final preDue = isPreDue(_item.level);
    final broken = ptpBroken(_item);
    final ptp = _item.activePtp;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.surface,
        iconTheme: const IconThemeData(color: AppColors.text),
        title: Text(
          'Case ${_item.loanNumber}',
          style: const TextStyle(
              color: AppColors.text,
              fontSize: 17,
              fontWeight: FontWeight.bold,
              fontFamily: 'monospace'),
        ),
        actions: [
          IconButton(
            icon: const HugeIcon(icon: AppIcons.refresh, color: AppColors.primary),
            onPressed: _refresh,
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Borrower header
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: AppColors.border),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Text(
                          _item.borrowerName,
                          style: const TextStyle(
                              color: AppColors.text,
                              fontSize: 20,
                              fontWeight: FontWeight.bold),
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 5),
                        decoration: BoxDecoration(
                          color: preDue
                              ? AppColors.successTint
                              : AppColors.errorTint,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(
                              color: preDue
                                  ? AppColors.primary
                                  : AppColors.error),
                        ),
                        child: Text(
                          'LVL ${_item.levelLabel} • ${levelStatusText(_item)}',
                          style: TextStyle(
                              color: preDue
                                  ? AppColors.primary
                                  : AppColors.error,
                              fontSize: 12,
                              fontWeight: FontWeight.bold),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  SelectableText(
                    _item.borrowerPhone,
                    style: const TextStyle(
                        color: AppColors.primary,
                        fontSize: 15,
                        fontFamily: 'monospace'),
                  ),
                  if (_item.borrowerAddress.isNotEmpty &&
                      _item.borrowerAddress != 'N/A')
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(_item.borrowerAddress,
                          style: const TextStyle(
                              color: AppColors.textMuted, fontSize: 12)),
                    ),
                  const Divider(
                      color: AppColors.border, height: 28),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      _money('Outstanding',
                          'TZS ${currencyFormat.format(_item.outstandingBalance)}',
                          preDue ? AppColors.primary : AppColors.error),
                      _money('Principal',
                          'TZS ${currencyFormat.format(_item.principalAmount)}',
                          AppColors.textMuted),
                      if (_item.penaltyAmount > 0)
                        _money('Penalty',
                            'TZS ${currencyFormat.format(_item.penaltyAmount)}',
                            AppColors.warningSoft),
                    ],
                  ),
                  if (_dueDate != null) ...[
                    const SizedBox(height: 14),
                    _dueDateLine(),
                  ],
                ],
              ),
            ),

            // PTP banner
            if (ptp != null) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: broken
                      ? AppColors.errorTint
                      : const Color(0x1110B981),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                      color: broken
                          ? AppColors.error
                          : const Color(0x3310B981)),
                ),
                child: Row(
                  children: [
                    HugeIcon(
                        icon: broken
                            ? AppIcons.alert
                            : AppIcons.promises,
                        color: broken
                            ? AppColors.error
                            : AppColors.primary,
                        size: 18),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        broken
                            ? 'PTP BROKEN — TZS ${currencyFormat.format(ptp.promisedAmount)} was due ${DateFormat('d MMM').format(ptp.promisedDate.toLocal())}. Escalate now.'
                            : 'PTP: TZS ${currencyFormat.format(ptp.promisedAmount)} due ${DateFormat('d MMM').format(ptp.promisedDate.toLocal())}',
                        style: TextStyle(
                            color: broken
                                ? AppColors.error
                                : AppColors.primary,
                            fontSize: 12,
                            fontWeight: FontWeight.bold),
                      ),
                    ),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 16),

            // Actions
            const Text('CONTACT ACTIONS',
                style: TextStyle(
                    color: AppColors.textLabel,
                    fontSize: 11,
                    fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 10,
              crossAxisSpacing: 10,
              childAspectRatio: 2.4,
              children: [
                _actionBtn(AppIcons.call, 'Call', AppColors.channelCall,
                    Colors.white, _handleCall),
                _actionBtn(AppIcons.whatsapp, 'WhatsApp',
                    AppColors.channelWhatsapp, Colors.white, _handleWhatsApp),
                _actionBtn(AppIcons.sms, 'SMS', AppColors.channelSms,
                    Colors.white, _handleSms),
                _actionBtn(AppIcons.ussd, 'Request payment',
                    AppColors.warning, Colors.white, _showPaymentRequest),
              ],
            ),
            if (_readingCallLog)
              Container(
                margin: const EdgeInsets.only(top: 10),
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: AppColors.surfaceMuted,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppColors.border),
                ),
                child: const Row(
                  children: [
                    SizedBox(
                      width: 14,
                      height: 14,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: AppColors.primary),
                    ),
                    SizedBox(width: 10),
                    Text('Reading call length…',
                        style:
                            TextStyle(color: AppColors.textMuted, fontSize: 12)),
                  ],
                ),
              ),
            const SizedBox(height: 10),
            // Always available: if the app missed the return from a call, or the
            // collector dialled from their contacts, the touch can still be logged.
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: () =>
                    _showResponseSheet('CALL', manualEntry: true),
                style: OutlinedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  side: const BorderSide(color: AppColors.border),
                ),
                icon: const HugeIcon(icon: AppIcons.record,
                    size: 16, color: AppColors.textMuted),
                label: const Text('Record outcome',
                    style: TextStyle(color: AppColors.textMuted, fontSize: 13)),
              ),
            ),
            const SizedBox(height: 20),

            // Contact history
            Row(
              children: [
                const Text('RECENT CONTACT',
                    style: TextStyle(
                        color: AppColors.textLabel,
                        fontSize: 11,
                        fontWeight: FontWeight.bold)),
                const Spacer(),
                GestureDetector(
                  onTap: _openTimeline,
                  child: const Row(
                    children: [
                      Text('Full history',
                          style: TextStyle(
                              color: AppColors.primary,
                              fontSize: 12,
                              fontWeight: FontWeight.w600)),
                      HugeIcon(icon: AppIcons.chevron,
                          size: 16, color: AppColors.primary),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            if (_item.recentInteractions.isEmpty)
              Container(
                padding: const EdgeInsets.all(20),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: AppColors.border),
                ),
                child: const Text('No contact yet — be the first touch.',
                    style: TextStyle(
                        color: AppColors.textLabel, fontSize: 12)),
              )
            else
              ..._item.recentInteractions.map(_historyTile),
          ],
        ),
      ),
    );
  }

  /// The due date, parsed once. Null when the payload carried none.
  DateTime? get _dueDate => DateTime.tryParse(_item.dueDate)?.toLocal();

  /// When a loan has been extended the due date on screen is not the one the borrower
  /// originally agreed to, and a collector who does not know that will misread the
  /// case entirely. So the line names both, and how many times it has been bought.
  Widget _dueDateLine() {
    final due = _dueDate!;
    final extended = _item.isExtended;
    final original = DateTime.tryParse(_item.originalDueDate ?? '')?.toLocal();

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: extended ? AppColors.warningTint : AppColors.surfaceMuted,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: extended ? AppColors.warning : AppColors.border,
        ),
      ),
      child: Row(
        children: [
          HugeIcon(
            icon: AppIcons.calendar,
            color: extended ? AppColors.warningSoft : AppColors.textMuted,
            size: 16,
          ),
          const SizedBox(width: 9),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Due ${DateFormat('d MMM yyyy').format(due)}',
                  style: TextStyle(
                    color: extended ? AppColors.warningSoft : AppColors.text,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (extended)
                  Text(
                    'Extended ${_item.extensionCount}'
                    '${original != null ? ' · originally ${DateFormat('d MMM').format(original)}' : ''}',
                    style: const TextStyle(color: AppColors.warningSoft, fontSize: 11.5),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _money(String label, String value, Color color) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label,
            style: const TextStyle(
                color: AppColors.textLabel, fontSize: 11)),
        const SizedBox(height: 2),
        Text(value,
            style: TextStyle(
                color: color,
                fontSize: 15,
                fontWeight: FontWeight.bold)),
      ],
    );
  }

  Widget _actionBtn(
      HugeIconData icon, String label, Color bg, Color fg,
      VoidCallback onTap) {
    return ElevatedButton.icon(
      onPressed: onTap,
      icon: HugeIcon(icon: icon, size: 18, color: fg),
      label: Text(label,
          style: TextStyle(
              fontSize: 13, color: fg, fontWeight: FontWeight.bold)),
      style: ElevatedButton.styleFrom(
        backgroundColor: bg,
        shape:
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }

  Widget _historyTile(InteractionLog log) {
    final (icon, tint) = switch (log.channel) {
      'CALL' => (AppIcons.call, AppColors.channelCall),
      'WHATSAPP' => (AppIcons.whatsapp, AppColors.channelWhatsapp),
      _ => (AppIcons.sms, AppColors.channelSms),
    };

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              HugeIcon(icon: icon, size: 14, color: tint),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  dispositionLabels[log.disposition] ?? log.disposition,
                  style: const TextStyle(
                      color: AppColors.text,
                      fontSize: 12,
                      fontWeight: FontWeight.bold),
                ),
              ),
              if (log.hasDuration) ...[
                Text(
                  formatDuration(log.durationSeconds),
                  style: const TextStyle(
                      color: AppColors.textDim,
                      fontSize: 11,
                      fontFamily: 'monospace'),
                ),
                const SizedBox(width: 4),
                // Distinguishes a measured duration from a claimed one.
                HugeIcon(
                  icon: log.isVerified ? AppIcons.verified : AppIcons.selfReported,
                  size: 11,
                  color: log.isVerified ? AppColors.primary : AppColors.warning,
                ),
                const SizedBox(width: 8),
              ],
              Text(
                DateFormat('d MMM HH:mm').format(log.createdAt.toLocal()),
                style: const TextStyle(
                    color: AppColors.textLabel,
                    fontSize: 11,
                    fontFamily: 'monospace'),
              ),
            ],
          ),
          if (log.outcome != null) ...[
            const SizedBox(height: 4),
            Text(
              'Customer: ${outcomeLabels[log.outcome] ?? log.outcome}',
              style: const TextStyle(color: AppColors.textDim, fontSize: 11),
            ),
          ],
          if (log.notes != null && log.notes!.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(log.notes!,
                style: const TextStyle(color: AppColors.textMuted, fontSize: 12)),
          ],
        ],
      ),
    );
  }
}
