import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { AuthSessionProvider } from '@/components/providers/session-provider';

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  return (
    <AuthSessionProvider>
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        {children}
      </div>
    </AuthSessionProvider>
  );
}
