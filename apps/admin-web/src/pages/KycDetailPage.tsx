import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  ArrowLeft01Icon,
  CheckmarkCircle02Icon,
  Location01Icon,
  RefreshIcon,
  ShieldCheckIcon,
} from '@hugeicons/core-free-icons';
import { Panel, PageHeading } from '../components/ui';
import { useAuth } from '../hooks';

interface BorrowerProfile {
  fullName: string;
  phone?: string;
  nationalId?: string;
  email?: string;
  createdAt?: string;
  registrationComplete: boolean;
  identityVerified: boolean;
  walletVerified: boolean;
  financialComplete: boolean;
  canApply?: boolean;
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

export function KycDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();

  const [profile, setProfile] = useState<BorrowerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  async function loadProfile() {
    if (!id || !token) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/v1/admin/borrowers/${id}/onboarding`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Unable to load borrower verification profile.');
      const data = await res.json();
      setProfile(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load details');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProfile();
  }, [id, token]);

  async function handleApprove() {
    if (!id || !token || actionLoading) return;
    setActionLoading(true);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/v1/admin/borrowers/${id}/identity/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error('Failed to approve identity.');
      setActionMessage('Borrower identity successfully approved.');
      await loadProfile();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approval failed');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRecapture() {
    if (!id || !token || actionLoading) return;
    if (!window.confirm('Are you sure you want to request recapture for this borrower?')) return;
    setActionLoading(true);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/v1/admin/borrowers/${id}/identity/reset`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Admin requested document and selfie recapture' }),
      });
      if (!res.ok) throw new Error('Failed to request recapture.');
      setActionMessage('Identity session reset. Borrower will be prompted to recapture.');
      await loadProfile();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Recapture request failed');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRefreshSession() {
    if (!id || !token || actionLoading) return;
    setActionLoading(true);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/v1/admin/borrowers/${id}/identity/refresh`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to refresh identity session.');
      setActionMessage('Verification status refreshed from verification provider.');
      await loadProfile();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Refresh failed');
    } finally {
      setActionLoading(false);
    }
  }

  const sessionRef = profile?.identityVerification?.sessionReference;
  const financial = profile?.onboarding?.financial;

  return (
    <div className="space-y-6">
      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs">
        <Link
          to="/kyc"
          className="inline-flex items-center gap-1.5 font-medium text-emerald-600 transition hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={14} />
          Identity &amp; KYC
        </Link>
        <span className="text-zinc-400 dark:text-zinc-600">/</span>
        <span className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
          {profile?.fullName || 'Borrower Review'}
        </span>
      </nav>

      {/* Header */}
      <PageHeading
        eyebrow="Compliance inspection"
        title={profile ? profile.fullName : 'Identity Verification'}
        description="Inspect document OCR data, selfie liveness checks, and manage verification decision."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void loadProfile()}
              disabled={loading || actionLoading}
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 shadow-xs hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 disabled:opacity-50"
            >
              <HugeiconsIcon icon={RefreshIcon} size={14} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Refreshing…' : 'Refresh Data'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/kyc')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 shadow-xs hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
            >
              Back to Queue
            </button>
          </div>
        }
      />

      {/* Alert Notices */}
      {actionMessage && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-medium text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200">
          <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} className="text-emerald-600 shrink-0" />
          <span>{actionMessage}</span>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-800 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200">
          {error}
        </div>
      )}

      {loading && !profile ? (
        <Panel>
          <div className="flex min-h-[40vh] items-center justify-center text-xs text-zinc-500">
            Loading borrower verification details…
          </div>
        </Panel>
      ) : profile ? (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left Column: Evidence Photos & Checks */}
          <div className="space-y-6 lg:col-span-2">
            {/* Captured Evidence Gallery */}
            <Panel>
              <div className="mb-4 flex items-center justify-between border-b border-zinc-200 pb-3 dark:border-zinc-800">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Captured Documents &amp; Live Selfie
                  </h3>
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    National ID front, back, and live portrait submitted by the borrower.
                  </p>
                </div>
                {sessionRef && (
                  <span className="font-mono text-[11px] text-zinc-500">
                    Ref: <span className="select-all text-zinc-800 dark:text-zinc-200">{sessionRef}</span>
                  </span>
                )}
              </div>

              {sessionRef ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  {/* Front Document */}
                  <div className="flex flex-col rounded-xl border border-zinc-200 bg-zinc-50/50 p-3 shadow-xs dark:border-zinc-800 dark:bg-zinc-900/50">
                    <div className="mb-2 flex items-center justify-between text-xs">
                      <strong className="text-zinc-800 dark:text-zinc-200">Front Document</strong>
                      <a
                        href={`/capture/${sessionRef}/assets/front.jpg`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-emerald-600 hover:underline dark:text-emerald-400"
                      >
                        Open ↗
                      </a>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedImage(`/capture/${sessionRef}/assets/front.jpg`)}
                      className="group relative flex h-48 w-full items-center justify-center overflow-hidden rounded-lg bg-zinc-200/60 transition hover:ring-2 hover:ring-emerald-500 dark:bg-zinc-800"
                      title="Click to view full size"
                    >
                      <img
                        src={`/capture/${sessionRef}/assets/front.jpg`}
                        alt="Front ID Document"
                        className="h-full w-full object-contain transition group-hover:scale-105"
                        onError={(e) => {
                          (e.currentTarget.parentElement as HTMLElement).innerHTML =
                            '<span class="text-xs text-zinc-400">No front photo captured</span>';
                        }}
                      />
                    </button>
                  </div>

                  {/* Back Document */}
                  <div className="flex flex-col rounded-xl border border-zinc-200 bg-zinc-50/50 p-3 shadow-xs dark:border-zinc-800 dark:bg-zinc-900/50">
                    <div className="mb-2 flex items-center justify-between text-xs">
                      <strong className="text-zinc-800 dark:text-zinc-200">Back Document</strong>
                      <a
                        href={`/capture/${sessionRef}/assets/back.jpg`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-emerald-600 hover:underline dark:text-emerald-400"
                      >
                        Open ↗
                      </a>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedImage(`/capture/${sessionRef}/assets/back.jpg`)}
                      className="group relative flex h-48 w-full items-center justify-center overflow-hidden rounded-lg bg-zinc-200/60 transition hover:ring-2 hover:ring-emerald-500 dark:bg-zinc-800"
                      title="Click to view full size"
                    >
                      <img
                        src={`/capture/${sessionRef}/assets/back.jpg`}
                        alt="Back ID Document"
                        className="h-full w-full object-contain transition group-hover:scale-105"
                        onError={(e) => {
                          (e.currentTarget.parentElement as HTMLElement).innerHTML =
                            '<span class="text-xs text-zinc-400">No back photo captured</span>';
                        }}
                      />
                    </button>
                  </div>

                  {/* Live Selfie */}
                  <div className="flex flex-col rounded-xl border border-zinc-200 bg-zinc-50/50 p-3 shadow-xs dark:border-zinc-800 dark:bg-zinc-900/50">
                    <div className="mb-2 flex items-center justify-between text-xs">
                      <strong className="text-zinc-800 dark:text-zinc-200">Live Selfie</strong>
                      <a
                        href={`/capture/${sessionRef}/assets/selfie_0.jpg`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-emerald-600 hover:underline dark:text-emerald-400"
                      >
                        Open ↗
                      </a>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedImage(`/capture/${sessionRef}/assets/selfie_0.jpg`)}
                      className="group relative flex h-48 w-full items-center justify-center overflow-hidden rounded-lg bg-zinc-200/60 transition hover:ring-2 hover:ring-emerald-500 dark:bg-zinc-800"
                      title="Click to view full size"
                    >
                      <img
                        src={`/capture/${sessionRef}/assets/selfie_0.jpg`}
                        alt="Live Selfie"
                        className="h-full w-full object-contain transition group-hover:scale-105"
                        onError={(e) => {
                          (e.currentTarget.parentElement as HTMLElement).innerHTML =
                            '<span class="text-xs text-zinc-400">No selfie captured</span>';
                        }}
                      />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-zinc-500 dark:text-zinc-400">
                  No identity evidence captured yet for this borrower.
                </div>
              )}
            </Panel>

            {/* Verification Checklist */}
            <Panel>
              <h3 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Automated Verification Checklist
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[
                  { key: 'documentAuthenticity', label: 'Document Authenticity' },
                  { key: 'documentSides', label: 'Required Document Sides (Front & Back)' },
                  { key: 'registrationMatch', label: 'Registration Details Match' },
                  { key: 'liveness', label: 'Liveness Verification' },
                  { key: 'faceMatch', label: 'Face Match (Selfie vs Document Photo)' },
                ].map(({ key, label }) => {
                  const passed = Boolean(profile.identityVerification?.checks?.[key]);
                  return (
                    <div
                      key={key}
                      className={`flex items-center justify-between rounded-xl border p-3 text-xs ${
                        passed
                          ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-950 dark:bg-emerald-950/20'
                          : 'border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900'
                      }`}
                    >
                      <span className="font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
                      <span
                        className={`font-semibold ${
                          passed
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {passed ? '✓ Passed' : 'Needs Review'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Panel>

            {/* Address & Residence */}
            {profile.onboarding && (
              <Panel>
                <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3">
                  <HugeiconsIcon icon={Location01Icon} size={16} className="text-emerald-600 dark:text-emerald-400" />
                  <h3>Residence &amp; Address</h3>
                </div>
                <dl className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
                  <div>
                    <dt className="text-zinc-500 dark:text-zinc-400">Region</dt>
                    <dd className="mt-1 font-semibold text-zinc-900 dark:text-white">
                      {profile.onboarding.region || '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500 dark:text-zinc-400">District</dt>
                    <dd className="mt-1 font-semibold text-zinc-900 dark:text-white">
                      {profile.onboarding.district || '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500 dark:text-zinc-400">Ward</dt>
                    <dd className="mt-1 font-semibold text-zinc-900 dark:text-white">
                      {profile.onboarding.ward || '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500 dark:text-zinc-400">Street</dt>
                    <dd className="mt-1 font-semibold text-zinc-900 dark:text-white">
                      {profile.onboarding.street || '—'}
                    </dd>
                  </div>
                </dl>
              </Panel>
            )}
          </div>

          {/* Right Column: Decision Desk & Profile Summary */}
          <div className="space-y-6">
            {/* Decision Controls */}
            <Panel className="border-emerald-300 dark:border-emerald-800">
              <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-white mb-2">
                <HugeiconsIcon icon={ShieldCheckIcon} size={18} className="text-emerald-600" />
                <h3>Compliance Decision</h3>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-5">
                Review the document photos and automated scores to approve or reject borrower identity.
              </p>

              <div className="space-y-3">
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => void handleApprove()}
                  className="w-full rounded-xl bg-emerald-600 py-3 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-500 disabled:opacity-50"
                >
                  {actionLoading ? 'Processing…' : 'Approve Identity (Manual Override)'}
                </button>

                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => void handleRecapture()}
                  className="w-full rounded-xl border border-rose-300 bg-rose-50 py-2.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300 disabled:opacity-50"
                >
                  Request Recapture
                </button>

                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => void handleRefreshSession()}
                  className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 disabled:opacity-50"
                >
                  Refresh Provider Session
                </button>
              </div>

              <div className="mt-5 border-t border-zinc-200 pt-4 text-[11px] text-zinc-500 dark:border-zinc-800">
                Status: <strong className="uppercase text-zinc-900 dark:text-zinc-100">{profile.identityVerification?.status || 'Pending'}</strong>
                {profile.identityVerified && (
                  <span className="ml-2 rounded-md bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    VERIFIED
                  </span>
                )}
              </div>
            </Panel>

            {/* Borrower Profile Details */}
            <Panel>
              <h3 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Borrower Profile
              </h3>
              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-zinc-500 dark:text-zinc-400">Full Name</span>
                  <strong className="block text-zinc-900 dark:text-white mt-0.5">
                    {profile.fullName}
                  </strong>
                </div>
                <div>
                  <span className="text-zinc-500 dark:text-zinc-400">Phone</span>
                  <span className="block font-mono text-zinc-800 dark:text-zinc-200 mt-0.5">
                    {profile.phone || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500 dark:text-zinc-400">National ID (NIDA)</span>
                  <span className="block font-mono font-medium text-zinc-800 dark:text-zinc-200 mt-0.5">
                    {profile.nationalId || 'Not provided'}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500 dark:text-zinc-400">Wallet Status</span>
                  <strong className="block text-zinc-800 dark:text-zinc-200 mt-0.5">
                    {profile.walletVerified ? '✓ Verified (ClickPesa)' : 'Incomplete'}
                  </strong>
                </div>
                <div>
                  <span className="text-zinc-500 dark:text-zinc-400">Can Apply For Credit</span>
                  <strong
                    className={`block mt-0.5 ${
                      profile.canApply
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    {profile.canApply ? 'Eligible' : 'Prerequisites Incomplete'}
                  </strong>
                </div>
              </div>
            </Panel>

            {/* Financial Overview (if declared) */}
            {financial && (
              <Panel>
                <h3 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Income Profile
                </h3>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-zinc-500 dark:text-zinc-400">Employment</span>
                    <strong className="text-zinc-800 dark:text-zinc-200">
                      {financial.occupation} ({financial.employmentStatus.replaceAll('_', ' ').toLowerCase()})
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500 dark:text-zinc-400">Monthly Income</span>
                    <strong className="text-zinc-900 dark:text-white">
                      TZS {Number(financial.monthlyIncome).toLocaleString()}
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500 dark:text-zinc-400">Essential Expenses</span>
                    <strong className="text-zinc-900 dark:text-white">
                      TZS {Number(financial.essentialExpenses).toLocaleString()}
                    </strong>
                  </div>
                  <div className="flex justify-between border-t border-zinc-200 pt-2 dark:border-zinc-800">
                    <span className="font-semibold text-zinc-700 dark:text-zinc-300">Net Surplus</span>
                    <strong className="text-emerald-600 dark:text-emerald-400">
                      TZS {(financial.monthlyIncome - financial.essentialExpenses - financial.existingLoanRepayments).toLocaleString()}
                    </strong>
                  </div>
                </div>
              </Panel>
            )}
          </div>
        </div>
      ) : null}

      {/* Image Zoom Modal */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs"
          onClick={() => setSelectedImage(null)}
        >
          <div
            className="relative max-h-[92vh] max-w-4xl overflow-hidden rounded-2xl bg-zinc-900 p-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between px-2 text-white">
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
    </div>
  );
}
