import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:uuid/uuid.dart';

import '../models/enums.dart';
import '../services/api_service.dart';
import '../theme/app_colors.dart';
import '../utils/call_matching.dart';
import '../utils/response_validation.dart';
import '../theme/app_icons.dart';

/// Records what happened on a contact attempt.
///
/// Replaces `disposition_dialog.dart`, which had no `Form`, no validators, and
/// fired the instant the dialer intent was handed off — so a "logged call" did not
/// mean a call happened, and a `PROMISED_TO_PAY` with an unparseable amount silently
/// created no promise while telling the collector it had succeeded.
class ResponseSheet extends StatefulWidget {
  final String loanId;
  final String borrowerName;
  final String loanNumber;
  final String channel;
  final double outstandingBalance;

  /// What the device call log said, when it could be read.
  final CallEvidence evidence;

  /// True when the collector opened this manually rather than returning from a call.
  final bool manualEntry;

  final VoidCallback onSaved;

  const ResponseSheet({
    super.key,
    required this.loanId,
    required this.borrowerName,
    required this.loanNumber,
    required this.channel,
    required this.outstandingBalance,
    required this.onSaved,
    this.evidence = CallEvidence.none,
    this.manualEntry = false,
  });

  @override
  State<ResponseSheet> createState() => _ResponseSheetState();
}

class _ResponseSheetState extends State<ResponseSheet> {
  final _formKey = GlobalKey<FormState>();
  final _amountController = TextEditingController();
  final _notesController = TextEditingController();
  final _durationController = TextEditingController();

  /// Generated once per sheet, so a retry after a timeout updates the same record
  /// instead of logging a second call.
  final _clientRef = const Uuid().v4();

  bool _reached = true;
  String? _outcome;
  String _disposition = 'PROMISED_TO_PAY';
  DateTime? _ptpDate;
  DateTime? _callbackAt;

  bool _saving = false;
  String? _error;

  bool get _isCall => widget.channel == 'CALL';
  bool get _verified => widget.evidence.isVerified;

  @override
  void initState() {
    super.initState();
    _amountController.text = widget.outstandingBalance.round().toString();
    _ptpDate = DateTime.now().add(const Duration(days: 1));

    // A verified call tells us whether it connected, so don't ask.
    if (_verified) {
      _reached = widget.evidence.callOutcome == 'ANSWERED';
      if (!_reached) {
        _disposition = 'UNREACHABLE';
        _outcome = widget.evidence.callOutcome == 'DECLINED' ? 'OTHER' : 'NO_ANSWER';
      }
    }
    // Messages are an attempt, not a conversation.
    if (!_isCall) {
      _reached = false;
      _disposition = 'UNREACHABLE';
    }
  }

  @override
  void dispose() {
    _amountController.dispose();
    _notesController.dispose();
    _durationController.dispose();
    super.dispose();
  }

  List<String> get _outcomeOptions => _reached ? reachedOutcomes : unreachedOutcomes;
  bool get _needsOutcome => outcomeRequiredFor.contains(_disposition);
  bool get _isPtp => _disposition == 'PROMISED_TO_PAY';
  bool get _isCallback => _disposition == 'CALLBACK_REQUESTED';

