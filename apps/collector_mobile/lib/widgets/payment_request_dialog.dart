import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../models/extension_offer.dart';
import '../services/api_service.dart';
import '../theme/app_colors.dart';
import '../theme/app_icons.dart';
import '../utils/payer_validation.dart';

/// The two things a borrower can agree to on a collections call.
enum PaymentMode {
  /// Pay something — all of it, or part of it.
  pay,

  /// Pay a fee to move the due date out. The debt itself does not change.
  extend,
}

/// Asks the borrower to pay, now — or to buy more time.
///
/// Deliberately plain. The collector is already on this borrower's case, has the
/// amount in front of them, and does this many times a day — so the dialog states the
/// things that can vary and gets out of the way.
///
/// It does not name the payment provider. Every payment in the product goes through
/// the same one, so naming it tells the collector nothing they can act on and nothing
/// they could choose differently.
class PaymentRequestDialog extends StatefulWidget {
  final String loanId;
  final String borrowerName;
  final String borrowerPhone;

  /// The outstanding balance: the default amount and the ceiling for a payment.
  final double defaultAmount;

  /// The extension terms as the server priced them, from the case payload. Null when
  /// the case was loaded before extensions existed, in which case the dialog fetches
  /// them the first time the collector switches mode.
  final ExtensionOffer? extension;

  final VoidCallback onPaymentTriggered;

  const PaymentRequestDialog({
    super.key,
    required this.loanId,
    required this.borrowerName,
    required this.borrowerPhone,
    required this.defaultAmount,
    required this.onPaymentTriggered,
    this.extension,
  });

  @override
  State<PaymentRequestDialog> createState() => _PaymentRequestDialogState();
}

class _PaymentRequestDialogState extends State<PaymentRequestDialog> {
  final _amountController = TextEditingController();
  final _payerPhoneController = TextEditingController();
  final _payerNameController = TextEditingController();

  PaymentMode _mode = PaymentMode.pay;
  bool _someoneElsePaying = false;
  bool _isLoading = false;
  bool _loadingQuote = false;
  bool _sent = false;
  String? _error;
  ExtensionOffer? _extension;

  final _money = NumberFormat('#,##0', 'en_US');
  final _date = DateFormat('d MMM');

  /// The server rejects anything below this, so catch it here rather than after a
  /// round trip the collector has to explain away.
  static const _minimumPayment = 500;

  @override
  void initState() {
    super.initState();
    _extension = widget.extension;
    _amountController.text = _money.format(widget.defaultAmount.round());
  }

  @override
  void dispose() {
    _amountController.dispose();
    _payerPhoneController.dispose();
    _payerNameController.dispose();
    super.dispose();
  }

  /// Part payments are common enough on a call that typing them is friction.
  void _setFraction(double fraction) {
    final amount = (widget.defaultAmount * fraction).round();
    setState(() {
      _amountController.text = _money.format(amount);
      _error = null;
    });
  }

  Future<void> _switchMode(PaymentMode mode) async {
    if (_mode == mode) return;
    setState(() {
      _mode = mode;
      _error = null;
    });

    // A case loaded before extensions existed carries no terms. Fetch them once,
    // rather than guessing at a fee the server will price differently.
    if (mode == PaymentMode.extend && _extension == null && !_loadingQuote) {
      setState(() => _loadingQuote = true);
      try {
        final quote = await ApiService.extensionQuote(widget.loanId);
        if (!mounted) return;
        setState(() {
          _extension = ExtensionOffer.fromJson(quote);
          _loadingQuote = false;
          if (_extension == null) _error = 'Could not price an extension for this case.';
        });
      } on ApiException catch (error) {
        if (!mounted) return;
        setState(() {
          _loadingQuote = false;
          _error = error.message;
        });
      }
    }
  }

