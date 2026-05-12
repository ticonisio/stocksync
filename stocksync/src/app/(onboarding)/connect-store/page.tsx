import Link from 'next/link';
import { ArrowRight, CheckCircle2, Clock, Store } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const platforms = [
  {
    name: 'Shopify',
    description: 'Conecte uma loja Shopify usando o domínio myshopify.com e um access token.',
    href: '/connect-shopify',
    status: 'Disponível',
    ready: true,
  },
  {
    name: 'Nuvemshop',
    description: 'Prepare o caminho para conectar via app e sincronizar produtos, estoque e pedidos.',
    href: '/connect-nuvemshop',
    status: 'Em preparação',
    ready: false,
  },
];

export default function ConnectStorePage() {
  return (
    <div className="w-full max-w-3xl space-y-6">
      <div className="space-y-2 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Store className="h-6 w-6 text-primary" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Qual plataforma sua loja usa?</h1>
        <p className="text-sm text-muted-foreground">
          Escolha a plataforma para iniciar a conexão e importar seus produtos.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {platforms.map((platform) => (
          <Card key={platform.name} className="flex flex-col">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>{platform.name}</CardTitle>
                  <CardDescription className="mt-2">{platform.description}</CardDescription>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  {platform.ready ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <Clock className="h-4 w-4 text-amber-600" />
                  )}
                  {platform.status}
                </div>
              </div>
            </CardHeader>
            <CardContent className="mt-auto">
              <Button asChild className="w-full" variant={platform.ready ? 'default' : 'outline'}>
                <Link href={platform.href}>
                  {platform.ready ? 'Conectar' : 'Ver status'}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
