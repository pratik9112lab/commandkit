'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Command, Terminal, Activity, Shield } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function LandingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (user) {
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
              <Command className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold tracking-tight">CommandKit</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => router.push('/login')}>
              Sign in
            </Button>
            <Button onClick={() => router.push('/signup')}>Get started</Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-6 pb-20 pt-24 text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            Manage your macOS fleet
            <br />
            <span className="text-primary">from one place</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            Zero-touch enrollment, real-time monitoring, and security compliance
            for your entire Apple fleet. CommandKit gives IT teams the tools
            they need to manage macOS devices at scale.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Button size="lg" onClick={() => router.push('/signup')}>
              Get started free
            </Button>
            <Button size="lg" variant="outline" onClick={() => router.push('/login')}>
              Sign in
            </Button>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-6xl px-6 pb-24">
          <div className="grid gap-6 md:grid-cols-3">
            <Card className="border-border/50 bg-card/50 backdrop-blur-sm transition-shadow hover:shadow-md">
              <CardContent className="p-6">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Terminal className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-lg font-semibold">Zero-Touch Enrollment</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Enroll new Macs automatically with DEP integration. Devices
                  configure themselves out of the box -- no IT touch required.
                </p>
              </CardContent>
            </Card>

            <Card className="border-border/50 bg-card/50 backdrop-blur-sm transition-shadow hover:shadow-md">
              <CardContent className="p-6">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Activity className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-lg font-semibold">Real-Time Monitoring</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Track device status, storage, battery health, and compliance
                  in real time. Get alerts the moment something needs attention.
                </p>
              </CardContent>
            </Card>

            <Card className="border-border/50 bg-card/50 backdrop-blur-sm transition-shadow hover:shadow-md">
              <CardContent className="p-6">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Shield className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-lg font-semibold">Security Compliance</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Enforce FileVault, firewall rules, and password policies
                  across every device. Stay compliant with audit-ready logs.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-primary">
              <Command className="h-3 w-3 text-primary-foreground" />
            </div>
            <span className="text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} CommandKit. All rights reserved.
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
