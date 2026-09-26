import 'extension_offer.dart';
import 'interaction_log.dart';
import 'ptp.dart';

/// One case in a collector's queue.
///
/// The activity fields below are computed by the server rather than inferred here.
/// The app used to derive "worked today" from a three-item preview of interactions,
/// so a case touched four times in a day silently fell out of the window and looked
/// untouched.
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

  final Ptp? activePtp;

  /// 'NONE' | 'PENDING' | 'OVERDUE' | 'BROKEN', derived server-side so the app and
  /// the dashboard cannot disagree about whether a promise is broken.
  final String ptpState;

  final bool workedToday;
  final int touchesToday;
  final int talkTimeTodaySeconds;
  final DateTime? lastContactAt;
  final String? lastDisposition;
  final DateTime? nextFollowUpAt;

  /// How many times the due date has already been bought. A case extended twice is
  /// the point at which a service starts becoming a trap, so the collector sees it.
  final int extensionCount;

  /// The date the borrower originally agreed to, when an extension has moved
  /// [dueDate] past it. Null when the loan has never been extended.
  final String? originalDueDate;

  /// Live extension terms. Only the single-case endpoint prices these -- the queue
  /// carries [extensionCount] alone, because pricing 45 cases nobody will extend is
  /// work for nothing.
  final ExtensionOffer? extensionOffer;

  /// A short preview for the row; the full history has its own endpoint.
  final List<InteractionLog> recentInteractions;

  const LoanAssignment({
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
    required this.recentInteractions,
    this.extensionCount = 0,
    this.originalDueDate,
    this.extensionOffer,
    this.activePtp,
    this.ptpState = 'NONE',
    this.workedToday = false,
    this.touchesToday = 0,
    this.talkTimeTodaySeconds = 0,
    this.lastContactAt,
    this.lastDisposition,
    this.nextFollowUpAt,
  });

  /// Past its deadline, whether or not the sweep has resolved it yet. Both states
  /// mean the same thing to a collector: this borrower missed what they committed to.
  bool get ptpOverdue => ptpState == 'OVERDUE' || ptpState == 'BROKEN';
  bool get hasPendingPtp => ptpState == 'PENDING';

  /// The borrower has paid to move this due date at least once.
  bool get isExtended => extensionCount > 0;

  factory LoanAssignment.fromJson(Map<String, dynamic> json) {
    final loan = json['loan'] as Map<String, dynamic>;
    final borrower = (loan['borrower'] as Map<String, dynamic>?) ?? const {};
    final ptp = json['activePtp'];

    return LoanAssignment(
      assignmentId: json['assignmentId']?.toString() ?? '',
      assignedAt: json['assignedAt']?.toString() ?? '',
      loanId: loan['id']?.toString() ?? '',
      loanNumber: loan['loanNumber']?.toString() ?? '',
      borrowerName: borrower['fullName']?.toString() ?? 'Unknown',
      borrowerPhone: borrower['phone']?.toString() ?? '',
      borrowerAddress: borrower['address']?.toString() ?? 'N/A',
      principalAmount:
          double.tryParse(loan['principalAmount']?.toString() ?? '0') ?? 0,
      outstandingBalance:
          double.tryParse(loan['outstandingBalance']?.toString() ?? '0') ?? 0,
      penaltyAmount: double.tryParse(loan['penaltyAmount']?.toString() ?? '0') ?? 0,
      daysOverdue: (loan['daysOverdue'] as num?)?.toInt() ?? 0,
      agingBucket: loan['agingBucket']?.toString() ?? 'CURRENT',
      dueDate: loan['dueDate']?.toString() ?? '',
      level: json['level']?.toString() ?? 'T3',
      levelLabel: json['levelLabel']?.toString() ?? 'S',
      daysToDue: (json['daysToDue'] as num?)?.toInt() ?? 0,
      extensionCount: (json['extensionCount'] as num?)?.toInt() ?? 0,
      originalDueDate: loan['originalDueDate']?.toString(),
      extensionOffer: ExtensionOffer.fromJson(
        json['extension'] as Map<String, dynamic>?,
      ),
      activePtp: ptp is Map<String, dynamic> ? Ptp.fromJson(ptp) : null,
      ptpState: json['ptpState']?.toString() ?? 'NONE',
      workedToday: json['workedToday'] as bool? ?? false,
      touchesToday: (json['touchesToday'] as num?)?.toInt() ?? 0,
      talkTimeTodaySeconds:
          (json['talkTimeTodaySeconds'] as num?)?.toInt() ?? 0,
      lastContactAt: DateTime.tryParse(json['lastContactAt']?.toString() ?? ''),
      lastDisposition: json['lastDisposition']?.toString(),
      nextFollowUpAt: DateTime.tryParse(json['nextFollowUpAt']?.toString() ?? ''),
      recentInteractions: ((json['recentInteractions'] as List?) ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(InteractionLog.fromJson)
          .toList(),
    );
  }

  /// `GET /collections/cases/:loanId` returns the same fields plus a paginated
  /// history, so one parser covers both by normalising the shape.
  factory LoanAssignment.fromCaseJson(Map<String, dynamic> json) {
    final interactions = json['interactions'];
    return LoanAssignment.fromJson({
      ...json,
      'recentInteractions': interactions is Map ? interactions['items'] : const [],
    });
  }
}