  /// Null when the collector has not named a third party, so the server prompts the
  /// borrower's own number.
  String? get _payerPhone {
    if (!_someoneElsePaying) return null;
    final value = _payerPhoneController.text.trim();
    return value.isEmpty ? null : value;
  }

  String? get _payerName {
    if (!_someoneElsePaying) return null;
    final value = _payerNameController.text.trim();
    return value.isEmpty ? null : value;
  }

  String? _validatePayer() => validatePayer(
        enabled: _someoneElsePaying,
        phone: _payerPhoneController.text,
      );

  Future<void> _send() async {
    final payerError = _validatePayer();
    if (payerError != null) {
      setState(() => _error = payerError);
      return;
    }

    if (_mode == PaymentMode.extend) {
      await _sendExtension();
      return;
    }

    // Separators are for reading, not for parsing.
    final amount = double.tryParse(_amountController.text.replaceAll(',', '').trim());
    if (amount == null || amount <= 0) {
      setState(() => _error = 'Enter an amount.');
      return;
    }
    if (amount < _minimumPayment) {
      setState(() => _error = 'The smallest payment is TZS $_minimumPayment.');
      return;
    }
    if (amount > widget.defaultAmount) {
      setState(() => _error = 'More than the outstanding balance.');
      return;
    }

    await _dispatch(() => ApiService.triggerPaymentPrompt(
          loanId: widget.loanId,
          amount: amount,
          payerPhone: _payerPhone,
          payerName: _payerName,
        ));
  }

  Future<void> _sendExtension() async {
    final offer = _extension;
    if (offer == null || !offer.eligible) {
      setState(() => _error = offer?.reason ?? 'This case cannot be extended.');
      return;
    }
    await _dispatch(() => ApiService.extendLoan(
          loanId: widget.loanId,
          payerPhone: _payerPhone,
          payerName: _payerName,
        ));
  }

  Future<void> _dispatch(Future<Map<String, dynamic>> Function() request) async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final res = await request();
      if (!mounted) return;

