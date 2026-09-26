export const money = (value: unknown) => `TZS ${Number(value || 0).toLocaleString()}`;

export function statusTone(status: string) {
  if (status === 'ACTIVE') {
    return 'bg-blue-500/10 text-blue-700 dark:text-blue-400 ring-blue-500/30';
  }
  if (status === 'OVERDUE' || status === 'DEFAULTED') {
    return 'bg-rose-500/10 text-rose-700 dark:text-rose-400 ring-rose-500/30';
  }
  if (status === 'SETTLED') {
    return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-emerald-500/30';
  }
  if (status === 'PENDING' || status === 'APPROVED') {
    return 'bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-amber-500/30';
  }
  return 'bg-zinc-500/10 text-zinc-700 dark:text-zinc-400 ring-zinc-500/30';
}

/**
 * Talk time, in the units a supervisor reads at a glance.
 *
 * Distinguishes "not recorded" from "zero seconds": every interaction logged before
 * call-duration capture shipped has durationSeconds = 0, and rendering those as "0s"
 * would claim every historical call was silent.
 */
export function formatDuration(seconds: unknown, opts: { recorded?: boolean } = {}) {
  if (opts.recorded === false) return '—';
  const total = Math.max(0, Math.round(Number(seconds || 0)));
  if (!Number.isFinite(total)) return '—';
  if (total === 0) return '0s';
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  if (minutes < 60) return `${minutes}m ${String(secs).padStart(2, '0')}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`;
}

/** Collections reports are read in Tanzania; render timestamps there, not in UTC. */
const EAT = 'Africa/Nairobi';

export function formatDateTime(value: unknown) {
  if (!value) return '—';
  const date = new Date(value as string);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: EAT,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatDate(value: unknown) {
  if (!value) return '—';
  const date = new Date(value as string);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: EAT,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function formatRelative(value: unknown) {
  if (!value) return 'no contact';
  const date = new Date(value as string);
  if (Number.isNaN(date.getTime())) return 'no contact';
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  const days = Math.floor(seconds / 86400);
  if (days < 30) return `${days}d ago`;
  return formatDate(value);
}

/** A rate that may legitimately not apply — null renders as a dash, never as 0%. */
export function percent(value: unknown, digits = 0) {
  if (value === null || value === undefined) return '—';
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return `${(num * 100).toFixed(digits)}%`;
}

/**
 * Channel labels.
 *
 * SMS and WhatsApp are handed to the phone's own app, so the platform never learns
 * whether they arrived. Saying "initiated" here means every surface inherits that
 * honesty for free rather than each page choosing its own wording.
 */
export const CHANNEL_LABEL: Record<string, string> = {
  CALL: 'Calls',
  SMS: 'SMS initiated',
  WHATSAPP: 'WhatsApp initiated',
};

export const DISPOSITION_LABEL: Record<string, string> = {
  PROMISED_TO_PAY: 'Promise to pay',
  CALLBACK_REQUESTED: 'Callback requested',
  DISPUTED: 'Disputed amount',
  REFUSED_TO_PAY: 'Refused to pay',
  UNREACHABLE: 'Unreachable',
  WRONG_NUMBER: 'Wrong number',
  PAID: 'Paid',
};

export const OUTCOME_LABEL: Record<string, string> = {
  WILL_PAY_NOW: 'Will pay now',
  WILL_PAY_LATER: 'Will pay later',
  PARTIAL_ONLY: 'Can pay part only',
  NO_MONEY: 'No money',
  LOST_JOB: 'Lost income',
  ILLNESS_EMERGENCY: 'Illness or emergency',
  DISPUTES_AMOUNT: 'Disputes the amount',
  CLAIMS_ALREADY_PAID: 'Claims already paid',
  THIRD_PARTY_ANSWERED: 'Someone else answered',
  NO_ANSWER: 'No answer',
  PHONE_OFF: 'Phone off',
  OTHER: 'Other',
};

export const CALL_OUTCOME_LABEL: Record<string, string> = {
  ANSWERED: 'Answered',
  NO_ANSWER: 'No answer',
  MISSED: 'Missed',
  DECLINED: 'Declined',
  BUSY: 'Busy',
  UNKNOWN: 'Unknown',
};

/** Where a duration came from, so a reader can tell measured from claimed. */
export const DURATION_SOURCE_LABEL: Record<string, string> = {
  CALL_LOG: 'Verified from call log',
  IN_APP_TIMER: 'Timed in app',
  MANUAL: 'Self-reported',
  NONE: 'Not recorded',
};

const TONE_ZINC = 'bg-zinc-500/10 text-zinc-700 dark:text-zinc-400 ring-zinc-500/30';

export function channelTone(channel: string) {
  if (channel === 'CALL') return 'bg-blue-500/10 text-blue-700 dark:text-blue-400 ring-blue-500/30';
  if (channel === 'WHATSAPP') {
    return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-emerald-500/30';
  }
  if (channel === 'SMS') {
    return 'bg-violet-500/10 text-violet-700 dark:text-violet-400 ring-violet-500/30';
  }
  return TONE_ZINC;
}

export function dispositionTone(disposition: string) {
  if (disposition === 'PAID' || disposition === 'PROMISED_TO_PAY') {
    return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-emerald-500/30';
  }
  if (disposition === 'CALLBACK_REQUESTED' || disposition === 'DISPUTED') {
    return 'bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-amber-500/30';
  }
  if (disposition === 'REFUSED_TO_PAY') {
    return 'bg-rose-500/10 text-rose-700 dark:text-rose-400 ring-rose-500/30';
  }
  return TONE_ZINC;
}

export function ptpTone(status: string) {
  if (status === 'HONORED') {
    return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-emerald-500/30';
  }
  if (status === 'BROKEN' || status === 'OVERDUE') {
    return 'bg-rose-500/10 text-rose-700 dark:text-rose-400 ring-rose-500/30';
  }
  if (status === 'PENDING') {
    return 'bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-amber-500/30';
  }
  return TONE_ZINC;
}

/** Verified talk time reads as trustworthy; self-reported reads as a caveat. */
export function durationSourceTone(source: string | null | undefined) {
  if (source === 'CALL_LOG') {
    return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-emerald-500/30';
  }
  if (source === 'IN_APP_TIMER') {
    return 'bg-blue-500/10 text-blue-700 dark:text-blue-400 ring-blue-500/30';
  }
  if (source === 'MANUAL') {
    return 'bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-amber-500/30';
  }
  return TONE_ZINC;
}
