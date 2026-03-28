import Link from 'next/link';
import { AlertTriangle, AlertCircle, CheckCircle } from 'lucide-react';

interface UrgencyDashboardCardsProps {
  critical: number;
  warning: number;
  ok: number;
}

export function UrgencyDashboardCards({ critical, warning, ok }: UrgencyDashboardCardsProps) {
  if (critical + warning + ok === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <Link
        href="/lead-time"
        className="rounded-lg border p-4 bg-red-50 dark:bg-red-950 hover:bg-red-100 dark:hover:bg-red-900 transition-colors"
      >
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0" />
          <div>
            <p className="text-2xl font-bold text-red-700 dark:text-red-300">{critical}</p>
            <p className="text-sm text-red-600 dark:text-red-400">CRITICO</p>
          </div>
        </div>
      </Link>

      <Link
        href="/lead-time"
        className="rounded-lg border p-4 bg-amber-50 dark:bg-amber-950 hover:bg-amber-100 dark:hover:bg-amber-900 transition-colors"
      >
        <div className="flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
          <div>
            <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{warning}</p>
            <p className="text-sm text-amber-600 dark:text-amber-400">ATENCAO</p>
          </div>
        </div>
      </Link>

      <Link
        href="/lead-time"
        className="rounded-lg border p-4 bg-emerald-50 dark:bg-emerald-950 hover:bg-emerald-100 dark:hover:bg-emerald-900 transition-colors"
      >
        <div className="flex items-center gap-3">
          <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
          <div>
            <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{ok}</p>
            <p className="text-sm text-emerald-600 dark:text-emerald-400">SAUDAVEL</p>
          </div>
        </div>
      </Link>
    </div>
  );
}