      if (res['success'] == true) {
        setState(() {
          _isLoading = false;
          _sent = true;
        });
        widget.onPaymentTriggered();
      } else {
        setState(() {
          _isLoading = false;
          // The API's own message says what went wrong — including the case where a
          // payment is already pending, which used to report success and leave the
          // collector telling the borrower to check a phone nothing had reached.
          _error = res['message']?.toString() ?? 'Could not send the request.';
        });
      }
    } on ApiException catch (error) {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _error = error.message;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      backgroundColor: AppColors.surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      // AlertDialog otherwise shrinks to fit its content inside a 40px inset, which
      // leaves a narrow column on a phone. A smaller inset plus a max-width content
      // box lets it use the screen.
      insetPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
      titlePadding: const EdgeInsets.fromLTRB(22, 22, 22, 0),
      contentPadding: const EdgeInsets.fromLTRB(22, 14, 22, 0),
      actionsPadding: const EdgeInsets.fromLTRB(14, 8, 14, 12),
      title: Text(
        _title,
        style: const TextStyle(
          color: AppColors.text,
          fontSize: 18,
          fontWeight: FontWeight.w700,
        ),
      ),
      content: _sent ? _confirmation() : _form(),
      actions: _sent ? _doneActions() : _formActions(),
    );
  }

  String get _title {
    if (_sent) return _mode == PaymentMode.extend ? 'Extension sent' : 'Request sent';
    return _mode == PaymentMode.extend ? 'Extend the due date' : 'Request payment';
  }

  List<Widget> _doneActions() => [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text(
            'Done',
            style: TextStyle(color: AppColors.primary, fontWeight: FontWeight.w600),
          ),
        ),
      ];

  List<Widget> _formActions() => [
        TextButton(
          onPressed: _isLoading ? null : () => Navigator.pop(context),
          child: const Text('Cancel', style: TextStyle(color: AppColors.textMuted)),
        ),
        ElevatedButton(
          onPressed: _isLoading ? null : _send,
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.primary,
            disabledBackgroundColor: AppColors.border,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
          ),
          child: _isLoading
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: AppColors.onPrimary),
                )
              : Text(
                  _mode == PaymentMode.extend ? 'Send fee request' : 'Send',
                  style: const TextStyle(
                      color: AppColors.onPrimary, fontWeight: FontWeight.bold),
                ),
        ),
      ];

  Widget _form() {
    return SizedBox(
      // Takes the width the dialog allows, rather than only what its children need.
      width: double.maxFinite,
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '${widget.borrowerName} · ${widget.borrowerPhone}',
              style: const TextStyle(color: AppColors.textMuted, fontSize: 13),
            ),
            const SizedBox(height: 14),
            _modeSwitch(),
            const SizedBox(height: 16),
            if (_mode == PaymentMode.pay) _payFields() else _extendFields(),
            const SizedBox(height: 14),
            _thirdPartyToggle(),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(
                _error!,
                style: const TextStyle(color: AppColors.error, fontSize: 12),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _modeSwitch() {
    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: AppColors.surfaceMuted,
        borderRadius: BorderRadius.circular(11),
      ),
      child: Row(
        children: [
          _modeTab(PaymentMode.pay, 'Payment'),
          _modeTab(PaymentMode.extend, 'Extension'),
        ],
      ),
    );
  }

  Widget _modeTab(PaymentMode mode, String label) {
    final selected = _mode == mode;
    return Expanded(
      child: GestureDetector(
        onTap: _isLoading ? null : () => _switchMode(mode),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 9),
          decoration: BoxDecoration(
            color: selected ? AppColors.surface : Colors.transparent,
            borderRadius: BorderRadius.circular(9),
            border: selected ? Border.all(color: AppColors.border) : null,
          ),
          child: Text(
            label,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: selected ? AppColors.primary : AppColors.textMuted,
            ),
          ),
        ),
      ),
    );
  }

  Widget _payFields() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextField(
          controller: _amountController,
          keyboardType: TextInputType.number,
          autofocus: true,
          style: const TextStyle(
            color: AppColors.text,
            fontSize: 22,
            fontWeight: FontWeight.w700,
          ),
          decoration: _fieldDecoration(prefixText: 'TZS  '),
          onChanged: (_) {
            if (_error != null) setState(() => _error = null);
          },
        ),
        const SizedBox(height: 10),
        // A borrower who offers "half" should not make the collector do arithmetic.
        Row(
          children: [
            _fractionChip('25%', 0.25),
            const SizedBox(width: 8),
            _fractionChip('50%', 0.5),
            const SizedBox(width: 8),
            _fractionChip('Full', 1),
          ],
        ),
      ],
    );
  }

  Widget _fractionChip(String label, double fraction) {
    return Expanded(
      child: GestureDetector(
        onTap: _isLoading ? null : () => _setFraction(fraction),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 9),
          decoration: BoxDecoration(
            color: AppColors.surfaceMuted,
            borderRadius: BorderRadius.circular(9),
            border: Border.all(color: AppColors.border),
          ),
          child: Text(
            label,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 12.5,
              fontWeight: FontWeight.w600,
              color: AppColors.text,
            ),
          ),
        ),
      ),
    );
  }

  Widget _extendFields() {
    if (_loadingQuote) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 18),
        child: Center(
          child: SizedBox(
            width: 20,
            height: 20,
            child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.primary),
          ),
        ),
      );
    }

    final offer = _extension;
    if (offer == null) {
      return const Text(
        'Extension terms are unavailable for this case.',
        style: TextStyle(color: AppColors.textMuted, fontSize: 13),
      );
    }

    if (!offer.eligible) {
      return Container(
        padding: const EdgeInsets.all(13),
        decoration: BoxDecoration(
          color: AppColors.errorTint,
          borderRadius: BorderRadius.circular(11),
          border: Border.all(color: AppColors.error),
        ),
        child: Text(
          offer.reason ?? 'This case cannot be extended.',
          style: const TextStyle(color: AppColors.error, fontSize: 12.5),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surfaceMuted,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'TZS ${_money.format(offer.fee.round())}',
            style: const TextStyle(
              color: AppColors.text,
              fontSize: 22,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'Moves the due date to ${_date.format(offer.newDueDate)}.',
            style: const TextStyle(color: AppColors.text, fontSize: 13),
          ),
          const SizedBox(height: 4),
          // Stated plainly because it is the single thing a borrower most often
          // misunderstands about an extension.
          const Text(
            'The balance does not change — this buys time only.',
            style: TextStyle(color: AppColors.textMuted, fontSize: 12),
          ),
          if (offer.extensionsRemaining <= 1) ...[
            const SizedBox(height: 8),
            Text(
              offer.extensionsRemaining == 1
                  ? 'This is the last extension available on this case.'
                  : 'No further extensions after this one.',
              style: const TextStyle(
                color: AppColors.warning,
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _thirdPartyToggle() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        GestureDetector(
          onTap: _isLoading
              ? null
              : () => setState(() {
                    _someoneElsePaying = !_someoneElsePaying;
                    _error = null;
                  }),
          child: Row(
            children: [
              SizedBox(
                width: 22,
                height: 22,
                child: Checkbox(
                  value: _someoneElsePaying,
                  visualDensity: VisualDensity.compact,
                  materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  activeColor: AppColors.primary,
                  onChanged: _isLoading
                      ? null
                      : (value) => setState(() {
                            _someoneElsePaying = value ?? false;
                            _error = null;
                          }),
                ),
              ),
              const SizedBox(width: 10),
              const Expanded(
                child: Text(
                  'Someone else is paying',
                  style: TextStyle(color: AppColors.text, fontSize: 13),
                ),
              ),
            ],
          ),
        ),
        if (_someoneElsePaying) ...[
          const SizedBox(height: 10),
          TextField(
            controller: _payerPhoneController,
            keyboardType: TextInputType.phone,
            style: const TextStyle(color: AppColors.text, fontSize: 15),
            decoration: _fieldDecoration(hintText: 'Their mobile number'),
            onChanged: (_) {
              if (_error != null) setState(() => _error = null);
            },
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _payerNameController,
            textCapitalization: TextCapitalization.words,
            style: const TextStyle(color: AppColors.text, fontSize: 15),
            decoration: _fieldDecoration(hintText: 'Their name (optional)'),
          ),
        ],
      ],
    );
  }

  InputDecoration _fieldDecoration({String? prefixText, String? hintText}) {
    return InputDecoration(
      filled: true,
      fillColor: AppColors.surfaceMuted,
      isDense: true,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      prefixText: prefixText,
      hintText: hintText,
      hintStyle: const TextStyle(color: AppColors.textLabel, fontSize: 14),
      prefixStyle: const TextStyle(
        color: AppColors.textMuted,
        fontSize: 15,
        fontWeight: FontWeight.w600,
      ),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide.none,
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide.none,
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: AppColors.primary, width: 1.4),
      ),
    );
  }

  /// What the collector says next, rather than a restatement of what they just did.
  Widget _confirmation() {
    final who = _someoneElsePaying
        ? (_payerName ?? 'the person paying')
        : widget.borrowerName.split(' ').first;

    return SizedBox(
      width: double.maxFinite,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const HugeIcon(icon: AppIcons.success, color: AppColors.primary, size: 18),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              _mode == PaymentMode.extend
                  ? 'Ask $who to check their phone and enter their PIN. The due date '
                      'moves once the fee is paid.'
                  : 'Ask $who to check their phone and enter their PIN.',
              style: const TextStyle(color: AppColors.text, fontSize: 13),
            ),
          ),
        ],
      ),
    );
  }
}
