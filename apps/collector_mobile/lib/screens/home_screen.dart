import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/loan_assignment.dart';
import '../services/api_service.dart';
import '../utils/collection_levels.dart';
import 'case_detail_screen.dart';
import 'login_screen.dart';

/// Collector home: today's day-summary (assigned cases, calls, WhatsApp,
/// SMS, settled) plus the compact list of assigned cases.
/// A row shows ID, LVL and phone — tap opens the case detail screen.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  List<LoanAssignment> _queue = [];
  Map<String, dynamic> _stats = {};
  bool _isLoading = true;
  final currencyFormat = NumberFormat('#,##0', 'en_US');

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final queue = await ApiService.fetchMyQueue();
      final stats = await ApiService.fetchStats();
      if (!mounted) return;
      setState(() {
        _queue = queue;
        _stats = stats;
        _isLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _isLoading = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error loading home: $e')),
      );
    }
  }

  Future<void> _openCase(LoanAssignment item) async {
    await Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => CaseDetailScreen(item: item)),
    );
    // Refresh worked-states when coming back from a case.
    _loadData();
  }

  @override
  Widget build(BuildContext context) {
    final worked = _queue.where(workedToday).length;
    final assignedLevel = _stats['assignedLevel']?.toString();

    return Scaffold(
      backgroundColor: const Color(0xFF0B0F19),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1E293B),
        elevation: 0,
        title: const Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Today’s Cases',
              style: TextStyle(
                  color: Colors.white,
                  fontSize: 18,
                  fontWeight: FontWeight.bold),
            ),
            Text(
              'Office Collection Desk',
              style: TextStyle(color: Color(0xFF94A3B8), fontSize: 11),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: Color(0xFF10B981)),
            onPressed: _loadData,
          ),
          IconButton(
            icon: const Icon(Icons.logout, color: Color(0xFF94A3B8)),
            onPressed: () async {
              final nav = Navigator.of(context);
              await ApiService.clearToken();
              if (mounted) {
                nav.pushReplacement(
                  MaterialPageRoute(builder: (_) => const LoginScreen()),
                );
              }
            },
          ),
        ],
      ),
      body: _isLoading
          ? const Center(
              child: CircularProgressIndicator(color: Color(0xFF10B981)))
          : RefreshIndicator(
              onRefresh: _loadData,
              color: const Color(0xFF10B981),
              backgroundColor: const Color(0xFF1E293B),
              child: SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Day summary card
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(
                          colors: [
                            Color(0xFF1E293B),
                            Color(0xFF0F172A)
                          ],
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                        ),
                        borderRadius: BorderRadius.circular(18),
                        border:
                            Border.all(color: const Color(0xFF334155)),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment:
                                MainAxisAlignment.spaceBetween,
                            children: [
                              const Text('ASSIGNED TODAY',
                                  style: TextStyle(
                                      color: Color(0xFF64748B),
                                      fontSize: 11,
                                      fontWeight: FontWeight.bold)),
                              if (assignedLevel != null)
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 8, vertical: 3),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFF10B981),
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: Text(
                                    'LVL ${levelLabels[assignedLevel] ?? assignedLevel}',
                                    style: const TextStyle(
                                        color: Colors.black,
                                        fontSize: 11,
                                        fontWeight: FontWeight.bold),
                                  ),
                                ),
                            ],
                          ),
                          const SizedBox(height: 4),
                          Text(
                            '${_stats['queueSize'] ?? _queue.length} cases',
                            style: const TextStyle(
                                color: Colors.white,
                                fontSize: 30,
                                fontWeight: FontWeight.bold),
                          ),
                          Text(
                            '$worked of ${_queue.length} worked • TZS ${currencyFormat.format(_stats['recoveredTodayAmount'] ?? 0)} recovered',
                            style: const TextStyle(
                                color: Color(0xFF94A3B8), fontSize: 12),
                          ),
                          const SizedBox(height: 12),
                          ClipRRect(
                            borderRadius: BorderRadius.circular(8),
                            child: LinearProgressIndicator(
                              value: _queue.isEmpty
                                  ? 0
                                  : worked / _queue.length,
                              minHeight: 8,
                              backgroundColor:
                                  const Color(0xFF0F172A),
                              valueColor:
                                  const AlwaysStoppedAnimation(
                                      Color(0xFF10B981)),
                            ),
                          ),
                          const SizedBox(height: 14),
                          Row(
                            children: [
                              _dayStat(Icons.call, 'Calls',
                                  '${_stats['callsToday'] ?? 0}',
                                  const Color(0xFF60A5FA)),
                              _dayStat(Icons.chat, 'WhatsApp',
                                  '${_stats['whatsappToday'] ?? 0}',
                                  const Color(0xFF059669)),
                              _dayStat(Icons.sms, 'SMS',
                                  '${_stats['smsToday'] ?? 0}',
                                  const Color(0xFFF59E0B)),
                              _dayStat(Icons.check_circle, 'Settled',
                                  '${_stats['settledToday'] ?? 0}',
                                  const Color(0xFF10B981)),
                            ],
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),

                    if (assignedLevel != null &&
                        levelDescriptions.containsKey(assignedLevel))
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: const Color(0xFF1E293B),
                          borderRadius: BorderRadius.circular(12),
                          border:
                              Border.all(color: const Color(0xFF334155)),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.info_outline,
                                color: Color(0xFF60A5FA), size: 16),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                'Level ${levelLabels[assignedLevel]} • ${levelDescriptions[assignedLevel]}',
                                style: const TextStyle(
                                    color: Color(0xFFCBD5E1),
                                    fontSize: 12),
                              ),
                            ),
                          ],
                        ),
                      ),
                    const SizedBox(height: 16),

                    const Text(
                      'CASES ASSIGNED',
                      style: TextStyle(
                          color: Color(0xFF64748B),
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          letterSpacing: 0.5),
                    ),
                    const SizedBox(height: 10),

                    if (_queue.isEmpty)
                      Container(
                        padding: const EdgeInsets.all(32),
                        alignment: Alignment.center,
                        child: const Column(
                          children: [
                            Icon(Icons.check_circle_outline,
                                color: Color(0xFF10B981), size: 48),
                            SizedBox(height: 12),
                            Text('No cases assigned for today!',
                                style: TextStyle(
                                    color: Colors.white,
                                    fontWeight: FontWeight.bold)),
                          ],
                        ),
                      )
                    else
                      ListView.separated(
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        itemCount: _queue.length,
                        separatorBuilder: (_, _) =>
                            const SizedBox(height: 8),
                        itemBuilder: (context, index) =>
                            _caseRow(_queue[index]),
                      ),
                  ],
                ),
              ),
            ),
    );
  }

  Widget _dayStat(IconData icon, String label, String value, Color color) {
    return Expanded(
      child: Column(
        children: [
          Icon(icon, color: color, size: 18),
          const SizedBox(height: 4),
          Text(value,
              style: const TextStyle(
                  color: Colors.white,
                  fontSize: 16,
                  fontWeight: FontWeight.bold)),
          Text(label,
              style:
                  const TextStyle(color: Color(0xFF94A3B8), fontSize: 11)),
        ],
      ),
    );
  }

  /// Compact row: ID, LVL chip, phone. Tap → case detail.
  Widget _caseRow(LoanAssignment item) {
    final done = workedToday(item);
    final preDue = isPreDue(item.level);
    return InkWell(
      onTap: () => _openCase(item),
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: const Color(0xFF1E293B),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: const Color(0xFF334155)),
        ),
        child: Row(
          children: [
            if (done)
              const Padding(
                padding: EdgeInsets.only(right: 8),
                child: Icon(Icons.check_circle,
                    color: Color(0xFF10B981), size: 18),
              ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '#${item.loanNumber}',
                    style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                        fontSize: 14,
                        fontFamily: 'monospace'),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    item.borrowerPhone,
                    style: const TextStyle(
                        color: Color(0xFF10B981),
                        fontSize: 12,
                        fontFamily: 'monospace'),
                  ),
                ],
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
                'LVL ${item.levelLabel}',
                style: TextStyle(
                    color: preDue
                        ? const Color(0xFF10B981)
                        : const Color(0xFFEF4444),
                    fontSize: 12,
                    fontWeight: FontWeight.bold),
              ),
            ),
            const SizedBox(width: 4),
            const Icon(Icons.chevron_right,
                color: Color(0xFF64748B), size: 20),
          ],
        ),
      ),
    );
  }
}
