import { useEffect, useState } from 'react';
import { Modal } from './Modal';

/** What an extension would cost, as the server priced it. */
export interface ExtensionQuote {
  fee: number;
  newDueDate: string;
  extensionsRemaining: number;
  eligible: boolean;
  reason: string | null;
}

export interface PushTarget {
  loanId: string;
  borrowerName: string;
  borrowerPhone: string;
  outstandingBalance: number;
}

/**
 * Asks a borrower to pay, or offers them more time.
 *
 * Replaces a bare "Push USSD" button that was hard-wired to the whole outstanding
 * balance — so an admin taking a call from a borrower who could pay half had no way
 * to send them a prompt for half.
 */
export function PushPaymentModal({
  target,
  onClose,
  onPay,
  onExtend,
  loadQuote,
}: {
  target: PushTarget | null;
  onClose: () => void;
  onPay: (args: { loanId: string; amount: number; payerPhone?: string; payerName?: string }) => Promise<void>;
  onExtend: (args: { loanId: string; payerPhone?: string; payerName?: string }) => Promise<void>;
  loadQuote: (loanId: string) => Promise<ExtensionQuote | null>;
}) {
  const [mode, setMode] = useState<'pay' | 'extend'>('pay');
  const [amount, setAmount] = useState('');
  const [thirdParty, setThirdParty] = useState(false);
  const [payerPhone, setPayerPhone] = useState('');
  const [payerName, setPayerName] = useState('');
  const [quote, setQuote] = useState<ExtensionQuote | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset every time a different loan is opened, so the previous borrower's amount
  // and payer never leak into the next prompt.
  useEffect(() => {
    if (!target) return;
    setMode('pay');
    setAmount(String(Math.round(Number(target.outstandingBalance))));
    setThirdParty(false);
    setPayerPhone('');
    setPayerName('');
    setQuote(null);
    setError(null);
  }, [target]);

  if (!target) return null;

  const outstanding = Number(target.outstandingBalance);

  async function switchToExtend() {
    setMode('extend');
    setError(null);
    if (quote || loadingQuote || !target) return;
    setLoadingQuote(true);
    try {
      setQuote(await loadQuote(target.loanId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not price an extension.');
    } finally {
      setLoadingQuote(false);
    }
  }

  function validatePayer(): string | null {
    if (!thirdParty) return null;
    const cleaned = payerPhone.replace(/[\s()-]/g, '').trim();
    if (!cleaned) return 'Enter the number of the person paying.';
    // Mirrors the server's own rule, so a rejection never arrives a round trip later.
    if (!/^(?:\+?255|0)[67]\d{8}$/.test(cleaned)) {
      return 'That is not a valid Tanzanian mobile number.';
    }
    return null;
  }

  async function submit() {
    const payerError = validatePayer();
    if (payerError) return setError(payerError);

    const payer = thirdParty
      ? { payerPhone: payerPhone.trim(), payerName: payerName.trim() || undefined }
      : {};

    if (mode === 'extend') {
      if (!quote?.eligible) return setError(quote?.reason ?? 'This loan cannot be extended.');
      setBusy(true);
      try {
        await onExtend({ loanId: target!.loanId, ...payer });
        onClose();
      } finally {
        setBusy(false);
      }
      return;
    }

    const value = Number(amount.replace(/,/g, '').trim());
    if (!Number.isFinite(value) || value <= 0) return setError('Enter an amount.');
    if (value < 500) return setError('The smallest payment is TZS 500.');
    if (value > outstanding) return setError('More than the outstanding balance.');

    setBusy(true);
    try {
      await onPay({ loanId: target!.loanId, amount: value, ...payer });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  const tab = (value: 'pay' | 'extend', label: string) => (
    <button
      type="button"
      onClick={() => (value === 'extend' ? void switchToExtend() : (setMode('pay'), setError(null)))}
      className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition ${
        mode === value
          ? 'bg-white text-emerald-600 shadow-xs dark:bg-zinc-800 dark:text-emerald-400'
          : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
      }`}
    >
      {label}
    </button>
  );

  const field =
    'w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100';

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === 'extend' ? 'Extend the due date' : 'Request payment'}
      subtitle={`${target.borrowerName} · ${target.borrowerPhone}`}
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-xs font-semibold text-zinc-500 hover:text-zinc-700 dark:text-zinc-400"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-400 disabled:opacity-50"
          >
            {busy ? 'Sending…' : mode === 'extend' ? 'Send fee request' : 'Send prompt'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-900">
          {tab('pay', 'Payment')}
          {tab('extend', 'Extension')}
        </div>

        {mode === 'pay' ? (
          <div className="space-y-2">
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              Amount (TZS)
            </label>
            <input
              className={field}
              value={amount}
              inputMode="numeric"
              onChange={(event) => {
                setAmount(event.target.value);
                setError(null);
              }}
            />
            {/* A borrower who offers "half" should not make the admin do arithmetic. */}
            <div className="flex gap-2">
              {([['25%', 0.25], ['50%', 0.5], ['Full', 1]] as const).map(([label, fraction]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    setAmount(String(Math.round(outstanding * fraction)));
                    setError(null);
                  }}
                  className="flex-1 rounded-lg border border-zinc-200 py-1.5 text-xs font-semibold text-zinc-600 transition hover:border-emerald-400 dark:border-zinc-700 dark:text-zinc-300"
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-zinc-500">
              Outstanding {outstanding.toLocaleString('en-US')}
            </p>
          </div>
        ) : (
          <ExtensionPanel quote={quote} loading={loadingQuote} />
        )}

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={thirdParty}
              onChange={(event) => {
                setThirdParty(event.target.checked);
                setError(null);
              }}
              className="size-4 accent-emerald-500"
            />
            Someone else is paying
          </label>
          {thirdParty && (
            <div className="space-y-2">
              <input
                className={field}
                placeholder="Their mobile number"
                value={payerPhone}
                onChange={(event) => {
                  setPayerPhone(event.target.value);
                  setError(null);
                }}
              />
              <input
                className={field}
                placeholder="Their name (optional)"
                value={payerName}
                onChange={(event) => setPayerName(event.target.value)}
              />
            </div>
          )}
        </div>

        {error && <p className="text-xs font-medium text-rose-600 dark:text-rose-400">{error}</p>}
      </div>
    </Modal>
  );
}

function ExtensionPanel({ quote, loading }: { quote: ExtensionQuote | null; loading: boolean }) {
  if (loading) {
    return <p className="py-4 text-center text-xs text-zinc-500">Pricing an extension…</p>;
  }
  if (!quote) {
    return <p className="text-xs text-zinc-500">Extension terms are unavailable for this loan.</p>;
  }
  if (!quote.eligible) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
        {quote.reason ?? 'This loan cannot be extended.'}
      </div>
    );
  }
  return (
    <div className="rounded-xl bg-zinc-50 p-4 dark:bg-zinc-900">
      <strong className="block text-xl font-bold text-zinc-900 dark:text-zinc-50">
        TZS {Math.round(quote.fee).toLocaleString('en-US')}
      </strong>
      <p className="mt-1 text-xs text-zinc-700 dark:text-zinc-300">
        Moves the due date to {new Date(quote.newDueDate).toLocaleDateString()}.
      </p>
      {/* The single thing borrowers most often misunderstand about an extension. */}
      <p className="mt-1 text-xs text-zinc-500">
        The balance does not change — this buys time only.
      </p>
      {quote.extensionsRemaining <= 1 && (
        <p className="mt-2 text-xs font-semibold text-amber-600 dark:text-amber-400">
          {quote.extensionsRemaining === 1
            ? 'This is the last extension available on this loan.'
            : 'No further extensions after this one.'}
        </p>
      )}
    </div>
  );
}
