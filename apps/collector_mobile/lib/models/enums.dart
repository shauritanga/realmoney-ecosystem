/// Vocabularies shared with the backend (`apps/backend/src/database/enums.ts`).
///
/// Labels are in English with a Swahili subtitle where a collector reads them aloud
/// or repeats them to a borrower, matching the app's existing Swahili message
/// templates.
library;

/// The action the collector took. All seven backend values, including `PAID`, which
/// the old dialog omitted even though the API has always accepted it.
const dispositionLabels = <String, String>{
  'PROMISED_TO_PAY': 'Promise to pay',
  'CALLBACK_REQUESTED': 'Callback requested',
  'DISPUTED': 'Disputes the amount',
  'REFUSED_TO_PAY': 'Refused to pay',
  'UNREACHABLE': 'Could not reach',
  'WRONG_NUMBER': 'Wrong number',
  'PAID': 'Already paid',
};

const dispositionOrder = <String>[
  'PROMISED_TO_PAY',
  'CALLBACK_REQUESTED',
  'PAID',
  'DISPUTED',
  'REFUSED_TO_PAY',
  'UNREACHABLE',
  'WRONG_NUMBER',
];

/// What the borrower actually said — recorded separately from the action taken.
const outcomeLabels = <String, String>{
  'WILL_PAY_NOW': 'Will pay now',
  'WILL_PAY_LATER': 'Will pay later',
  'PARTIAL_ONLY': 'Can pay part only',
  'NO_MONEY': 'Has no money',
  'LOST_JOB': 'Lost income',
  'ILLNESS_EMERGENCY': 'Illness / emergency',
  'DISPUTES_AMOUNT': 'Disputes the amount',
  'CLAIMS_ALREADY_PAID': 'Says already paid',
  'THIRD_PARTY_ANSWERED': 'Someone else answered',
  'NO_ANSWER': 'No answer',
  'PHONE_OFF': 'Phone off',
  'OTHER': 'Other',
};

/// Offered when the collector reached the borrower.
const reachedOutcomes = <String>[
  'WILL_PAY_NOW',
  'WILL_PAY_LATER',
  'PARTIAL_ONLY',
  'NO_MONEY',
  'LOST_JOB',
  'ILLNESS_EMERGENCY',
  'DISPUTES_AMOUNT',
  'CLAIMS_ALREADY_PAID',
  'OTHER',
];

/// Offered when they did not.
const unreachedOutcomes = <String>[
  'NO_ANSWER',
  'PHONE_OFF',
  'THIRD_PARTY_ANSWERED',
  'OTHER',
];

/// Dispositions that require the collector to say what the customer said.
const outcomeRequiredFor = <String>[
  'PROMISED_TO_PAY',
  'CALLBACK_REQUESTED',
  'DISPUTED',
  'REFUSED_TO_PAY',
];

const callOutcomeLabels = <String, String>{
  'ANSWERED': 'Answered',
  'NO_ANSWER': 'No answer',
  'MISSED': 'Missed',
  'DECLINED': 'Declined',
  'BUSY': 'Busy',
  'UNKNOWN': 'Unknown',
};

/// Where a recorded duration came from. `CALL_LOG` is the only one the collector
/// cannot influence, which is what makes it worth distinguishing.
const durationSourceLabels = <String, String>{
  'CALL_LOG': 'Verified from call log',
  'IN_APP_TIMER': 'Timed in app',
  'MANUAL': 'Self-reported',
  'NONE': 'Not recorded',
};
