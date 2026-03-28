import { Package } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { UrgencyItem } from '@/services/inventory/urgency-service';

type StatusVariant = 'destructive' | 'outline' | 'default';

const STATUS_VARIANT: Record<UrgencyItem['status'], StatusVariant> = {
  'CRÍTICO': 'destructive',
  'ATENÇÃO': 'outline',
  'OK': 'default',
};

const STATUS_URGENCY_COLOR: Record<UrgencyItem['status'], string> = {
  'CRÍTICO': 'text-destructive',
  'ATENÇÃO': 'text-warning',
  'OK': 'text-foreground',
};

function formatVelocity(vel: number): string {
  if (vel < 0.01) return '< 0.01 un/dia';
  return `${vel.toFixed(2)} un/dia`;
}

interface UrgencyCardProps {
  item: UrgencyItem;
}

export function UrgencyCard({ item }: UrgencyCardProps) {
  const urgencyColor = STATUS_URGENCY_COLOR[item.status];

  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <div className="flex items-center justify-center w-10 h-10 rounded-md bg-muted flex-shrink-0">
          <Package className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant={STATUS_VARIANT[item.status]} className="text-xs flex-shrink-0">
              {item.status}
            </Badge>
            <p className="font-semibold text-foreground truncate">{item.title}</p>
          </div>
          <p className="text-sm text-muted-foreground truncate">{item.topVariantTitle}</p>
        </div>
        <div className="text-right flex-shrink-0 space-y-0.5">
          <p className={`text-sm font-bold ${urgencyColor}`}>
            {item.urgency}d restantes
          </p>
          <p className="text-xs text-muted-foreground">Lead time: {item.leadTimeDays}d</p>
          <p className="text-xs text-muted-foreground">{formatVelocity(item.velocityPerDay)}</p>
          {item.reorderQty > 0 && (
            <p className="text-xs font-semibold text-primary">
              Pedir: {item.reorderQty} un
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
