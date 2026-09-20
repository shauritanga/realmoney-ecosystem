import 'package:flutter/material.dart';
import '../services/api_service.dart';

class DispositionDialog extends StatefulWidget {
  final String loanId;
  final String borrowerName;
  final String channel; // CALL, WHATSAPP, SMS
  final double defaultAmount;
  final VoidCallback onSaved;

  const DispositionDialog({
    super.key,
    required this.loanId,
    required this.borrowerName,
    required this.channel,
    required this.defaultAmount,
    required this.onSaved,
  });

  @override
  State<DispositionDialog> createState() => _DispositionDialogState();
}

class _DispositionDialogState extends State<DispositionDialog> {
  String _selectedDisposition = 'PROMISED_TO_PAY';
  final _notesController = TextEditingController();
  final _amountController = TextEditingController();
  DateTime _selectedDate = DateTime.now().add(const Duration(days: 1));
  bool _isLoading = false;

  final Map<String, String> _dispositionLabels = {
    'PROMISED_TO_PAY': 'Promise to Pay (PTP)',
    'CALLBACK_REQUESTED': 'Callback Requested',
    'DISPUTED': 'Disputed Amount',
    'REFUSED_TO_PAY': 'Refused to Pay',
    'UNREACHABLE': 'Unreachable / Phone Off',
    'WRONG_NUMBER': 'Wrong Number',
  };

  @override
  void initState() {
    super.initState();
    _amountController.text = widget.defaultAmount.toInt().toString();
  }

  Future<void> _submit() async {
    setState(() => _isLoading = true);

    double? ptpAmount;
    String? ptpDate;

    if (_selectedDisposition == 'PROMISED_TO_PAY') {
      ptpAmount = double.tryParse(_amountController.text);
      ptpDate = _selectedDate.toIso8601String();
    }

    final success = await ApiService.logInteraction(
      loanId: widget.loanId,
      channel: widget.channel,
      disposition: _selectedDisposition,
      notes: _notesController.text.trim(),
      ptpAmount: ptpAmount,
      ptpDate: ptpDate,
    );

    setState(() => _isLoading = false);

    if (mounted) {
      if (success) {
        Navigator.pop(context);
        widget.onSaved();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Interaction logged successfully'),
            backgroundColor: Color(0xFF10B981),
          ),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Failed to log interaction'),
            backgroundColor: Colors.redAccent,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isPtp = _selectedDisposition == 'PROMISED_TO_PAY';

    return AlertDialog(
      backgroundColor: const Color(0xFF1E293B),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      title: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                widget.channel == 'CALL'
                    ? Icons.phone_callback
                    : (widget.channel == 'WHATSAPP' ? Icons.chat : Icons.sms),
                color: const Color(0xFF10B981),
                size: 20,
              ),
              const SizedBox(width: 8),
              const Text(
                'Log Call Disposition',
                style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            widget.borrowerName,
            style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 13),
          ),
        ],
      ),
      content: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'OUTCOME / RESULT',
              style: TextStyle(color: Color(0xFF64748B), fontSize: 11, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              decoration: BoxDecoration(
                color: const Color(0xFF0F172A),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: const Color(0xFF334155)),
              ),
              child: DropdownButtonHideUnderline(
                child: DropdownButton<String>(
                  value: _selectedDisposition,
                  isExpanded: true,
                  dropdownColor: const Color(0xFF0F172A),
                  style: const TextStyle(color: Colors.white, fontSize: 14),
                  items: _dispositionLabels.entries
                      .map((e) => DropdownMenuItem(value: e.key, child: Text(e.value)))
                      .toList(),
                  onChanged: (val) {
                    if (val != null) setState(() => _selectedDisposition = val);
                  },
                ),
              ),
            ),
            if (isPtp) ...[
              const SizedBox(height: 16),
              const Text(
                'PROMISED AMOUNT (TZS)',
                style: TextStyle(color: Color(0xFF64748B), fontSize: 11, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _amountController,
                keyboardType: TextInputType.number,
                style: const TextStyle(color: Colors.white, fontSize: 14),
                decoration: InputDecoration(
                  filled: true,
                  fillColor: const Color(0xFF0F172A),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: Color(0xFF334155)),
                  ),
                  prefixText: 'TZS ',
                  prefixStyle: const TextStyle(color: Color(0xFF10B981)),
                ),
              ),
              const SizedBox(height: 16),
              const Text(
                'PROMISED DATE',
                style: TextStyle(color: Color(0xFF64748B), fontSize: 11, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              InkWell(
                onTap: () async {
                  final picked = await showDatePicker(
                    context: context,
                    initialDate: _selectedDate,
                    firstDate: DateTime.now(),
                    lastDate: DateTime.now().add(const Duration(days: 30)),
                  );
                  if (picked != null) setState(() => _selectedDate = picked);
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  decoration: BoxDecoration(
                    color: const Color(0xFF0F172A),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFF334155)),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        '${_selectedDate.day}/${_selectedDate.month}/${_selectedDate.year}',
                        style: const TextStyle(color: Colors.white, fontSize: 14),
                      ),
                      const Icon(Icons.calendar_today, color: Color(0xFF10B981), size: 16),
                    ],
                  ),
                ),
              ),
            ],
            const SizedBox(height: 16),
            const Text(
              'AGENT NOTES',
              style: TextStyle(color: Color(0xFF64748B), fontSize: 11, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _notesController,
              maxLines: 2,
              style: const TextStyle(color: Colors.white, fontSize: 13),
              decoration: InputDecoration(
                hintText: 'Customer agreed to pay via Selcom...',
                hintStyle: const TextStyle(color: Color(0xFF475569), fontSize: 13),
                filled: true,
                fillColor: const Color(0xFF0F172A),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: Color(0xFF334155)),
                ),
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancel', style: TextStyle(color: Color(0xFF94A3B8))),
        ),
        ElevatedButton(
          onPressed: _isLoading ? null : _submit,
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
                  'Save Disposition',
                  style: TextStyle(color: Colors.black, fontWeight: FontWeight.bold),
                ),
        ),
      ],
    );
  }
}
