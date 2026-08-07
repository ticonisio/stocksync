import Link from 'next/link';
import { ArrowLeft, Clock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function ConnectNuvemshopPage() {
  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <Clock className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl font-bold leading-none tracking-tight">
            Nuvemshop está em preparação
          </h1>
          <CardDescription>
            A seleção de plataforma já está pronta. A conexão Nuvemshop será ativada quando o fluxo OAuth,
            sincronização e webhooks estiverem implementados.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline" className="w-full">
          <Link href="/connect-store">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar para plataformas
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
