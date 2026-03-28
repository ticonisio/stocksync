'use client';

import { Package } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface TrendingCardProps {
  variant: 'trending';
  rank: number;
  title: string;
  velocityPerDay: number;
  totalAvailableStock: number;
  topVariantTitle: string;
}

interface ReorderCardProps {
  variant: 'reorder';
  title: string;
  velocityPerDay: number;
  totalAvailableStock: number;
  diasRestantes: number;
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
            <Package className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground truncate">{props.title}</p>
            <p className="text-sm text-muted-foreground truncate">{props.topVariantTitle}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-sm font-medium">{formatVelocity(props.velocityPerDay)}</p>
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

  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <div className="flex items-center justify-center w-10 h-10 rounded-md bg-muted flex-shrink-0">
          <Package className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground truncate">{props.title}</p>
          <p className="text-sm text-muted-foreground">{formatVelocity(props.velocityPerDay)}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className={`text-sm font-bold ${urgencyColor}`}>
            {diasRestantes}d restantes
          </p>
          <p className="text-xs text-muted-foreground">Estoque: {props.totalAvailableStock}</p>
        </div>
      </CardContent>
    </Card>
  );
}
