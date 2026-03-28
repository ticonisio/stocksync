import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReorderAlertBanner } from '@/components/dashboard/ReorderAlertBanner';

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

describe('ReorderAlertBanner', () => {
  it('renders when critical > 0', () => {
    render(<ReorderAlertBanner critical={5} />);
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText(/precisam de recompra urgente/)).toBeInTheDocument();
  });

  it('does not render when critical is 0', () => {
    const { container } = render(<ReorderAlertBanner critical={0} />);
    expect(container.innerHTML).toBe('');
  });

  it('does not render when critical is negative', () => {
    const { container } = render(<ReorderAlertBanner critical={-1} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows singular text for 1 product', () => {
    render(<ReorderAlertBanner critical={1} />);
    expect(screen.getByText(/produto precisam/)).toBeInTheDocument();
  });

  it('shows plural text for multiple products', () => {
    render(<ReorderAlertBanner critical={3} />);
    expect(screen.getByText(/produtos precisam/)).toBeInTheDocument();
  });

  it('contains a link to /lead-time', () => {
    render(<ReorderAlertBanner critical={2} />);
    const link = screen.getByRole('link', { name: /ver detalhes/i });
    expect(link).toHaveAttribute('href', '/lead-time');
  });
});
