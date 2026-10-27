import '@/styles/mentor-appearance.css';
import '@/styles/admin-appearance.css';
import { PlatformShell } from '@/components/platform/PlatformShell';

export const metadata = { title: 'Platform console · Pathment' };

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return <PlatformShell>{children}</PlatformShell>;
}
