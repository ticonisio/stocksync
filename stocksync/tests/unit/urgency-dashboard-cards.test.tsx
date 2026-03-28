import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UrgencyDashboardCards } from '@/components/dashboard/UrgencyDashboardCards';

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

describe('UrgencyDashboardCards', () => {
  it('renders all three cards with correct counts', () => {
    render(<UrgencyDashboardCards critical={3} warning={5} ok={10} />);

    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('CRITICO')).toBeInTheDocument();
    expect(screen.getByText('ATENCAO')).toBeInTheDocument();
    expect(screen.getByText('SAUDAVEL')).toBeInTheDocument();
  });

  it('renders links to /lead-time', () => {
    render(<UrgencyDashboardCards critical={1} warning={2} ok={3} />);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(3);
    links.forEach((link) => {
      expect(link).toHaveAttribute('href', '/lead-time');
    });
  });

  it('does not render when all counts are 0', () => {
    const { container } = render(<UrgencyDashboardCards critical={0} warning={0} ok={0} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders when at least one count is non-zero', () => {
    render(<UrgencyDashboardCards critical={0} warning={0} ok={1} />);
    expect(screen.getByText('SAUDAVEL')).toBeInTheDocument();
  });
});
