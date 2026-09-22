import { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Location01Icon } from '@hugeicons/core-free-icons';

interface Profile {
  fullName: string;
  registrationComplete: boolean;
  identityVerified: boolean;
  walletVerified: boolean;
  financialComplete: boolean;
  identityVerification?: {
    status: string;
    sessionReference?: string;
    mode?: string;
    completedAt?: string;
    checks?: Record<string, boolean>;
  };
  onboarding: {
    region: string;
    district: string;
    ward: string;
    street: string;
    financial?: {
      employmentStatus: string;
      occupation: string;
      monthlyIncome: number;
      essentialExpenses: number;
      existingLoanRepayments: number;
      updatedAt: string;
    };
  } | null;
}

export function BorrowerReview({
  borrowerId,
  token,
}: {
  borrowerId: string;
  token: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setOpen(true);
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/v1/admin/borrowers/${borrowerId}/onboarding`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Unable to load borrower details. Please retry.');
      setProfile(await response.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load details');
    } finally {
      setLoading(false);
    }
  }

  async function refreshIdentity() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/v1/admin/borrowers/${borrowerId}/identity/refresh`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Unable to refresh verification. Please retry.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to refresh verification');
    } finally { setLoading(false); }
  }

  const financial = profile?.onboarding?.financial;

  return (
    <div className="mt-3 max-w-xl text-sm">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : void load())}
        className="text-xs font-semibold text-emerald-600 underline underline-offset-4 transition hover:text-emerald-700 focus-visible:outline-2 focus-visible:outline-emerald-400 dark:text-emerald-400 dark:hover:text-emerald-300"
      >
        {open ? 'Hide borrower review' : 'Review identity and affordability'}
      </button>

      {open && (
        <div className="mt-3 space-y-3 rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-300">
          {loading && <p role="status" className="text-zinc-500 dark:text-zinc-400">Loading borrower details…</p>}
          {error && (
            <p role="alert" className="text-rose-600 dark:text-rose-400">
              {error}{' '}
              <button type="button" onClick={() => void load()} className="font-semibold underline">
                Retry
              </button>
            </p>
          )}
          {!loading && profile && (
            <>
              <p>
                <span className="text-zinc-500 dark:text-zinc-400">Identity:</span>{' '}
                <strong className="text-zinc-900 dark:text-white">
                  {profile.identityVerified ? 'Verified' : 'Incomplete'}
                </strong>{' '}
                · <span className="text-zinc-500 dark:text-zinc-400">Wallet:</span>{' '}
                <strong className="text-zinc-900 dark:text-white">
                  {profile.walletVerified ? 'Verified' : 'Incomplete'}
                </strong>
              </p>
              <p>
                <span className="text-zinc-500 dark:text-zinc-400">Registration:</span>{' '}
                <strong className="text-zinc-900 dark:text-white">
                  {profile.registrationComplete ? 'Complete' : 'Incomplete'}
                </strong>{' '}
                · <span className="text-zinc-500 dark:text-zinc-400">Income details:</span>{' '}
                <strong className="text-zinc-900 dark:text-white">
                  {profile.financialComplete ? 'Current' : 'Missing or expired'}
                </strong>
              </p>
              {profile.identityVerification && (
                <div className="space-y-2">
                  <p>Document &amp; live selfie: <strong>{profile.identityVerification.status.replaceAll('_', ' ')}</strong></p>
                  {profile.identityVerification.mode === 'development' && <p className="text-amber-700">Development evidence — not live verification.</p>}
                  {profile.identityVerification.sessionReference && <p>Provider reference: <span className="select-all font-mono">{profile.identityVerification.sessionReference}</span></p>}
                  {profile.identityVerification.checks && <dl className="grid grid-cols-2 gap-2">
                    {Object.entries({ documentAuthenticity: 'Document authenticity', documentSides: 'Required document sides', registrationMatch: 'Registration details match', liveness: 'Liveness', faceMatch: 'Face match' }).map(([key, label]) => (
                      <div key={key}><dt>{label}</dt><dd>{profile.identityVerification?.checks?.[key] ? 'Passed' : 'Needs review'}</dd></div>
                    ))}
                  </dl>}
                  {['capture_required', 'processing', 'review'].includes(profile.identityVerification.status) && <>
                    <p>Complete any manual review in the approved provider console, then refresh. Approval still requires all identity checks to pass.</p>
                    <button type="button" onClick={() => void refreshIdentity()} className="font-semibold text-emerald-700 underline dark:text-emerald-400">Refresh provider result</button>
                  </>}
                </div>
              )}
              {profile.onboarding && (
                <p className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
                  <HugeiconsIcon icon={Location01Icon} size={14} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span>{[profile.onboarding.region, profile.onboarding.district, profile.onboarding.ward, profile.onboarding.street].join(', ')}</span>
                </p>
              )}
              {financial ? (
                <>
                  <p className="font-medium text-zinc-900 dark:text-white">
                    {financial.occupation} · {financial.employmentStatus.replaceAll('_', ' ').toLowerCase()}
                  </p>
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                    <dt className="text-zinc-500 dark:text-zinc-400">Monthly income</dt>
                    <dd className="font-semibold text-zinc-900 dark:text-white">
                      TZS {Number(financial.monthlyIncome).toLocaleString()}
                    </dd>
                    <dt className="text-zinc-500 dark:text-zinc-400">Essential expenses</dt>
                    <dd className="font-semibold text-zinc-900 dark:text-white">
                      TZS {Number(financial.essentialExpenses).toLocaleString()}
                    </dd>
                    <dt className="text-zinc-500 dark:text-zinc-400">Existing loan repayments</dt>
                    <dd className="font-semibold text-zinc-900 dark:text-white">
                      TZS {Number(financial.existingLoanRepayments).toLocaleString()}
                    </dd>
                    <dt className="text-zinc-500 dark:text-zinc-400">Remaining monthly income</dt>
                    <dd className="font-semibold text-emerald-600 dark:text-emerald-400">
                      TZS {(financial.monthlyIncome - financial.essentialExpenses - financial.existingLoanRepayments).toLocaleString()}
                    </dd>
                  </dl>
                  <p className="border-t border-zinc-200 pt-2 text-[11px] text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                    Borrower-declared figures, updated {new Date(financial.updatedAt).toLocaleDateString()}. Assess affordability for this loan’s actual repayment period before approval.
                  </p>
                </>
              ) : (
                <p className="text-zinc-500 dark:text-zinc-400">No income information submitted.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
