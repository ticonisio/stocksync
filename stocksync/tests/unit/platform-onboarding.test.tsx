import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ConnectStorePage from '@/app/(onboarding)/connect-store/page';
import ConnectNuvemshopPage from '@/app/(onboarding)/connect-nuvemshop/page';

describe('platform-aware onboarding', () => {
  it('renders Shopify and Nuvemshop platform choices', () => {
    render(<ConnectStorePage />);

    expect(screen.getByRole('heading', { name: /qual plataforma sua loja usa/i })).toBeInTheDocument();
    expect(screen.getByText('Shopify')).toBeInTheDocument();
    expect(screen.getByText('Nuvemshop')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /conectar/i })).toHaveAttribute('href', '/connect-shopify');
    expect(screen.getByRole('link', { name: /ver status/i })).toHaveAttribute('href', '/connect-nuvemshop');
  });

  it('renders the Nuvemshop placeholder without requesting credentials', () => {
    render(<ConnectNuvemshopPage />);

    expect(screen.getByRole('heading', { name: /nuvemshop está em preparação/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/access token/i)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /voltar para plataformas/i })).toHaveAttribute('href', '/connect-store');
  });
});
