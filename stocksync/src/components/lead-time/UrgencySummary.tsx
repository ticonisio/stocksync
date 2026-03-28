import { Card, CardContent } from '@/components/ui/card';

interface UrgencySummaryProps {
  critical: number;
  warning: number;
  ok: number;
}

export function UrgencySummary({ critical, warning, ok }: UrgencySummaryProps) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <Card>
        <CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-destructive">{critical}</p>
          <p className="text-xs text-muted-foreground mt-1">CRÍTICO</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-warning">{warning}</p>
          <p className="text-xs text-muted-foreground mt-1">ATENÇÃO</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">{ok}</p>
          <p className="text-xs text-muted-foreground mt-1">OK</p>
        </CardContent>
      </Card>
    </div>
  );
}