  Future<void> _submit() async {
    setState(() => _error = null);
    if (!(_formKey.currentState?.validate() ?? false)) return;

    if (_needsOutcome && _outcome == null) {
      setState(() => _error = 'Record what the customer said.');
      return;
    }
    if (_isPtp) {
      final dateError = validatePtpDate(_ptpDate);
      if (dateError != null) {
        setState(() => _error = dateError);
        return;
      }
    }
    if (_isCallback) {
      final callbackError = validateCallback(_callbackAt);
      if (callbackError != null) {
        setState(() => _error = callbackError);
        return;
      }
    }

    setState(() => _saving = true);
    try {
      final manualSeconds = int.tryParse(_durationController.text.trim());
      final seconds = _verified ? widget.evidence.durationSeconds : manualSeconds;

      await ApiService.logInteraction(
        loanId: widget.loanId,
        channel: widget.channel,
        disposition: _disposition,
        clientRef: _clientRef,
        outcome: _outcome,
        notes: _notesController.text,
        durationSeconds: _isCall ? seconds : null,
        durationSource: _isCall
            ? (_verified
                ? 'CALL_LOG'
                : (seconds != null && seconds > 0 ? 'MANUAL' : 'NONE'))
            : null,
        callOutcome: _isCall
            ? (_verified
                ? widget.evidence.callOutcome
                : (_reached ? 'ANSWERED' : 'NO_ANSWER'))
            : null,
        followUpAt: _isCallback ? _callbackAt?.toUtc().toIso8601String() : null,
        ptpAmount: _isPtp
            ? double.tryParse(_amountController.text.replaceAll(',', '').trim())
            : null,
        ptpDate: _isPtp ? _ptpDate?.toUtc().toIso8601String() : null,
      );

      if (!mounted) return;
      Navigator.of(context).pop();
      widget.onSaved();
    } on ApiException catch (error) {
      // Keep the sheet open with everything the collector typed intact — they can
      // retry without re-entering it. Online-only means failing visibly, not
      // failing destructively.
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final inset = MediaQuery.of(context).viewInsets.bottom;

    return Padding(
      padding: EdgeInsets.only(bottom: inset),
      child: DraggableScrollableSheet(
        initialChildSize: 0.92,
        minChildSize: 0.5,
        maxChildSize: 0.95,
        expand: false,
        builder: (context, scrollController) => Form(
          key: _formKey,
          child: ListView(
            controller: scrollController,
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: AppColors.surfaceMuted,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Text(
                widget.borrowerName,
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w600,
                  color: AppColors.text,
                ),
              ),
              Text(
                'Case ${widget.loanNumber}',
                style: const TextStyle(
                  fontSize: 12,
                  fontFamily: 'monospace',
                  color: AppColors.textMuted,
                ),
              ),
              const SizedBox(height: 16),
              _evidenceHeader(),
              if (_isCall && !_verified) ...[
                const SizedBox(height: 16),
                _label('DID YOU REACH THE CUSTOMER?'),
                const SizedBox(height: 8),
                _reachedToggle(),
                const SizedBox(height: 12),
                TextFormField(
                  key: const Key('response.duration'),
                  controller: _durationController,
                  keyboardType: TextInputType.number,
                  validator: validateManualDuration,
                  style: const TextStyle(color: AppColors.text, fontSize: 14),
                  decoration: const InputDecoration(
                    labelText: 'Call length in seconds (optional)',
                    labelStyle: TextStyle(color: AppColors.textMuted, fontSize: 12),
                    isDense: true,
                  ),
                ),
              ],
              const SizedBox(height: 20),
              _label('WHAT DID THE CUSTOMER SAY?'),
              const SizedBox(height: 8),
              _outcomeChips(),
              const SizedBox(height: 20),
              _label('ACTION TAKEN'),
              const SizedBox(height: 8),
              _dispositionDropdown(),
              if (_isPtp) ...[
                const SizedBox(height: 16),
                _ptpFields(),
              ],
              if (_isCallback) ...[
                const SizedBox(height: 16),
                _callbackField(),
              ],
              const SizedBox(height: 20),
              _label(_disposition == 'PAID' ? 'NOTES (REQUIRED)' : 'NOTES'),
              const SizedBox(height: 8),
              TextFormField(
                key: const Key('response.notes'),
                controller: _notesController,
                maxLines: 4,
                maxLength: 500,
                validator: (value) =>
                    validateNotes(value, disposition: _disposition),
                style: const TextStyle(color: AppColors.text, fontSize: 13),
                decoration: const InputDecoration(
                  hintText: 'What did they say, and what happens next?',
                  isDense: true,
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppColors.errorTint,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AppColors.error),
                  ),
                  child: Row(
                    children: [
                      const HugeIcon(icon: AppIcons.alert,
                          color: AppColors.errorSoft, size: 16),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          _error!,
                          style: const TextStyle(
                              color: AppColors.errorSoft, fontSize: 12),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 20),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed:
                          _saving ? null : () => Navigator.of(context).pop(),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        side: const BorderSide(color: AppColors.border),
                      ),
                      child: const Text('Cancel',
                          style: TextStyle(color: AppColors.textMuted)),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: FilledButton(
                      onPressed: _saving ? null : _submit,
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        foregroundColor: AppColors.onPrimary,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                      ),
                      child: _saving
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(
                                  strokeWidth: 2, color: AppColors.onPrimary),
                            )
                          : Text(
                              _error == null ? 'Save response' : 'Retry',
                              style: const TextStyle(fontWeight: FontWeight.bold),
                            ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// States plainly whether the duration was measured or claimed — the same
  /// distinction the admin dashboard surfaces.
  Widget _evidenceHeader() {
    if (!_isCall) {
      final label = widget.channel == 'SMS' ? 'SMS' : 'WhatsApp';
      return _banner(
        icon: AppIcons.sms,
        tint: AppColors.channelSms,
        title: '$label handed to your phone',
        subtitle: 'Logged as initiated — delivery cannot be confirmed.',
      );
    }
    if (_verified) {
      final connected = widget.evidence.callOutcome == 'ANSWERED';
      return _banner(
        icon: connected ? AppIcons.success : AppIcons.noAnswer,
        tint: connected ? AppColors.primary : AppColors.warning,
        title: connected
            ? 'Connected · ${formatDuration(widget.evidence.durationSeconds)}'
            : callOutcomeLabels[widget.evidence.callOutcome] ?? 'Not connected',
        subtitle: 'Verified from your call log',
        locked: true,
      );
    }
    return _banner(
      icon: AppIcons.selfReported,
      tint: AppColors.warning,
      title: widget.manualEntry ? 'Recording manually' : 'No call found in the log',
      subtitle: 'Self-reported — tell us what happened.',
    );
  }

  Widget _banner({
    required HugeIconData icon,
    required Color tint,
    required String title,
    required String subtitle,
    bool locked = false,
  }) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surfaceMuted,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: tint.withValues(alpha: 0.5)),
      ),
      child: Row(
        children: [
          HugeIcon(icon: icon, color: tint, size: 20),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style: const TextStyle(
                        color: AppColors.text,
                        fontSize: 14,
                        fontWeight: FontWeight.w600)),
                const SizedBox(height: 2),
                Text(subtitle,
                    style: const TextStyle(
                        color: AppColors.textMuted, fontSize: 11)),
              ],
            ),
          ),
          if (locked)
            const HugeIcon(icon: AppIcons.locked, size: 14, color: AppColors.textLabel),
        ],
      ),
    );
  }

  Widget _label(String text) => Text(
        text,
        style: const TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.bold,
          letterSpacing: 0.6,
          color: AppColors.textLabel,
        ),
      );

  Widget _reachedToggle() {
    return Row(
      children: [
        for (final option in [true, false])
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(right: option ? 8 : 0),
              child: GestureDetector(
                onTap: () => setState(() {
                  _reached = option;
                  // The outcome list changes with reachability, so a stale pick
                  // would submit a value the new list does not offer.
                  _outcome = null;
                  if (!option && _disposition == 'PROMISED_TO_PAY') {
                    _disposition = 'UNREACHABLE';
                  }
                }),
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: _reached == option
                        ? AppColors.primary.withValues(alpha: 0.15)
                        : AppColors.surfaceMuted,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: _reached == option
                          ? AppColors.primary
                          : AppColors.border,
                    ),
                  ),
                  child: Text(
                    option ? 'Yes, I spoke to them' : 'No',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: _reached == option
                          ? AppColors.primary
                          : AppColors.textMuted,
                    ),
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }

  Widget _outcomeChips() {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: _outcomeOptions.map((code) {
        final selected = _outcome == code;
        return GestureDetector(
          onTap: () => setState(() => _outcome = selected ? null : code),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
            decoration: BoxDecoration(
              color: selected
                  ? AppColors.primary.withValues(alpha: 0.15)
                  : AppColors.surfaceMuted,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: selected ? AppColors.primary : AppColors.border,
              ),
            ),
            child: Text(
              outcomeLabels[code] ?? code,
              style: TextStyle(
                fontSize: 12,
                fontWeight: selected ? FontWeight.w600 : FontWeight.normal,
                color: selected ? AppColors.primary : AppColors.textDim,
              ),
            ),
          ),
        );
      }).toList(),
    );
  }

  Widget _dispositionDropdown() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        color: AppColors.surfaceMuted,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: _disposition,
          isExpanded: true,
          dropdownColor: AppColors.surface,
          style: const TextStyle(color: AppColors.text, fontSize: 14),
          items: dispositionOrder
              .map((code) => DropdownMenuItem(
                    value: code,
                    child: Text(dispositionLabels[code] ?? code),
                  ))
              .toList(),
          onChanged: (value) {
            if (value == null) return;
            setState(() {
              _disposition = value;
              _error = null;
            });
          },
        ),
      ),
    );
  }

  Widget _ptpFields() {
    final formatter = DateFormat('EEE d MMM yyyy');
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.successTint,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.primary.withValues(alpha: 0.4)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _label('AMOUNT PROMISED'),
          const SizedBox(height: 6),
          TextFormField(
            key: const Key('response.ptpAmount'),
            controller: _amountController,
            keyboardType: TextInputType.number,
            validator: (value) => validatePtpAmount(
              value,
              outstandingBalance: widget.outstandingBalance,
            ),
            style: const TextStyle(
                color: AppColors.text, fontSize: 16, fontWeight: FontWeight.w600),
            decoration: const InputDecoration(
              prefixText: 'TZS ',
              prefixStyle: TextStyle(color: AppColors.textMuted, fontSize: 14),
              isDense: true,
            ),
          ),
          const SizedBox(height: 14),
          _label('DATE THEY WILL PAY'),
          const SizedBox(height: 6),
          GestureDetector(
            onTap: () async {
              final now = DateTime.now();
              final picked = await showDatePicker(
                context: context,
                initialDate: _ptpDate ?? now.add(const Duration(days: 1)),
                firstDate: now,
                lastDate: now.add(const Duration(days: maxPtpDays)),
              );
              if (picked != null) setState(() => _ptpDate = picked);
            },
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
              decoration: BoxDecoration(
                color: AppColors.surfaceMuted,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AppColors.border),
              ),
              child: Row(
                children: [
                  const HugeIcon(icon: AppIcons.calendar,
                      size: 15, color: AppColors.textMuted),
                  const SizedBox(width: 10),
                  Text(
                    _ptpDate == null ? 'Pick a date' : formatter.format(_ptpDate!),
                    style: const TextStyle(color: AppColors.text, fontSize: 13),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _callbackField() {
    final formatter = DateFormat('EEE d MMM, HH:mm');
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surfaceMuted,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.warning.withValues(alpha: 0.4)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _label('WHEN TO CALL BACK'),
          const SizedBox(height: 6),
          GestureDetector(
            // Both a date and a time: a callback "tomorrow" that does not say when
            // is not something the follow-up queue can order.
            onTap: () async {
              final now = DateTime.now();
              final date = await showDatePicker(
                context: context,
                initialDate: _callbackAt ?? now.add(const Duration(days: 1)),
                firstDate: now,
                lastDate: now.add(const Duration(days: maxCallbackDays)),
              );
              if (date == null || !mounted) return;
              final time = await showTimePicker(
                context: context,
                initialTime: const TimeOfDay(hour: 9, minute: 0),
              );
              if (time == null) return;
              setState(() => _callbackAt = DateTime(
                    date.year,
                    date.month,
                    date.day,
                    time.hour,
                    time.minute,
                  ));
            },
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
              decoration: BoxDecoration(
                color: AppColors.background,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AppColors.border),
              ),
              child: Row(
                children: [
                  const HugeIcon(icon: AppIcons.clock,
                      size: 15, color: AppColors.textMuted),
                  const SizedBox(width: 10),
                  Text(
                    _callbackAt == null
                        ? 'Pick a date and time'
                        : formatter.format(_callbackAt!),
                    style: const TextStyle(color: AppColors.text, fontSize: 13),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
