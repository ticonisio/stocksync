# Integrações futuras — mídia paga e marketplaces

## Objetivo

Evoluir o StockSync de um painel conectado à Shopify para uma plataforma que:

1. relacione investimento em mídia com vendas, margem, giro e risco de ruptura;
2. centralize pedidos e disponibilidade de estoque de múltiplos canais;
3. recomende ações de mídia e reposição com base em dados financeiros e operacionais;
4. evite venda sem estoque por meio de reservas, idempotência e reconciliação.

Este documento é um roadmap. Cada integração deverá ser detalhada em histórias menores antes da implementação.

## Princípios de arquitetura

- **Fonte de verdade explícita:** definir por loja se o StockSync ou uma plataforma externa controla a disponibilidade vendável.
- **Leitura antes de escrita:** iniciar integrações em modo somente leitura; habilitar atualização de estoque apenas após reconciliação validada.
- **Idempotência:** eventos e pedidos externos devem possuir chave única por plataforma, conta e identificador externo.
- **Estoque vendável:** separar estoque físico, reservado, comprometido, indisponível e alocado por canal.
- **Processamento assíncrono:** confirmar webhooks rapidamente e processá-los por fila, com retry e dead-letter queue.
- **Reconciliação:** executar rotinas periódicas para detectar e corrigir divergências entre StockSync e canais externos.
- **Segurança:** tokens OAuth criptografados em repouso, escopos mínimos, rotação e desconexão/revogação.
- **Privacidade:** coletar apenas dados necessários e manter trilha de consentimento, retenção e exclusão compatíveis com a LGPD.
- **Observabilidade:** registrar duração, cursor, volume, falhas, retries e defasagem de cada sincronização.

## Fundação compartilhada

### Modelo de conexões

Criar uma camada de integrações independente da tabela `Store`, com entidades equivalentes a:

- `IntegrationConnection`: plataforma, conta externa, status, escopos, token criptografado e expiração;
- `IntegrationSync`: tipo de sincronização, cursor, início, fim, status, totais e erro sanitizado;
- `ExternalProductMapping`: plataforma, produto/variante StockSync, identificador externo e SKU;
- `ExternalOrderMapping`: plataforma, pedido StockSync e identificador externo;
- `WebhookInbox`: identificador do evento, payload, data de recebimento, tentativas e status;
- `SyncConflict`: divergência, valores local/remoto, resolução e responsável.

### Serviços comuns

- fluxo OAuth com callback, refresh e revogação;
- armazenamento criptografado de credenciais;
- cliente HTTP com timeout, retry exponencial e respeito a rate limits;
- paginação e persistência de cursor;
- fila para webhooks e tarefas longas;
- auditoria de alterações de estoque;
- painel de saúde das integrações;
- alertas para token expirado, escopo insuficiente e sincronização atrasada.

## Meta Ads

### Conexão e autorização

- registrar o StockSync como aplicativo Meta Business;
- implementar login/autorização para selecionar Business Manager e conta de anúncios;
- solicitar somente permissões de leitura necessárias para campanhas e insights;
- armazenar token, conta, moeda, fuso horário, escopos e data de expiração;
- implementar renovação, revogação e reconexão;
- preparar processo de App Review antes da disponibilização pública.

