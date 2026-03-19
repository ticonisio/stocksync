import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LeadTimeGroupsManager } from '@/components/settings/LeadTimeGroupsManager';
import { DisconnectStoreButton } from '@/components/settings/DisconnectStoreButton';

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
        <CardContent className="flex gap-3">
          <Button asChild variant="outline">
            <Link href="/connect-shopify">Reconectar loja</Link>
          </Button>
          <DisconnectStoreButton />
        </CardContent>
      </Card>

      <LeadTimeGroupsManager />
    </div>
  );
}
