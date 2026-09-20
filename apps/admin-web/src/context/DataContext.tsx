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
import type { DashboardStats, LedgerEntry, Loan } from '../types';

export interface DataContextType {
  stats: DashboardStats | null;
  loans: Loan[];
  ledger: LedgerEntry[];
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
  pushPayment: (loanId: string, amount: number) => Promise<void>;
}

export const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();

  const [stats, setStats] = useState<DashboardStats | null>(null);
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
      const [nextStats, nextLoans, nextLedger] = await Promise.all([
        apiClient<DashboardStats>('/admin/dashboard-stats', { token }),
        apiClient<Loan[]>('/loans', { token }),
        apiClient<LedgerEntry[]>('/admin/ledger', { token }),
      ]);
      setStats(nextStats);
      setLoans(nextLoans);
      setLedger(nextLedger);
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
    async (loanId: string, amount: number) => {
      try {
        const data = await apiClient<{ success: boolean; message?: string; orderId: string }>(
          '/collections/trigger-payment',
          {
            method: 'POST',
            token,
            body: JSON.stringify({ loanId, amount }),
          }
        );
        if (!data.success) throw new Error(data.message || 'USSD prompt failed.');
        notify(`USSD prompt sent: ${data.orderId}`);
      } catch (err) {
        notify(err instanceof Error ? err.message : 'USSD prompt failed.');
      }
    },
    [token, notify]
  );

  return (
    <DataContext.Provider
      value={{
        stats,
        loans,
        ledger,
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
      }}
    >
      {children}
    </DataContext.Provider>
  );
}
