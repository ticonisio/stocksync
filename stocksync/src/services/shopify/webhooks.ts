import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/encrypt';

const SHOPIFY_API_VERSION = '2026-01';
const WEBHOOK_TOPICS = ['orders/paid', 'orders/cancelled', 'orders/refunded'] as const;

export async function registerWebhooks(storeId: string): Promise<void> {
  try {
    const store = await prisma.store.findUniqueOrThrow({ where: { id: storeId } });
    const token = decrypt(store.accessTokenEncrypted);
    const callbackUrl = `${process.env.NEXTAUTH_URL}/api/shopify/webhooks`;

    for (const topic of WEBHOOK_TOPICS) {
      const res = await fetch(
        `https://${store.shopifyDomain}/admin/api/${SHOPIFY_API_VERSION}/webhooks.json`,
        {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ webhook: { topic, address: callbackUrl, format: 'json' } }),
          signal: AbortSignal.timeout(10000),
        }
      );

      // 422 = webhook already exists for this topic+address — ignore
      if (!res.ok && res.status !== 422) {
        console.error(`[webhooks] Failed to register topic ${topic}: HTTP ${res.status}`);
      }
    }

    await prisma.store.update({ where: { id: storeId }, data: { webhooksRegistered: true } });
  } catch (err) {
    // Do NOT re-throw — webhook registration failure must never block onboarding
    console.error('[webhooks] registerWebhooks error:', err);
  }
}
