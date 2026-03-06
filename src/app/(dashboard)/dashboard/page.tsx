import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4 text-foreground">Dashboard</h1>
      <p className="text-muted-foreground">
        Logado como: <span className="text-foreground">{session?.user?.email}</span>
      </p>
    </div>
  );
}
