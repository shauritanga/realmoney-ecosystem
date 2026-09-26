import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { apiClient } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import type { CollectionAlerts, DashboardStats, LedgerEntry, Loan } from '../types';

export interface DataContextType {
  stats: DashboardStats | null;
  loans: Loan[];
  ledger: LedgerEntry[];
  /** Cheap counts for the sidebar badge; null until the first load resolves. */
  collectionAlerts: CollectionAlerts | null;
  overdueLoans: Loan[];
  pendingLoans: Loan[];
  recoveryRate: number;
  loading: boolean;
  error: string | null;
  notice: string | null;
  notify: (message: string) => void;
  dismissNotice: () => void;
  refresh: () => Promise<void>;
  approveOrDisburse: (path: string) => Promise<void>;
  pushPayment: (args: PushPaymentArgs) => Promise<void>;
  extendLoan: (args: ExtendLoanArgs) => Promise<void>;
  extensionQuote: (loanId: string) => Promise<ExtensionQuote | null>;
}

/** `payerPhone` prompts someone other than the borrower. */
export interface PushPaymentArgs {
  loanId: string;
  amount: number;
  payerPhone?: string;
  payerName?: string;
}

/** No amount: the server prices the fee from the current balance. */
export interface ExtendLoanArgs {
  loanId: string;
  payerPhone?: string;
  payerName?: string;
}

export interface ExtensionQuote {
  fee: number;
  newDueDate: string;
  extensionsRemaining: number;
  eligible: boolean;
  reason: string | null;
}

export const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [collectionAlerts, setCollectionAlerts] = useState<CollectionAlerts | null>(null);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const notify = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => {
      setNotice((prev) => (prev === message ? null : prev));
    }, 4000);
  }, []);

  const dismissNotice = useCallback(() => {
    setNotice(null);
  }, []);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [nextStats, nextLoans, nextLedger, nextAlerts] = await Promise.all([
        apiClient<DashboardStats>('/admin/dashboard-stats', { token }),
        apiClient<Loan[]>('/loans', { token }),
        apiClient<LedgerEntry[]>('/admin/ledger', { token }),
        // Cheap enough to join the global refresh, and the sidebar badge needs it on
        // every page. A failure here must not blank the whole dashboard.
        apiClient<CollectionAlerts>('/admin/collections/alerts', { token }).catch(
          () => null,
        ),
      ]);
      setStats(nextStats);
      setLoans(nextLoans);
      setLedger(nextLedger);
      setCollectionAlerts(nextAlerts);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to load operations data.'
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      void refresh();
    } else {
      setStats(null);
      setLoans([]);
      setLedger([]);
      setCollectionAlerts(null);
    }
  }, [token, refresh]);

  const overdueLoans = useMemo(
    () => loans.filter((loan) => loan.status === 'OVERDUE' || loan.daysOverdue > 0),
    [loans]
  );

  const pendingLoans = useMemo(
    () => loans.filter((loan) => loan.status === 'PENDING'),
    [loans]
  );

  const recoveryRate = useMemo(() => {
    if (!stats || !stats.totalDisbursedAmount) return 0;
    return Math.round(
      (stats.totalRepaymentsAmount / stats.totalDisbursedAmount) * 100
    );
  }, [stats]);

  const approveOrDisburse = useCallback(
    async (path: string) => {
      try {
        const data = await apiClient<{ message?: string }>(path, {
          method: 'POST',
          token,
        });
        notify(data.message || 'Action completed.');
        await refresh();
      } catch (err) {
        notify(err instanceof Error ? err.message : 'Action failed.');
      }
    },
    [token, notify, refresh]
  );

  const pushPayment = useCallback(
    async ({ loanId, amount, payerPhone, payerName }: PushPaymentArgs) => {
      try {
        const data = await apiClient<{ success: boolean; message?: string; orderId: string }>(
          '/collections/trigger-payment',
          {
            method: 'POST',
            token,
            body: JSON.stringify({ loanId, amount, payerPhone, payerName }),
          }
        );
        if (!data.success) throw new Error(data.message || 'USSD prompt failed.');
        notify(
          payerPhone
            ? `Prompt sent to ${payerPhone}: ${data.orderId}`
            : `USSD prompt sent: ${data.orderId}`
        );
      } catch (err) {
        notify(err instanceof Error ? err.message : 'USSD prompt failed.');
      }
    },
    [token, notify]
  );

  /**
   * Offers an extension. The due date does not move here -- it moves when the fee is
   * actually paid, so the list is refreshed rather than optimistically updated.
   */
  const extendLoan = useCallback(
    async ({ loanId, payerPhone, payerName }: ExtendLoanArgs) => {
      try {
        const data = await apiClient<{
          success: boolean;
          message?: string;
          orderId: string;
          fee: number;
          newDueDate: string;
        }>('/collections/extend-loan', {
          method: 'POST',
          token,
          body: JSON.stringify({ loanId, payerPhone, payerName }),
        });
        if (!data.success) throw new Error(data.message || 'Extension request failed.');
        notify(
          `Extension fee of ${Math.round(data.fee).toLocaleString('en-US')} requested. ` +
            'The due date moves once it is paid.'
        );
        await refresh();
      } catch (err) {
        notify(err instanceof Error ? err.message : 'Extension request failed.');
      }
    },
    [token, notify, refresh]
  );

  /** Read-only: nothing is charged, so a failure here is surfaced to the caller. */
  const extensionQuote = useCallback(
    async (loanId: string) =>
      apiClient<ExtensionQuote>(`/collections/cases/${loanId}/extension-quote`, { token }),
    [token]
  );

  return (
    <DataContext.Provider
      value={{
        stats,
        loans,
        ledger,
        collectionAlerts,
        overdueLoans,
        pendingLoans,
        recoveryRate,
        loading,
        error,
        notice,
        notify,
        dismissNotice,
        refresh,
        approveOrDisburse,
        pushPayment,
        extendLoan,
        extensionQuote,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}
