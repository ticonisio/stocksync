import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

interface ReorderAlertBannerProps {
  critical: number;
}

export function ReorderAlertBanner({ critical }: ReorderAlertBannerProps) {
  if (critical <= 0) return null;

  return (
    <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 p-4">
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0" />
        <p className="text-sm text-red-700 dark:text-red-300">
          <strong>{critical}</strong> produto{critical !== 1 ? 's' : ''} precisam de recompra urgente.{' '}
          <Link href="/lead-time" className="underline font-medium hover:text-red-900 dark:hover:text-red-100">
            Ver detalhes
          </Link>
        </p>
      </div>
    </div>
  );
}
