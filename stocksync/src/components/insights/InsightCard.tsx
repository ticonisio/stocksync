'use client';

import { TrendingUp, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface TrendingCardProps {
  variant: 'trending';
  rank: number;
  title: string;
  velocityPerDay: number;
  unitsSold: number;
  totalAvailableStock: number;
  topVariantTitle: string;
  periodLabel: string;
}

interface ReorderCardProps {
  variant: 'reorder';
  title: string;
  velocityPerDay: number;
  unitsSold: number;
  totalAvailableStock: number;
  diasRestantes: number;
  periodLabel: string;
}

type InsightCardProps = TrendingCardProps | ReorderCardProps;

function formatVelocity(vel: number): string {
  if (vel < 0.01) return '< 0.01 un/dia';
  return `${vel.toFixed(2)} un/dia`;
}

export function InsightCard(props: InsightCardProps) {
  if (props.variant === 'trending') {
    return (
      <Card>
        <CardContent className="flex items-center gap-4 p-4">
          <Badge variant="outline" className="text-base font-bold w-8 h-8 flex items-center justify-center flex-shrink-0">
            {props.rank}
          </Badge>
          <div className="flex items-center justify-center w-10 h-10 rounded-md bg-muted flex-shrink-0">
            <TrendingUp className="h-5 w-5 text-green-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground truncate">{props.title}</p>
            <p className="text-sm text-muted-foreground truncate">{props.topVariantTitle}</p>
          </div>
          <div className="text-right flex-shrink-0 space-y-0.5">
            <p className="text-sm font-medium text-green-500">{props.unitsSold} vendidos</p>
            <p className="text-xs text-muted-foreground">{formatVelocity(props.velocityPerDay)}</p>
            <p className="text-xs text-muted-foreground">Estoque: {props.totalAvailableStock}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const diasRestantes = props.diasRestantes;
  const urgencyColor =
    diasRestantes <= 3
      ? 'text-destructive'
      : diasRestantes <= 7
        ? 'text-warning'
        : 'text-foreground';

  const urgencyBadge =
    diasRestantes <= 3
      ? 'destructive'
      : diasRestantes <= 7
        ? 'outline'
        : 'default';

  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <div className="flex items-center justify-center w-10 h-10 rounded-md bg-muted flex-shrink-0">
          <AlertTriangle className={`h-5 w-5 ${diasRestantes <= 7 ? 'text-destructive' : 'text-warning'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-foreground truncate">{props.title}</p>
            <Badge variant={urgencyBadge as 'destructive' | 'outline' | 'default'} className="text-xs flex-shrink-0">
              {diasRestantes}d
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {props.unitsSold} vendidos ({props.periodLabel}) &middot; {formatVelocity(props.velocityPerDay)}
          </p>
        </div>
        <div className="text-right flex-shrink-0 space-y-0.5">
          <p className={`text-sm font-bold ${urgencyColor}`}>
            {diasRestantes}d restantes
          </p>
          <p className="text-xs text-muted-foreground">Estoque: {props.totalAvailableStock}</p>
        </div>
      </CardContent>
    </Card>
  );
}
