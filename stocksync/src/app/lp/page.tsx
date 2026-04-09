import Link from 'next/link';
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Check,
  Clock,
  Package,
  Shield,
  TrendingUp,
  Zap,
} from 'lucide-react';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.stocksync.com.br';

const tiers = [
  {
    name: 'Starter',
    skus: 'Até 50 SKUs',
    price: 47,
    yearly: 449,
    features: [
      'Velocidade de venda (30 dias)',
      '1 grupo de lead time',
      '1 importação/mês',
      'Alertas de recompra',
      'Dashboard completo',
    ],
    highlight: false,
  },
  {
    name: 'Pro',
    skus: 'Até 200 SKUs',
    price: 97,
    yearly: 929,
    features: [
      'Velocidade 7/30/90 dias',
      '3 grupos de lead time',
      '5 importações/mês',
      'Alertas de recompra',
      'Dashboard completo',
    ],
    highlight: true,
  },
  {
    name: 'Business',
    skus: 'Até 500 SKUs',
    price: 197,
    yearly: 1890,
    features: [
      'Tudo do Pro',
      'Grupos ilimitados',
      'Importações ilimitadas',
      'Onboarding 1-on-1',
      'Suporte prioritário',
    ],
    highlight: false,
  },
  {
    name: 'Enterprise',
    skus: 'Até 2.000 SKUs',
    price: 397,
    yearly: 3810,
    features: [
      'Tudo do Business',
      'Suporte dedicado',
      'API de integração',
      'Relatórios avançados',
      'SLA garantido',
    ],
    highlight: false,
  },
];

