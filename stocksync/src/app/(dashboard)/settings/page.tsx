import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Configurações</h1>

      <Card>
        <CardHeader>
          <CardTitle>Integração Shopify</CardTitle>
          <CardDescription>
            Gerencie a conexão com sua loja Shopify. Troque o token de acesso caso necessário.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/onboarding/connect-shopify">Reconectar loja</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
