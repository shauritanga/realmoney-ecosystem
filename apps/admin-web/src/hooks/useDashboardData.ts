import { useContext } from 'react';
import { DataContext, type DataContextType } from '../context/DataContext';

export function useDashboardData(): DataContextType {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useDashboardData must be used within a DataProvider');
  }
  return context;
}