const faqs = [
  {
    q: 'Preciso instalar algo na minha loja Shopify?',
    a: 'Não. O StockSync se conecta via API oficial da Shopify. É só autorizar e pronto — sem código, sem apps pesados.',
  },
  {
    q: 'E se eu cancelar antes dos 14 dias?',
    a: 'Você não paga nada. O trial é com cartão para garantir continuidade, mas pode cancelar a qualquer momento sem cobrança.',
  },
  {
    q: 'Como funciona o alerta de recompra?',
    a: 'O sistema calcula a velocidade de venda de cada SKU e cruza com seu lead time. Quando o estoque atinge o ponto crítico, você recebe um alerta direto no dashboard.',
  },
  {
    q: 'Funciona com qualquer tipo de produto?',
    a: 'Sim. Qualquer produto com variantes e SKUs na Shopify é monitorado automaticamente.',
  },
  {
    q: 'Posso mudar de plano depois?',
    a: 'Sim, upgrade e downgrade a qualquer momento. A cobrança é proporcional ao período restante.',
  },
  {
    q: 'Meus dados ficam seguros?',
    a: 'Usamos criptografia de ponta a ponta e não armazenamos dados de pagamento. Tudo é processado pelo Stripe.',
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed]">
      {/* ── Header ── */}
      <header className="fixed top-0 z-50 w-full border-b border-white/10 bg-[#0a0a0a]/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <Package className="h-6 w-6 text-blue-500" />
            <span className="text-lg font-bold">StockSync</span>
          </div>
          <nav className="hidden items-center gap-8 text-sm text-white/60 md:flex">
            <a href="#problema" className="hover:text-white transition-colors">Problema</a>
            <a href="#como-funciona" className="hover:text-white transition-colors">Como Funciona</a>
            <a href="#precos" className="hover:text-white transition-colors">Preços</a>
            <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
          </nav>
          <Link
            href={`${APP_URL}/login`}
            className="rounded-md bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20 transition-colors"
          >
            Entrar
          </Link>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative flex min-h-screen items-center justify-center px-6 pt-16">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-500/5 via-transparent to-transparent" />
        <div className="relative mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-sm text-blue-400">
            <Zap className="h-4 w-4" />
            Sistema Zero Ruptura para Shopify
          </div>
          <h1 className="mb-6 text-4xl font-bold leading-tight tracking-tight md:text-6xl">
            Nunca mais perca vendas por{' '}
            <span className="text-blue-500">falta de estoque</span>
          </h1>
          <p className="mx-auto mb-8 max-w-2xl text-lg text-white/60 md:text-xl">
            O StockSync analisa a velocidade de venda de cada produto e te avisa
            exatamente quando comprar mais — antes que o estoque zere.
          </p>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href={`${APP_URL}/register`}
              className="inline-flex h-12 items-center gap-2 rounded-lg bg-blue-600 px-8 text-base font-semibold text-white shadow-lg shadow-blue-600/25 hover:bg-blue-500 transition-colors"
            >
              Começar Trial Grátis de 14 Dias
            </Link>
            <a
              href="#como-funciona"
              className="inline-flex h-12 items-center gap-2 rounded-lg border border-white/20 px-8 text-base font-medium text-white/80 hover:bg-white/5 transition-colors"
            >
              Ver como funciona
            </a>
          </div>
          <p className="mt-4 text-sm text-white/40">
            Teste grátis por 14 dias. Cancele quando quiser.
          </p>
        </div>
      </section>

      {/* ── Problema ── */}
      <section id="problema" className="border-t border-white/5 py-24 px-6">
        <div className="mx-auto max-w-5xl">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-3xl font-bold md:text-4xl">
              Você sabe quanto está perdendo?
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-white/60">
              Lojistas Shopify perdem em média 4,1% do faturamento por ruptura de estoque.
              Em uma loja de R$50K/mês, isso são R$2.050 jogados no lixo — todo mês.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                icon: AlertTriangle,
                color: 'text-red-400',
                bg: 'bg-red-500/10',
                title: 'Ruptura Silenciosa',
                desc: 'Produtos acabam e você só descobre quando o cliente reclama. Cada dia sem estoque é venda perdida para sempre.',
              },
              {
                icon: Clock,
                color: 'text-yellow-400',
                bg: 'bg-yellow-500/10',
                title: 'Planilhas Manuais',
                desc: 'Controlar estoque no Excel funciona até você ter 50+ SKUs. Depois disso, os erros começam a custar caro.',
              },
              {
                icon: TrendingUp,
                color: 'text-orange-400',
                bg: 'bg-orange-500/10',
                title: 'Excesso de Estoque',
                desc: 'Sem dados de velocidade de venda, você compra "no feeling" — e dinheiro fica parado em produto encalhado.',
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-xl border border-white/10 bg-white/[0.02] p-6"
              >
                <div className={`mb-4 inline-flex rounded-lg p-2 ${item.bg}`}>
                  <item.icon className={`h-6 w-6 ${item.color}`} />
                </div>
                <h3 className="mb-2 text-lg font-semibold">{item.title}</h3>
                <p className="text-sm text-white/50">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Solução ── */}
      <section className="border-t border-white/5 bg-blue-500/[0.03] py-24 px-6">
        <div className="mx-auto max-w-5xl text-center">
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">
            A solução: dados no lugar de achismo
          </h2>
          <p className="mx-auto mb-16 max-w-2xl text-lg text-white/60">
            O StockSync conecta na sua loja Shopify, analisa o histórico de vendas e
            te diz exatamente quando e quanto comprar de cada produto.
          </p>
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: BarChart3,
                title: 'Velocidade de Venda',
                desc: 'Saiba quantas unidades cada SKU vende por dia — em 7, 30 ou 90 dias.',
              },
              {
                icon: Bell,
                title: 'Alertas de Recompra',
                desc: 'Receba alertas automáticos quando o estoque atingir o ponto crítico.',
              },
              {
                icon: Clock,
                title: 'Lead Time Inteligente',
                desc: 'Configure o tempo de reposição por fornecedor e o sistema calcula tudo.',
              },
              {
                icon: Shield,
                title: 'Zero Ruptura',
                desc: 'Mantenha 100% dos produtos disponíveis. Sem venda perdida.',
              },
            ].map((item) => (
              <div key={item.title} className="text-center">
                <div className="mx-auto mb-4 inline-flex rounded-xl bg-blue-500/10 p-3">
                  <item.icon className="h-6 w-6 text-blue-400" />
                </div>
                <h3 className="mb-2 font-semibold">{item.title}</h3>
                <p className="text-sm text-white/50">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Como Funciona ── */}
      <section id="como-funciona" className="border-t border-white/5 py-24 px-6">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-16 text-center text-3xl font-bold md:text-4xl">
            Como funciona em 3 passos
          </h2>
          <div className="space-y-12">
            {[
              {
                step: '01',
                title: 'Conecte sua loja Shopify',
                desc: 'Autenticação segura via OAuth. Sem instalar apps, sem código. Em 30 segundos sua loja está conectada.',
              },
              {
                step: '02',
                title: 'O sistema analisa seu histórico',
                desc: 'O StockSync importa seus produtos, variantes e pedidos. Calcula a velocidade de venda de cada SKU automaticamente.',
              },
              {
                step: '03',
                title: 'Receba alertas inteligentes',
                desc: 'Quando um produto atinge o ponto de recompra, você vê direto no dashboard com status CRÍTICO, ATENÇÃO ou OK.',
              },
            ].map((item) => (
              <div key={item.step} className="flex gap-6">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-blue-500/30 bg-blue-500/10 text-lg font-bold text-blue-400">
                  {item.step}
                </div>
                <div>
                  <h3 className="mb-2 text-xl font-semibold">{item.title}</h3>
                  <p className="text-white/50">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Preços ── */}
      <section id="precos" className="border-t border-white/5 bg-blue-500/[0.03] py-24 px-6">
        <div className="mx-auto max-w-6xl">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-3xl font-bold md:text-4xl">
              Planos que cabem na sua operação
            </h2>
            <p className="mx-auto max-w-xl text-lg text-white/60">
              Comece grátis por 14 dias. Escolha o plano pelo número de SKUs que você gerencia.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {tiers.map((tier) => (
              <div
                key={tier.name}
                className={`relative rounded-xl border p-6 ${
                  tier.highlight
                    ? 'border-blue-500/50 bg-blue-500/[0.05] shadow-lg shadow-blue-500/10'
                    : 'border-white/10 bg-white/[0.02]'
                }`}
              >
                {tier.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 px-3 py-0.5 text-xs font-semibold text-white">
                    Popular
                  </div>
                )}
                <div className="mb-4">
                  <h3 className="text-lg font-bold">{tier.name}</h3>
                  <p className="text-sm text-white/50">{tier.skus}</p>
                </div>
                <div className="mb-6">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold">R${tier.price}</span>
                    <span className="text-sm text-white/40">/mês</span>
                  </div>
                  <p className="text-xs text-white/40">
                    ou R${tier.yearly}/ano (economia de {Math.round((1 - tier.yearly / (tier.price * 12)) * 100)}%)
                  </p>
                </div>
                <ul className="mb-6 space-y-2">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-white/70">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href={`${APP_URL}/register`}
                  className={`block w-full rounded-lg py-2.5 text-center text-sm font-semibold transition-colors ${
                    tier.highlight
                      ? 'bg-blue-600 text-white hover:bg-blue-500'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  Começar Trial Grátis
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Garantia ── */}
      <section className="border-t border-white/5 py-24 px-6">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mx-auto mb-6 inline-flex rounded-full bg-green-500/10 p-4">
            <Shield className="h-8 w-8 text-green-400" />
          </div>
          <h2 className="mb-4 text-3xl font-bold">
            Garantia 30 Dias Sem Ruptura
          </h2>
          <p className="text-lg text-white/60">
            Se nos primeiros 30 dias você seguir os alertas do StockSync e ainda
            assim tiver ruptura de estoque, devolvemos 100% do seu dinheiro. Sem
            burocracia, sem perguntas.
          </p>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="border-t border-white/5 bg-white/[0.01] py-24 px-6">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-12 text-center text-3xl font-bold">
            Perguntas frequentes
          </h2>
          <div className="space-y-6">
            {faqs.map((faq) => (
              <div
                key={faq.q}
                className="rounded-xl border border-white/10 bg-white/[0.02] p-6"
              >
                <h3 className="mb-2 font-semibold">{faq.q}</h3>
                <p className="text-sm text-white/50">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Final ── */}
      <section className="border-t border-white/5 py-24 px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">
            Pare de perder vendas hoje
          </h2>
          <p className="mx-auto mb-8 max-w-xl text-lg text-white/60">
            Cada dia sem controle de estoque é dinheiro perdido.
            Comece seu trial gratuito agora e veja os alertas funcionando em minutos.
          </p>
          <Link
            href={`${APP_URL}/register`}
            className="inline-flex h-12 items-center gap-2 rounded-lg bg-blue-600 px-8 text-base font-semibold text-white shadow-lg shadow-blue-600/25 hover:bg-blue-500 transition-colors"
          >
            Começar Trial Grátis de 14 Dias
          </Link>
          <p className="mt-4 text-sm text-white/40">
            Sem compromisso. Cancele quando quiser.
          </p>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/5 py-8 px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 md:flex-row">
          <div className="flex items-center gap-2 text-sm text-white/40">
            <Package className="h-4 w-4" />
            <span>StockSync &copy; {new Date().getFullYear()}</span>
          </div>
          <div className="flex gap-6 text-sm text-white/40">
            <a href="#" className="hover:text-white/60 transition-colors">Termos de Uso</a>
            <a href="#" className="hover:text-white/60 transition-colors">Privacidade</a>
            <a href="mailto:suporte@stocksync.com.br" className="hover:text-white/60 transition-colors">Contato</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
