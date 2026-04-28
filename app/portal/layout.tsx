'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { Command, Monitor, LifeBuoy, Ticket, LogOut } from 'lucide-react';

const portalLinks = [
  { href: '/portal', label: 'My Device', icon: Monitor },
  { href: '/portal/support', label: 'Support', icon: LifeBuoy },
  { href: '/portal/tickets', label: 'My Tickets', icon: Ticket },
];

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { profile, signOut } = useAuth();

  const userName = profile?.full_name || 'User';

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Top navigation bar */}
      <header className="sticky top-0 z-50 flex h-14 items-center border-b bg-background px-4 md:px-6">
        {/* Logo */}
        <Link href="/portal" className="flex items-center gap-2 mr-8">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
            <Command className="h-3.5 w-3.5" />
          </div>
          <span className="text-base font-semibold tracking-tight">CommandKit</span>
        </Link>

        {/* Nav links */}
        <nav className="flex items-center gap-1">
          {portalLinks.map((link) => {
            const isActive =
              link.href === '/portal'
                ? pathname === '/portal'
                : pathname.startsWith(link.href);

            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-blue-600/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <link.icon className="h-4 w-4" />
                <span>{link.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm font-medium hidden sm:inline-block">{userName}</span>
          <ThemeToggle />
          <Button
            variant="ghost"
            size="sm"
            className="gap-2 text-muted-foreground"
            onClick={signOut}
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </header>

      {/* Main content area */}
      <main className="flex-1 p-4 md:p-6 lg:p-8">{children}</main>
    </div>
  );
}
