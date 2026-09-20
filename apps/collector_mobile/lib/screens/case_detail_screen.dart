import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/loan_assignment.dart';
import '../services/api_service.dart';
import '../utils/collection_levels.dart';
import '../widgets/disposition_dialog.dart';
import '../widgets/ussd_prompt_dialog.dart';

/// Case detail: everything a collector can do on one account —
/// call / WhatsApp / SMS / USSD push, PTP status, contact history.
class CaseDetailScreen extends StatefulWidget {
  final LoanAssignment item;

  const CaseDetailScreen({super.key, required this.item});

  @override
  State<CaseDetailScreen> createState() => _CaseDetailScreenState();
}

class _CaseDetailScreenState extends State<CaseDetailScreen> {
  late LoanAssignment _item;
  final currencyFormat = NumberFormat('#,##0', 'en_US');

  @override
  void initState() {
    super.initState();
    _item = widget.item;
  }

  /// Re-pull the queue so history/PTP reflect what was just logged.
  Future<void> _refresh() async {
    try {
      final queue = await ApiService.fetchMyQueue();
      final fresh = queue.firstWhere(
        (q) => q.loanId == _item.loanId,
        orElse: () => _item,
      );
      if (!mounted) return;
      setState(() => _item = fresh);
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
      return 'Habari ${_item.borrowerName}, kumbusho kutoka realMoney: mkopo wako #${_item.loanNumber} wa TZS $amount unastahili tarehe $due. Tafadhali lipa mapema kupitia Selcom USSD ili kuepuka faini. Asante!';
    }
    return 'Habari ${_item.borrowerName}, hili ni kumbusho kutoka realMoney kuhusu deni lako la mkopo #${_item.loanNumber} la TZS $amount lililochelewa kwa siku ${_item.daysOverdue}. Tafadhali lipa kupitia Selcom USSD au wasiliana nasi.';
  }

