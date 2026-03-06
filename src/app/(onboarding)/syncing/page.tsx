export default function SyncingPage() {
  return (
    <div className="text-center space-y-4">
      <div className="flex justify-center">
        <div className="h-12 w-12 rounded-full border-4 border-primary border-t-transparent animate-spin" />
      </div>
      <h1 className="text-2xl font-bold text-foreground">Sincronizando sua loja...</h1>
      <p className="text-muted-foreground max-w-sm">
        Estamos importando seus produtos, variantes e coleções da Shopify. Isso pode levar alguns minutos.
      </p>
    </div>
  );
}
