import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sidebar } from '@/components/layout/sidebar';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}));

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// Mock next-auth/react
vi.mock('next-auth/react', () => ({
  signOut: vi.fn(),
  useSession: () => ({
    data: { user: { name: 'Test User', email: 'test@test.com' } },
    status: 'authenticated',
  }),
}));

// Mock CollectionsSidebar
vi.mock('@/components/inventory/CollectionsSidebar', () => ({
  CollectionsSidebar: () => <div data-testid="collections-sidebar" />,
}));

// Mock shadcn Button
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => (
    <button {...props}>{children}</button>
  ),
}));

describe('Sidebar badge', () => {
  it('shows critical badge when criticalCount > 0', () => {
    render(<Sidebar criticalCount={3} />);
    const badge = screen.getByText('3');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('bg-red-500');
    expect(badge.className).toContain('rounded-full');
  });

  it('does not show badge when criticalCount is 0', () => {
    render(<Sidebar criticalCount={0} />);
    // The sidebar renders but no badge with bg-red-500 should exist
    const badges = document.querySelectorAll('.bg-red-500');
    expect(badges).toHaveLength(0);
  });

  it('does not show badge when criticalCount is not provided', () => {
    render(<Sidebar />);
    const badges = document.querySelectorAll('.bg-red-500');
    expect(badges).toHaveLength(0);
  });
});
