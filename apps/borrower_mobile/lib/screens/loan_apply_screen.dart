import '../theme/app_colors.dart';
import 'package:flutter/material.dart';
import 'package:hugeicons/hugeicons.dart';
import 'package:intl/intl.dart';
import '../services/api_service.dart';

class LoanApplyScreen extends StatefulWidget {
  const LoanApplyScreen({super.key});

  @override
  State<LoanApplyScreen> createState() => _LoanApplyScreenState();
}

class _LoanApplyScreenState extends State<LoanApplyScreen> {
  List<dynamic> _products = [];
  dynamic _selectedProduct;
  double _amount = 50000;
  int _tenureDays = 14;
  bool _isLoading = true;
  bool _isSubmitting = false;
  String? _loadError;
  final currencyFormat = NumberFormat('#,##0', 'en_US');

  @override
  void initState() {
    super.initState();
    _loadProducts();
  }

  Future<void> _loadProducts() async {
    try {
      final profile = await ApiService.request('/onboarding');
      if (profile['canApply'] != true) throw Exception('Complete your borrower profile before applying');
      final limit = await ApiService.fetchBorrowingLimit();
      final products = await ApiService.fetchProducts();
      final allowance = (limit['amount'] as num).toDouble();
      final eligible = products.map((p) {
        final product = Map<String, dynamic>.from(p as Map);
        final maximum = num.parse(product['maxAmount'].toString()).toDouble();
        product['maxAmount'] = maximum < allowance ? maximum : allowance;
        return product;
      }).where((p) => num.parse(p['minAmount'].toString()) <= (p['maxAmount'] as num)).toList();
      if (!mounted) return;
      setState(() {
        _products = eligible;
        if (eligible.isNotEmpty) {
          _selectedProduct = eligible.first;
          _amount = num.parse(_selectedProduct['minAmount'].toString()).toDouble();
          _tenureDays = _tenureOptions.last;
        } else {
          _loadError = 'No loan products are available within your borrowing limit.';
        }
        _isLoading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _isLoading = false;
        _loadError = 'Unable to load your borrowing limit. Please retry.';
      });
    }
  }

  double get _interest {
    if (_selectedProduct == null) return 0;
    final rate = (double.tryParse(_selectedProduct['interestRateMonthly'].toString()) ?? 40) / 100;
    return _amount * rate * (_tenureDays / 7);
  }

  double get _fee {
    if (_selectedProduct == null) return 0;
    final rate = (double.tryParse(_selectedProduct['processingFeeRate'].toString()) ?? 2.5) / 100;
    return _amount * rate;
  }

  double get _totalDue => _amount + _interest + _fee;

  /// Tenure chips derived from the product's min/max (Tala-style: only show
  /// what the product actually allows).
  List<int> get _tenureOptions {
    final min = _selectedProduct != null
        ? (num.tryParse(_selectedProduct['minTenureDays'].toString())?.toInt() ?? 7)
        : 7;
    final max = _selectedProduct != null
        ? (num.tryParse(_selectedProduct['maxTenureDays'].toString())?.toInt() ?? 30)
        : 30;
    final std = [7, 14, 30].where((d) => d >= min && d <= max).toList();
    if (std.isNotEmpty) return std;
    return {min, ((min + max) / 2).round(), max}.toList()..sort();
  }

  void _syncTenure() {
    if (!_tenureOptions.contains(_tenureDays)) {
      _tenureDays = _tenureOptions.last;
    }
  }

  String get _dueDateLabel {
    final due = DateTime.now().add(Duration(days: _tenureDays));
    return DateFormat('yyyy-MM-dd').format(due);
  }

