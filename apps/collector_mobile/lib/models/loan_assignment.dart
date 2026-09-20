class LoanAssignment {
  final String assignmentId;
  final String assignedAt;
  final String loanId;
  final String loanNumber;
  final String borrowerName;
  final String borrowerPhone;
  final String borrowerAddress;
  final double principalAmount;
  final double outstandingBalance;
  final double penaltyAmount;
  final int daysOverdue;
  final String agingBucket;
  final String dueDate;
  final String level;
  final String levelLabel;
  final int daysToDue;
  final Map<String, dynamic>? activePtp;
  final List<dynamic> recentInteractions;

  LoanAssignment({
    required this.assignmentId,
    required this.assignedAt,
    required this.loanId,
    required this.loanNumber,
    required this.borrowerName,
    required this.borrowerPhone,
    required this.borrowerAddress,
    required this.principalAmount,
    required this.outstandingBalance,
    required this.penaltyAmount,
    required this.daysOverdue,
    required this.agingBucket,
    required this.dueDate,
    required this.level,
    required this.levelLabel,
    required this.daysToDue,
    this.activePtp,
    required this.recentInteractions,
  });

  factory LoanAssignment.fromJson(Map<String, dynamic> json) {
    final loan = json['loan'] as Map<String, dynamic>;
    final borrower = loan['borrower'] as Map<String, dynamic>;

    return LoanAssignment(
      assignmentId: json['assignmentId'] ?? '',
      assignedAt: json['assignedAt'] ?? '',
      loanId: loan['id'] ?? '',
      loanNumber: loan['loanNumber'] ?? '',
      borrowerName: borrower['fullName'] ?? 'Unknown',
      borrowerPhone: borrower['phone'] ?? '',
      borrowerAddress: borrower['address'] ?? 'N/A',
      principalAmount: double.tryParse(loan['principalAmount'].toString()) ?? 0.0,
      outstandingBalance: double.tryParse(loan['outstandingBalance'].toString()) ?? 0.0,
      penaltyAmount: double.tryParse(loan['penaltyAmount']?.toString() ?? '0') ?? 0.0,
      daysOverdue: loan['daysOverdue'] ?? 0,
      agingBucket: loan['agingBucket'] ?? 'CURRENT',
      dueDate: loan['dueDate'] ?? '',
      level: json['level'] ?? 'T3',
      levelLabel: json['levelLabel'] ?? 'T3',
      daysToDue: (json['daysToDue'] as num?)?.toInt() ?? 0,
      activePtp: json['activePtp'],
      recentInteractions: json['recentInteractions'] ?? [],
    );
  }
}
