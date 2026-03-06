'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function ConnectShopifyPage() {
  const router = useRouter();
  const [shopifyDomain, setShopifyDomain] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/shopify/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopifyDomain, accessToken }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Erro ao conectar a loja. Tente novamente.');
        return;
      }

      router.push('/onboarding/syncing');
    } catch {
      setError('Erro de rede. Verifique sua conexão e tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">Conectar sua loja Shopify</CardTitle>
        <CardDescription>
          Insira as credenciais da sua Custom App ou Private App para sincronizar o inventário.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="shopifyDomain">URL da loja</Label>
            <Input
              id="shopifyDomain"
              type="text"
              placeholder="minha-loja.myshopify.com"
              value={shopifyDomain}
              onChange={(e) => setShopifyDomain(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="accessToken">Access Token</Label>
            <Input
              id="accessToken"
              type="password"
              placeholder="shpat_xxxxxxxxxxxx"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          {error && (
            <div className="text-sm text-destructive space-y-1">
              <p>{error}</p>
              <a
                href="https://help.shopify.com/en/manual/apps/app-types/custom-apps"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-destructive/80"
              >
                Como criar um token de Custom App →
              </a>
            </div>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Conectando...' : 'Conectar loja'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