  Future<void> _submitApplication() async {
    if (_selectedProduct == null) return;
    setState(() => _isSubmitting = true);

    final res = await ApiService.applyForLoan(
      productId: _selectedProduct['id'],
      principalAmount: _amount,
      tenureDays: _tenureDays,
    );

    setState(() => _isSubmitting = false);

    if (mounted) {
      if (res['id'] != null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Loan application submitted! Awaiting credit officer approval.'),
            backgroundColor: AppColors.primary,
          ),
        );
        Navigator.pop(context, true);
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(res['message'] ?? 'Application failed'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(
        backgroundColor: AppColors.background,
        body: Center(child: CircularProgressIndicator(color: AppColors.primary)),
      );
    }

    if (_loadError != null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Apply for Loan')),
        body: Center(child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_loadError!),
            TextButton(onPressed: () {
              setState(() { _isLoading = true; _loadError = null; });
              _loadProducts();
            }, child: const Text('Retry')),
          ],
        )),
      );
    }

    final minAmt = _selectedProduct != null
        ? double.tryParse(_selectedProduct['minAmount'].toString()) ?? 20000
        : 20000.0;
    final maxAmt = _selectedProduct != null
        ? double.tryParse(_selectedProduct['maxAmount'].toString()) ?? 200000
        : 200000.0;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.surface,
        title: const Text('Apply for Loan', style: TextStyle(color: AppColors.text, fontWeight: FontWeight.bold)),
        iconTheme: const IconThemeData(color: AppColors.text),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'SELECT PRODUCT',
              style: TextStyle(color: AppColors.textMuted, fontSize: 11, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: AppColors.border),
              ),
              child: DropdownButtonHideUnderline(
                child: DropdownButton<dynamic>(
                  value: _selectedProduct,
                  isExpanded: true,
                  dropdownColor: AppColors.surface,
                  style: const TextStyle(color: AppColors.text, fontSize: 14),
                  items: _products
                      .map((p) => DropdownMenuItem(value: p, child: Text(p['name'])))
                      .toList(),
                  onChanged: (val) {
                    setState(() {
                      _selectedProduct = val;
                      _amount = double.tryParse(_selectedProduct['minAmount'].toString()) ?? 20000;
                      _syncTenure();
                    });
                  },
                ),
              ),
            ),
            const SizedBox(height: 24),

            // Amount Slider
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'LOAN AMOUNT',
                  style: TextStyle(color: AppColors.textMuted, fontSize: 11, fontWeight: FontWeight.bold),
                ),
                Text(
                  'TZS ${currencyFormat.format(_amount)}',
                  style: const TextStyle(color: AppColors.primary, fontSize: 18, fontWeight: FontWeight.bold),
                ),
              ],
            ),
            Slider(
              value: _amount.clamp(minAmt, maxAmt),
              min: minAmt,
              max: maxAmt,
              divisions: 18,
              activeColor: AppColors.primary,
              inactiveColor: AppColors.surface,
              onChanged: (val) => setState(() => _amount = val.roundToDouble().clamp(minAmt, maxAmt)),
            ),
            const SizedBox(height: 20),

            // Tenure Options
            const Text(
              'REPAYMENT TENURE',
              style: TextStyle(color: AppColors.textMuted, fontSize: 11, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Row(
              children: _tenureOptions.map((days) {
                final isSelected = _tenureDays == days;
                return Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    child: OutlinedButton(
                      onPressed: () => setState(() => _tenureDays = days),
                      style: OutlinedButton.styleFrom(
                        backgroundColor: isSelected ? AppColors.primary : AppColors.surface,
                        side: BorderSide(
                          color: isSelected ? AppColors.primary : AppColors.border,
                        ),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                      child: Text(
                        '$days Days',
                        style: TextStyle(
                          color: isSelected ? AppColors.onPrimary : AppColors.text,
                          fontWeight: FontWeight.bold,
                          fontSize: 13,
                        ),
                      ),
                    ),
                  ),
                );
              }).toList(),
            ),
            const SizedBox(height: 28),

            // Loan Summary Card
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppColors.border),
              ),
              child: Column(
                children: [
                  _summaryRow('Principal Amount', 'TZS ${currencyFormat.format(_amount)}'),
                  const SizedBox(height: 8),
                  _summaryRow('Interest Rate (7 days)', '${_selectedProduct['interestRateMonthly']}%'),
                  const SizedBox(height: 8),
                  _summaryRow('Estimated Interest', 'TZS ${currencyFormat.format(_interest)}'),
                  const SizedBox(height: 8),
                  _summaryRow('Processing Fee', 'TZS ${currencyFormat.format(_fee)}'),
                  const SizedBox(height: 8),
                  _summaryRow('Repayment Due Date', _dueDateLabel),
                  const Divider(color: AppColors.border, height: 24),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'Total Repayment Due',
                        style: TextStyle(color: AppColors.text, fontWeight: FontWeight.bold, fontSize: 14),
                      ),
                      Text(
                        'TZS ${currencyFormat.format(_totalDue)}',
                        style: const TextStyle(
                          color: AppColors.primary,
                          fontWeight: FontWeight.bold,
                          fontSize: 18,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            const Row(
              children: [
                HugeIcon(icon: HugeIcons.strokeRoundedWallet01,
                    color: AppColors.primary, size: 16),
                SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'On approval, funds land directly in your M-Pesa, Tigo Pesa, or Airtel Money wallet via Selcom.',
                    style: TextStyle(color: AppColors.textMuted, fontSize: 12),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),

            ElevatedButton(
              onPressed: _isSubmitting ? null : _submitApplication,
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                minimumSize: const Size(double.infinity, 52),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              ),
              child: _isSubmitting
                  ? const CircularProgressIndicator(color: AppColors.onPrimary)
                  : const Text(
                      'Confirm & Submit Application',
                      style: TextStyle(color: AppColors.onPrimary, fontWeight: FontWeight.bold, fontSize: 15),
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _summaryRow(String label, String value) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: const TextStyle(color: AppColors.textMuted, fontSize: 13)),
        Text(value, style: const TextStyle(color: AppColors.text, fontSize: 13, fontWeight: FontWeight.w600)),
      ],
    );
  }
}