Referências: [Meta Marketing API](https://developers.facebook.com/docs/marketing-apis/) e [SDK oficial para Node.js](https://github.com/facebook/facebook-nodejs-business-sdk).

### Coleta

Importar diariamente e permitir backfill por período:

- campanha, conjunto de anúncios e anúncio;
- data, moeda e fuso da conta;
- investimento, impressões, alcance, frequência e cliques;
- compras, valor atribuído e outras ações relevantes;
- janela e modelo de atribuição retornados pela plataforma;
- identificadores de catálogo/conteúdo quando disponíveis.

### Associação com produtos e pedidos

- vincular anúncios de catálogo por identificador do conteúdo/SKU;
- vincular campanhas convencionais por UTMs e landing pages;
- comparar compras atribuídas pela Meta com pedidos reais da loja;
- registrar lacunas de atribuição em vez de forçar correspondências;
- avaliar Meta Conversions API para enviar eventos de compra do servidor com deduplicação de eventos.

Referência: [Meta Conversions API](https://www.facebook.com/business/help/AboutConversionsAPI).

## Google Ads

### Conexão e autorização

- criar ou selecionar uma conta administradora Google Ads;
- solicitar developer token e o nível de acesso adequado;
- configurar projeto Google Cloud e OAuth 2.0;
- permitir seleção da conta cliente e, quando aplicável, do Merchant Center;
- armazenar refresh token criptografado, customer ID, login customer ID, moeda e fuso;
- preparar verificação OAuth e requisitos de produção.

Referências: [OAuth da Google Ads API](https://developers.google.com/google-ads/api/docs/oauth/overview) e [developer token](https://developers.google.com/google-ads/api/docs/api-policy/developer-token).

### Coleta

Consultar por GAQL, diariamente e com backfill:

- campanha e grupo de anúncios;
- impressões, cliques, custo em micros, conversões e valor das conversões;
- CPA, ROAS e métricas de interação;
- data, dispositivo e rede quando relevantes;
- métricas de Shopping e Performance Max por item do Merchant Center.

Referências: [Google Ads Query Language](https://developers.google.com/google-ads/api/docs/query/overview) e [relatórios de Shopping](https://developers.google.com/google-ads/api/docs/shopping-ads/reporting).

### Associação com produtos

- mapear `product_item_id`/item do Merchant Center para produto ou variante StockSync;
- usar SKU como chave preferencial e manter associação manual como fallback;
- validar duplicidades e colisões de SKU;
- manter histórico do mapeamento para preservar relatórios antigos.

## Camada unificada de dados de mídia

### Modelo sugerido

- `AdAccount`: conexão, plataforma, conta, moeda e fuso;
- `AdCampaign`: identificador externo, nome, status e objetivo;
- `AdMetricDaily`: data, campanha, gasto, impressões, cliques, conversões e receita atribuída;
- `ProductAdMetricDaily`: data, produto/variante, gasto e métricas disponíveis;
- `AttributionMapping`: UTM, catálogo, Merchant item ID ou regra manual;
- `AdSyncRun`: cursor, período, totais, status e erro.

Valores monetários devem ser persistidos em unidade mínima ou `Decimal`, nunca em `Float`.

### Insights previstos

- ROAS por plataforma, campanha e produto;
- CPA e custo por unidade vendida;
- MER: faturamento total dividido pelo investimento total;
- margem de contribuição após mídia;
- relação entre variação de gasto e variação de unidades vendidas;
- previsão de ruptura mantendo o ritmo atual de mídia;
- campanha ativa promovendo item crítico ou sem estoque;
- produto com estoque excedente e mídia abaixo do potencial;
- reposição sugerida ajustada pelo aumento recente de demanda;
- comparação entre receita atribuída pela plataforma e receita real da loja.

### Limitações a comunicar

- correlação temporal não prova causalidade;
- plataformas usam janelas e modelos de atribuição diferentes;
- conversões podem sofrer atraso e revisão posterior;
- campanhas sem catálogo/UTM podem ser analisadas apenas de forma agregada;
- métricas de canais diferentes não devem ser somadas sem normalização.

## Integração com marketplaces

### Arquitetura de canais

Criar um contrato comum de adaptador:

- `connect` e `disconnect`;
- `listProducts` e `mapProducts`;
- `listOrders` e `getOrder`;
- `getInventory` e `updateInventory`;
- `handleWebhook`;
- `reconcile`;
- capacidades declaradas por canal, pois nem todos suportam os mesmos recursos.

### Fluxo de pedidos

1. receber e persistir o evento na caixa de entrada;
2. responder HTTP 2xx imediatamente;
3. buscar o recurso completo na API do canal;
4. normalizar status, itens, quantidades e datas;
5. criar/atualizar pedido de forma idempotente;
6. reservar, comprometer ou liberar estoque conforme a transição de estado;
7. recalcular velocidade e urgência;
8. publicar a nova disponibilidade nos canais habilitados;
9. registrar sucessos, falhas e conflitos.

### Modelo de estoque multicanal

Adicionar conceitos equivalentes a:

- `InventoryLocation`: depósito/localização física;
- `InventoryBalance`: disponível físico por variante e localização;
- `InventoryReservation`: quantidade reservada por pedido/canal;
- `ChannelAllocation`: quantidade ou percentual protegido para um canal;
- `InventoryLedger`: razão imutável de movimentos;
- `InventoryPublication`: último valor enviado e confirmado por canal.

Fórmula inicial:

`disponível para venda = físico - reservado - comprometido - estoque de segurança`

A publicação por canal deve ainda respeitar a alocação configurada.

### Prevenção de overselling

- lock transacional ao reservar estoque;
- versionamento otimista quando suportado pelo canal;
- idempotência por evento e pedido;
- limite mínimo/estoque de segurança;
- circuit breaker quando um canal estiver indisponível;
- bloquear novas publicações quando houver divergência crítica;
- reconciliação completa programada e reconciliação incremental por evento.

## Mercado Livre

### Atividades

- registrar aplicação e implementar OAuth;
- importar anúncios, variações, SKUs, pedidos e status;
- assinar notificações de pedidos e itens;
- mapear anúncios/variações para variantes StockSync;
- iniciar em modo leitura e comparar saldos;
- implementar atualização de estoque para contas convencionais;
- detectar contas com estoque multiorigem/User Products;
- suportar estoque por depósito e cabeçalho de versão;
- tratar conflito HTTP 409 consultando novamente a versão atual;
- executar reconciliação de pedidos e estoque.

Referências: [notificações](https://developers.mercadolivre.com.br/pt_br/produto-consulta-de-usuarios/produto-receba-notificacoes) e [estoque multiorigem](https://developers.mercadolivre.com.br/pt_br/autenticacao-e-autorizacao/gestao-de-estoque-multiorigem-user-products).

## Amazon

### Atividades

- registrar aplicação Selling Partner API e concluir autorização;
- selecionar marketplaces/regiões da conta;
- importar listagens, SKU, preço, disponibilidade e pedidos;
- diferenciar estoque do vendedor de estoque FBA;
- mapear seller SKU e ASIN para variantes StockSync;
- atualizar listagens individuais pela Listings Items API;
- utilizar feeds JSON para atualizações em grande volume;
- consumir notificações quando disponíveis e complementar com reconciliação;
- respeitar roles, rate limits e restrições por marketplace.

Referências: [gestão de listagens](https://developer-docs.amazon.com/sp-api/lang-en_EN/docs/manage-product-listings-guide) e [FBA Inventory API](https://developer-docs.amazon.com/sp-api/docs/fba-inventory-api-v1-use-case-guide).

## Shopee e outros marketplaces

### Atividades

- validar disponibilidade e aprovação da API de parceiros no país-alvo;
- confirmar operações, escopos, webhooks e limites concedidos ao aplicativo;
- implementar o mesmo contrato de adaptador;
- iniciar com pedidos e estoque em leitura;
- habilitar escrita somente após reconciliação e homologação;
- documentar limitações específicas de cada canal.

## Roadmap sugerido

### Fase 0 — fundação

- modelo genérico de conexões e sincronizações;
- criptografia e rotação de tokens;
- fila, webhook inbox, retries e observabilidade;
- auditoria e painel de saúde;
- normalização monetária, moedas e fusos.

### Fase 1 — mídia somente leitura

- Google Ads OAuth e sincronização diária;
- Meta Ads OAuth e sincronização diária;
- backfill configurável;
- painel consolidado de gasto, vendas, ROAS, CPA e MER;
- mapeamento inicial por catálogo/SKU/UTM.

### Fase 2 — insights de mídia e estoque

- risco de ruptura relacionado ao gasto;
- previsão de cobertura com aceleração de demanda;
- margem após mídia;
- recomendações de reduzir ou escalar campanhas;
- alertas e explicações sobre qualidade da atribuição.

### Fase 3 — Mercado Livre em leitura

- OAuth, catálogo, pedidos, notificações e mapeamento;
- comparação de estoque;
- relatório de divergências;
- reconciliação manual assistida.

### Fase 4 — estoque bidirecional

- ledger, reservas e disponibilidade vendável;
- publicação de estoque em Shopify e Mercado Livre;
- tratamento de concorrência, conflito e rollback;
- reconciliação automática;
- ativação gradual por loja e por SKU.

### Fase 5 — novos canais

- Amazon;
- Shopee, condicionada à aprovação e capacidades da API;
- outros marketplaces usando o contrato comum de adaptador.

## Critérios gerais de aceite

- nenhuma credencial aparece em resposta, log ou erro;
- reconectar ou reprocessar não duplica dados;
- falha de um canal não bloqueia os demais;
- todos os jobs podem ser retomados por cursor;
- toda alteração de estoque possui origem e trilha de auditoria;
- divergências são visíveis e têm ação de resolução;
- sincronizações respeitam moeda, fuso e janela de atribuição;
- usuário consegue desconectar e solicitar exclusão dos dados;
- modo de escrita exige confirmação explícita e passa por período de validação em leitura;
- testes cobrem autenticação, idempotência, paginação, rate limit, retries, conflitos e isolamento entre lojas.

## Decisões pendentes

- marketplace prioritário após Mercado Livre;
- fonte de verdade do estoque em cada configuração;
- estratégia de fila e execução de tarefas longas;
- granularidade mínima de dados de anúncios a conservar;
- política de retenção de métricas e payloads;
- regras de alocação por canal;
- comportamento quando a atualização de um canal falhar;
- planos comerciais que terão acesso a cada integração.