  Future<void> _handleCall() async {
    final uri = Uri.parse('tel:${_item.borrowerPhone}');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    }
    _showDisposition('CALL');
  }

  Future<void> _handleWhatsApp() async {
    final phone = _item.borrowerPhone.replaceAll(RegExp(r'[^0-9]'), '');
    final uri =
        Uri.parse('https://wa.me/$phone?text=${Uri.encodeComponent(_messageText())}');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
    _showDisposition('WHATSAPP');
  }

  Future<void> _handleSms() async {
    final uri = Uri.parse(
        'sms:${_item.borrowerPhone}?body=${Uri.encodeComponent(_messageText())}');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    }
    _showDisposition('SMS');
  }

  void _showDisposition(String channel) {
    showDialog(
      context: context,
      builder: (_) => DispositionDialog(
        loanId: _item.loanId,
        borrowerName: _item.borrowerName,
        channel: channel,
        defaultAmount: _item.outstandingBalance,
        onSaved: _refresh,
      ),
    );
  }

  void _showUssd() {
    showDialog(
      context: context,
      builder: (_) => UssdPromptDialog(
        loanId: _item.loanId,
        borrowerName: _item.borrowerName,
        borrowerPhone: _item.borrowerPhone,
        defaultAmount: _item.outstandingBalance,
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
      backgroundColor: const Color(0xFF0B0F19),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1E293B),
        iconTheme: const IconThemeData(color: Colors.white),
        title: Text(
          '#${_item.loanNumber}',
          style: const TextStyle(
              color: Colors.white,
              fontSize: 17,
              fontWeight: FontWeight.bold,
              fontFamily: 'monospace'),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: Color(0xFF10B981)),
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
                color: const Color(0xFF1E293B),
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: const Color(0xFF334155)),
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
                              color: Colors.white,
                              fontSize: 20,
                              fontWeight: FontWeight.bold),
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 5),
                        decoration: BoxDecoration(
                          color: preDue
                              ? const Color(0x2210B981)
                              : const Color(0x22EF4444),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(
                              color: preDue
                                  ? const Color(0xFF10B981)
                                  : const Color(0xFFEF4444)),
                        ),
                        child: Text(
                          'LVL ${_item.levelLabel} • ${levelStatusText(_item)}',
                          style: TextStyle(
                              color: preDue
                                  ? const Color(0xFF10B981)
                                  : const Color(0xFFEF4444),
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
                        color: Color(0xFF10B981),
                        fontSize: 15,
                        fontFamily: 'monospace'),
                  ),
                  if (_item.borrowerAddress.isNotEmpty &&
                      _item.borrowerAddress != 'N/A')
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(_item.borrowerAddress,
                          style: const TextStyle(
                              color: Color(0xFF94A3B8), fontSize: 12)),
                    ),
                  const Divider(
                      color: Color(0xFF334155), height: 28),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      _money('Outstanding',
                          'TZS ${currencyFormat.format(_item.outstandingBalance)}',
                          preDue ? Colors.white : const Color(0xFFF87171)),
                      _money('Principal',
                          'TZS ${currencyFormat.format(_item.principalAmount)}',
                          const Color(0xFF94A3B8)),
                      if (_item.penaltyAmount > 0)
                        _money('Penalty',
                            'TZS ${currencyFormat.format(_item.penaltyAmount)}',
                            const Color(0xFFFBBF24)),
                    ],
                  ),
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
                      ? const Color(0x22EF4444)
                      : const Color(0x1110B981),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                      color: broken
                          ? const Color(0xFFEF4444)
                          : const Color(0x3310B981)),
                ),
                child: Row(
                  children: [
                    Icon(
                        broken
                            ? Icons.warning_amber
                            : Icons.handshake,
                        color: broken
                            ? const Color(0xFFEF4444)
                            : const Color(0xFF10B981),
                        size: 18),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        broken
                            ? 'PTP BROKEN — TZS ${currencyFormat.format(double.tryParse(ptp['promisedAmount'].toString()) ?? 0)} was due ${ptp['promisedDate']?.toString().substring(0, 10) ?? ''}. Escalate now.'
                            : 'PTP: TZS ${currencyFormat.format(double.tryParse(ptp['promisedAmount'].toString()) ?? 0)} due ${ptp['promisedDate']?.toString().substring(0, 10) ?? ''}',
                        style: TextStyle(
                            color: broken
                                ? const Color(0xFFEF4444)
                                : const Color(0xFF10B981),
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
                    color: Color(0xFF64748B),
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
                _actionBtn(Icons.call, 'Call', const Color(0xFF2563EB),
                    Colors.white, _handleCall),
                _actionBtn(Icons.chat, 'WhatsApp',
                    const Color(0xFF059669), Colors.white, _handleWhatsApp),
                _actionBtn(Icons.sms, 'SMS', const Color(0xFF7C3AED),
                    Colors.white, _handleSms),
                _actionBtn(Icons.bolt, 'Push USSD',
                    const Color(0xFFF59E0B), Colors.black, _showUssd),
              ],
            ),
            const SizedBox(height: 20),

            // Contact history
            const Text('CONTACT HISTORY',
                style: TextStyle(
                    color: Color(0xFF64748B),
                    fontSize: 11,
                    fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            if (_item.recentInteractions.isEmpty)
              Container(
                padding: const EdgeInsets.all(20),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: const Color(0xFF1E293B),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: const Color(0xFF334155)),
                ),
                child: const Text('No contact yet — be the first touch.',
                    style: TextStyle(
                        color: Color(0xFF64748B), fontSize: 12)),
              )
            else
              ..._item.recentInteractions.map(_historyTile),
          ],
        ),
      ),
    );
  }

  Widget _money(String label, String value, Color color) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label,
            style: const TextStyle(
                color: Color(0xFF64748B), fontSize: 11)),
        const SizedBox(height: 2),
        Text(value,
            style: TextStyle(
                color: color,
                fontSize: 15,
                fontWeight: FontWeight.bold)),
      ],
    );
  }

  Widget _actionBtn(IconData icon, String label, Color bg, Color fg,
      VoidCallback onTap) {
    return ElevatedButton.icon(
      onPressed: onTap,
      icon: Icon(icon, size: 18, color: fg),
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

  Widget _historyTile(dynamic log) {
    final created = log['createdAt']?.toString() ?? '';
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFF334155)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('${log['channel'] ?? ''} • ${log['disposition'] ?? ''}',
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.bold)),
              Text(
                  created.length >= 16
                      ? created.substring(0, 16).replaceFirst('T', ' ')
                      : created,
                  style: const TextStyle(
                      color: Color(0xFF64748B),
                      fontSize: 11,
                      fontFamily: 'monospace')),
            ],
          ),
          if (log['notes'] != null &&
              log['notes'].toString().isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(log['notes'].toString(),
                style: const TextStyle(
                    color: Color(0xFF94A3B8), fontSize: 12)),
          ],
        ],
      ),
    );
  }
}
