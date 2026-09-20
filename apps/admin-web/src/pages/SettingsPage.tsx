import { LendingSettings } from '../LendingSettings';
import { useAuth } from '../hooks';

export function SettingsPage() {
  const { token } = useAuth();
  return <LendingSettings token={token} />;
}
