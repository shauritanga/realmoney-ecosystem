import { useState, useEffect } from 'react';
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
  defaultOpen = false,
}: {
  borrowerId: string;
  token: string | null;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  useEffect(() => {
    if (defaultOpen && token) {
      void load();
    }
  }, [defaultOpen, borrowerId, token]);

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

  async function approveIdentity() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/v1/admin/borrowers/${borrowerId}/identity/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (!response.ok) throw new Error('Unable to approve identity. Please retry.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to approve identity');
    } finally {
      setLoading(false);
    }
  }

  async function resetIdentity() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/v1/admin/borrowers/${borrowerId}/identity/reset`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Admin requested recapture of identity document' }),
      });
      if (!response.ok) throw new Error('Unable to reset identity. Please retry.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to reset identity');
    } finally {
      setLoading(false);
    }
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
                  {profile.identityVerification.sessionReference && (
                    <div className="mt-3 space-y-2">
                      <span className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                        Captured Identity Documents &amp; Selfie:
                      </span>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        {/* Front ID */}
                        <div className="flex flex-col rounded-lg border border-zinc-200 bg-white p-2 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
                          <div className="mb-1.5 flex items-center justify-between text-[11px]">
                            <span className="font-semibold text-zinc-700 dark:text-zinc-300">Front Document</span>
                            <a
                              href={`/capture/${profile.identityVerification.sessionReference}/assets/front.jpg`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10px] text-emerald-600 hover:underline dark:text-emerald-400"
                            >
                              Open ↗
                            </a>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedImage(`/capture/${profile.identityVerification?.sessionReference}/assets/front.jpg`)}
                            className="group relative flex h-36 w-full items-center justify-center overflow-hidden rounded-md bg-zinc-100 transition hover:ring-2 hover:ring-emerald-500 dark:bg-zinc-800"
                            title="Click to view full size"
                          >
                            <img
                              src={`/capture/${profile.identityVerification.sessionReference}/assets/front.jpg`}
                              alt="Front Document"
                              className="h-full w-full object-contain transition group-hover:scale-105"
                              onError={(e) => {
                                (e.currentTarget.parentElement as HTMLElement).innerHTML = '<span class="text-[11px] text-zinc-400">No front photo</span>';
                              }}
                            />
                          </button>
                        </div>

                        {/* Back ID */}
                        <div className="flex flex-col rounded-lg border border-zinc-200 bg-white p-2 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
                          <div className="mb-1.5 flex items-center justify-between text-[11px]">
                            <span className="font-semibold text-zinc-700 dark:text-zinc-300">Back Document</span>
                            <a
                              href={`/capture/${profile.identityVerification.sessionReference}/assets/back.jpg`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10px] text-emerald-600 hover:underline dark:text-emerald-400"
                            >
                              Open ↗
                            </a>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedImage(`/capture/${profile.identityVerification?.sessionReference}/assets/back.jpg`)}
                            className="group relative flex h-36 w-full items-center justify-center overflow-hidden rounded-md bg-zinc-100 transition hover:ring-2 hover:ring-emerald-500 dark:bg-zinc-800"
                            title="Click to view full size"
                          >
                            <img
                              src={`/capture/${profile.identityVerification.sessionReference}/assets/back.jpg`}
                              alt="Back Document"
                              className="h-full w-full object-contain transition group-hover:scale-105"
                              onError={(e) => {
                                (e.currentTarget.parentElement as HTMLElement).innerHTML = '<span class="text-[11px] text-zinc-400">No back photo</span>';
                              }}
                            />
                          </button>
                        </div>

                        {/* Live Selfie */}
                        <div className="flex flex-col rounded-lg border border-zinc-200 bg-white p-2 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
                          <div className="mb-1.5 flex items-center justify-between text-[11px]">
                            <span className="font-semibold text-zinc-700 dark:text-zinc-300">Live Selfie</span>
                            <a
                              href={`/capture/${profile.identityVerification.sessionReference}/assets/selfie_0.jpg`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10px] text-emerald-600 hover:underline dark:text-emerald-400"
                            >
                              Open ↗
                            </a>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedImage(`/capture/${profile.identityVerification?.sessionReference}/assets/selfie_0.jpg`)}
                            className="group relative flex h-36 w-full items-center justify-center overflow-hidden rounded-md bg-zinc-100 transition hover:ring-2 hover:ring-emerald-500 dark:bg-zinc-800"
                            title="Click to view full size"
                          >
                            <img
                              src={`/capture/${profile.identityVerification.sessionReference}/assets/selfie_0.jpg`}
                              alt="Live Selfie"
                              className="h-full w-full object-contain transition group-hover:scale-105"
                              onError={(e) => {
                                (e.currentTarget.parentElement as HTMLElement).innerHTML = '<span class="text-[11px] text-zinc-400">No selfie photo</span>';
                              }}
                            />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedImage && (
                    <div
                      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs"
                      onClick={() => setSelectedImage(null)}
                    >
                      <div
                        className="relative max-h-[92vh] max-w-4xl overflow-hidden rounded-2xl bg-zinc-900 p-2 shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="mb-2 flex items-center justify-between px-2 pt-1 text-white">
                          <span className="text-xs font-semibold">Evidence Inspection</span>
                          <button
                            type="button"
                            onClick={() => setSelectedImage(null)}
                            className="rounded-lg bg-zinc-800 px-2.5 py-1 text-xs font-bold text-zinc-300 hover:bg-zinc-700 hover:text-white"
                          >
                            Close ✕
                          </button>
                        </div>
                        <div className="flex items-center justify-center">
                          <img
                            src={selectedImage}
                            alt="Enlarged evidence"
                            className="max-h-[80vh] w-auto max-w-full rounded-lg object-contain shadow-lg"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {['capture_required', 'processing', 'review'].includes(profile.identityVerification.status) && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-200 pt-2 dark:border-zinc-800">
                      <button
                        type="button"
                        onClick={() => void approveIdentity()}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 font-bold text-white shadow-xs hover:bg-emerald-500"
                      >
                        Approve Identity (Manual Override)
                      </button>
                      <button
                        type="button"
                        onClick={() => void resetIdentity()}
                        className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300"
                      >
                        Request Recapture
                      </button>
                      <button
                        type="button"
                        onClick={() => void refreshIdentity()}
                        className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                      >
                        Refresh Provider
                      </button>
                    </div>
                  )}
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
