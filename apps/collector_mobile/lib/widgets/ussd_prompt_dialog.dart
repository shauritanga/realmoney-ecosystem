import 'package:flutter/material.dart';
import '../services/api_service.dart';

class UssdPromptDialog extends StatefulWidget {
  final String loanId;
  final String borrowerName;
  final String borrowerPhone;
  final double defaultAmount;
  final VoidCallback onPaymentTriggered;

  const UssdPromptDialog({
    super.key,
    required this.loanId,
    required this.borrowerName,
    required this.borrowerPhone,
    required this.defaultAmount,
    required this.onPaymentTriggered,
  });

  @override
  State<UssdPromptDialog> createState() => _UssdPromptDialogState();
}

class _UssdPromptDialogState extends State<UssdPromptDialog> {
  final _amountController = TextEditingController();
  bool _isLoading = false;
  String? _resultMessage;
  bool _isSuccess = false;

  @override
  void initState() {
    super.initState();
    _amountController.text = widget.defaultAmount.toInt().toString();
  }

  Future<void> _triggerPrompt() async {
    final amount = double.tryParse(_amountController.text);
    if (amount == null || amount <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter a valid amount')),
      );
      return;
    }

    setState(() {
      _isLoading = true;
      _resultMessage = null;
    });

    try {
      final res = await ApiService.triggerPaymentPrompt(
        loanId: widget.loanId,
        amount: amount,
      );

      setState(() {
        _isLoading = false;
        _isSuccess = res['success'] == true;
        _resultMessage = res['message'] ?? 'Prompt sent';
      });

      if (_isSuccess) {
        widget.onPaymentTriggered();
      }
    } catch (e) {
      setState(() {
        _isLoading = false;
        _isSuccess = false;
        _resultMessage = 'Error: $e';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      backgroundColor: const Color(0xFF1E293B),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      title: Row(
        children: const [
          Icon(Icons.bolt, color: Color(0xFFF59E0B), size: 24),
          SizedBox(width: 8),
          Text(
            'Push Selcom USSD',
            style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
          ),
        ],
      ),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFF0F172A),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFF334155)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  widget.borrowerName,
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14),
                ),
                const SizedBox(height: 4),
                Text(
                  'Target Mobile: ${widget.borrowerPhone}',
                  style: const TextStyle(color: Color(0xFF10B981), fontSize: 13, fontFamily: 'monospace'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          const Text(
            'COLLECTION AMOUNT (TZS)',
            style: TextStyle(color: Color(0xFF64748B), fontSize: 11, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _amountController,
            keyboardType: TextInputType.number,
            style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.bold),
            decoration: InputDecoration(
              filled: true,
              fillColor: const Color(0xFF0F172A),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: Color(0xFF334155)),
              ),
              prefixText: 'TZS ',
              prefixStyle: const TextStyle(color: Color(0xFF10B981), fontWeight: FontWeight.bold),
            ),
          ),
          const SizedBox(height: 12),
          const Text(
            'This prompts the customer’s phone screen to enter their M-Pesa, Tigo, Airtel, or HaloPesa PIN.',
            style: TextStyle(color: Color(0xFF94A3B8), fontSize: 11),
          ),
          if (_resultMessage != null) ...[
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: _isSuccess ? const Color(0x2210B981) : const Color(0x22EF4444),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: _isSuccess ? const Color(0xFF10B981) : const Color(0xFFEF4444),
                ),
              ),
              child: Row(
                children: [
                  Icon(
                    _isSuccess ? Icons.check_circle : Icons.error,
                    color: _isSuccess ? const Color(0xFF10B981) : const Color(0xFFEF4444),
                    size: 18,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      _resultMessage!,
                      style: TextStyle(
                        color: _isSuccess ? const Color(0xFF10B981) : const Color(0xFFEF4444),
                        fontSize: 12,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Close', style: TextStyle(color: Color(0xFF94A3B8))),
        ),
        ElevatedButton(
          onPressed: _isLoading ? null : _triggerPrompt,
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFF10B981),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
          ),
          child: _isLoading
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black),
                )
              : const Text(
                  'Send USSD Push',
                  style: TextStyle(color: Colors.black, fontWeight: FontWeight.bold),
                ),
        ),
      ],
    );
  }
}
