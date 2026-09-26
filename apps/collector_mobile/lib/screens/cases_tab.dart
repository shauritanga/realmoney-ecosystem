import 'package:flutter/material.dart';

import '../models/loan_assignment.dart';
import '../theme/app_colors.dart';
import '../widgets/case_row.dart';
import '../widgets/ui.dart';
import 'case_detail_screen.dart';
import '../theme/app_icons.dart';

/// How the day's work is segmented.
///
/// Deliberately not the collection level: a collector works exactly one level per
/// day, so a level filter would offer a single option. What actually needs
/// separating is what is left to do from what is already done.
enum CaseFilter { toDo, worked, promises, brokenPtp, all }

const _filterLabels = {
  CaseFilter.toDo: 'To do',
  CaseFilter.worked: 'Worked',
  CaseFilter.promises: 'Promises',
  CaseFilter.brokenPtp: 'Broken',
  CaseFilter.all: 'All',
};

/// The full work queue, filterable and searchable.
class CasesTab extends StatefulWidget {
  final List<LoanAssignment> queue;
  final bool loading;
  final String? error;
  final Future<void> Function() onRefresh;

  const CasesTab({
    super.key,
    required this.queue,
    required this.loading,
    required this.error,
    required this.onRefresh,
  });

  @override
  State<CasesTab> createState() => _CasesTabState();
}

class _CasesTabState extends State<CasesTab> {
  CaseFilter _filter = CaseFilter.toDo;
  final _searchController = TextEditingController();
  String _search = '';

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  List<LoanAssignment> _apply(CaseFilter filter) {
    final byFilter = switch (filter) {
      CaseFilter.toDo => widget.queue.where((i) => !i.workedToday),
      CaseFilter.worked => widget.queue.where((i) => i.workedToday),
      CaseFilter.promises => widget.queue.where((i) => i.hasPendingPtp),
      CaseFilter.brokenPtp => widget.queue.where((i) => i.ptpOverdue),
      CaseFilter.all => widget.queue,
    };

    final term = _search.trim().toLowerCase();
    if (term.isEmpty) return byFilter.toList();
    return byFilter
        .where((i) =>
            i.borrowerName.toLowerCase().contains(term) ||
            i.borrowerPhone.contains(term) ||
            i.loanNumber.toLowerCase().contains(term))
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    final items = _apply(_filter);

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 20,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Cases',
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w700,
                color: AppColors.text,
              ),
            ),
            Text(
              '${widget.queue.length} assigned to you today',
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
          preferredSize: const Size.fromHeight(104),
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 10),
                child: TextField(
                  controller: _searchController,
                  onChanged: (value) => setState(() => _search = value),
                  style: const TextStyle(fontSize: 14, color: AppColors.text),
                  decoration: InputDecoration(
                    isDense: true,
                    hintText: 'Search name, phone or loan number',
                    prefixIcon: const Padding(
                      padding: EdgeInsets.only(left: 12, right: 8),
                      child: HugeIcon(
                        icon: AppIcons.search,
                        size: 17,
                        color: AppColors.textLabel,
                      ),
                    ),
                    prefixIconConstraints:
                        const BoxConstraints(minWidth: 0, minHeight: 0),
                    suffixIcon: _search.isEmpty
                        ? null
                        : IconButton(
                            icon: const HugeIcon(icon: AppIcons.clear, size: 17),
                            color: AppColors.textLabel,
                            onPressed: () {
                              _searchController.clear();
                              setState(() => _search = '');
                            },
                          ),
                    fillColor: AppColors.surfaceMuted,
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
                      borderSide:
                          const BorderSide(color: AppColors.primary, width: 1.4),
                    ),
                  ),
                ),
              ),
              SizedBox(
                height: 42,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  children: CaseFilter.values.map(_chip).toList(),
                ),
              ),
            ],
          ),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: widget.onRefresh,
        color: AppColors.primary,
        child: _body(items),
      ),
    );
  }

  Widget _chip(CaseFilter filter) {
    final selected = _filter == filter;
    final count = _apply(filter).length;
    final alarming = filter == CaseFilter.brokenPtp && count > 0;
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

  Widget _body(List<LoanAssignment> items) {
    if (widget.loading && widget.queue.isEmpty) {
      return const Center(
        child: CircularProgressIndicator(color: AppColors.primary),
      );
    }

    if (items.isEmpty) {
      // Distinguishes "nothing assigned" from "nothing matched your search" —
      // a blank list otherwise reads as a broken screen.
      final searching = _search.trim().isNotEmpty;
      return ListView(
        children: [
          SizedBox(height: MediaQuery.of(context).size.height * 0.15),
          EmptyState(
            icon: searching ? AppIcons.search : AppIcons.inbox,
            title: searching
                ? 'No case matches "${_search.trim()}"'
                : _emptyTitle(),
            detail: searching
                ? 'Try a different name, phone number or loan number.'
                : _emptyDetail(),
          ),
        ],
      );
    }

    return Column(
      children: [
        if (widget.error != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
            child:
                ErrorBanner(message: widget.error!, onRetry: widget.onRefresh),
          ),
        Expanded(
          child: ListView.separated(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
            itemCount: items.length,
            separatorBuilder: (_, _) => const SizedBox(height: 10),
            itemBuilder: (context, index) {
              final item = items[index];
              return CaseRow(
                item: item,
                onTap: () => Navigator.of(context)
                    .push(MaterialPageRoute(
                        builder: (_) => CaseDetailScreen(item: item)))
                    .then((_) => widget.onRefresh()),
              );
            },
          ),
        ),
      ],
    );
  }

  String _emptyTitle() => switch (_filter) {
        CaseFilter.toDo => widget.queue.isEmpty
            ? 'No cases assigned today'
            : 'Everything worked',
        CaseFilter.worked => 'Nothing worked yet',
        CaseFilter.promises => 'No promises outstanding',
        CaseFilter.brokenPtp => 'No broken promises',
        CaseFilter.all => 'No cases assigned today',
      };

  String _emptyDetail() => switch (_filter) {
        CaseFilter.toDo => widget.queue.isEmpty
            ? 'Your supervisor assigns cases each morning.'
            : 'Every case in today\'s queue has been contacted.',
        CaseFilter.worked => 'Cases you contact today will appear here.',
        CaseFilter.promises => 'Promises you secure will be listed here.',
        CaseFilter.brokenPtp => 'Nobody has missed a promise yet.',
        CaseFilter.all => 'Your supervisor assigns cases each morning.',
      };
}
