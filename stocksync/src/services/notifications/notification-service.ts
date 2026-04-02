import { prisma } from '@/lib/prisma';
import { getUrgencyItems } from '@/services/inventory/urgency-service';

/**
 * Verifica produtos que entraram em ATENÇÃO ou CRÍTICO e cria notificações.
 * Chamado após cada recálculo de velocity (webhook ou cron).
 *
 * Lógica: para cada produto com status ATENÇÃO ou CRÍTICO, cria uma notificação
 * apenas se não existir uma notificação NÃO LIDA do mesmo tipo para o mesmo produto.
 */
export async function checkAndCreateNotifications(
  storeId: string,
  period = '30d'
): Promise<number> {
  const urgencyItems = await getUrgencyItems(storeId, period);

  let created = 0;

  for (const item of urgencyItems) {
    if (item.status === 'OK') continue;

    const notificationType = item.status === 'CRÍTICO' ? 'CRITICO' : 'ATENCAO';

    // Check if there's already an unread notification of this type for this product
    const existing = await prisma.notification.findFirst({
      where: {
        storeId,
        productId: item.productId,
        type: notificationType,
        readAt: null,
      },
    });

    if (existing) continue;

    const daysOfStock = item.urgency;
    const title =
      notificationType === 'CRITICO'
        ? `${item.title} — Estoque crítico`
        : `${item.title} — Atenção`;
    const message =
      notificationType === 'CRITICO'
        ? `Estoque cobre apenas ${Math.max(0, daysOfStock + item.leadTimeDays)} dias. Lead time: ${item.leadTimeDays}d. Reposição sugerida: ${item.reorderQty} un.`
        : `Estoque cobre ${daysOfStock + item.leadTimeDays} dias (buffer: ${item.effectiveBuffer}d). Reposição sugerida: ${item.reorderQty} un.`;

    await prisma.notification.create({
      data: {
        storeId,
        productId: item.productId,
        type: notificationType,
        title,
        message,
      },
    });

    created++;
  }

  return created;
}
