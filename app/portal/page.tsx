'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import type { Device } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Monitor,
  HardDrive,
  Battery,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Cpu,
  LifeBuoy,
  Wifi,
  WifiOff,
} from 'lucide-react';

// ---------- Helper ----------

function getCpuTypeLabel(cpuType: Device['cpu_type']): string {
  if (cpuType === 'apple_silicon') return 'Apple Silicon';
  if (cpuType === 'intel') return 'Intel';
  return 'Unknown';
}

function getSecurityBadge(enabled: boolean, labelOn: string, labelOff: string) {
  return enabled ? (
    <Badge
      variant="secondary"
      className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 font-medium"
    >
      <ShieldCheck className="mr-1 h-3 w-3" />
      {labelOn}
    </Badge>
  ) : (
    <Badge
      variant="secondary"
      className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 font-medium"
    >
      <ShieldAlert className="mr-1 h-3 w-3" />
      {labelOff}
    </Badge>
  );
}

// ---------- Main ----------

export default function PortalMyDevicePage() {
  const { user, loading: authLoading } = useAuth();
  const [device, setDevice] = useState<Device | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;

    const fetchDevice = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('devices')
        .select('*')
        .eq('assigned_user_id', user.id)
        .maybeSingle();

      if (data) {
        setDevice(data as Device);
      }
      setLoading(false);
    };

    fetchDevice();
  }, [user?.id]);

  const isLoading = authLoading || loading;

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (!device) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight mb-6">My Device</h1>
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
          <Monitor className="h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-lg font-medium text-muted-foreground">
            No device assigned
          </p>
          <p className="mt-1 text-sm text-muted-foreground text-center max-w-sm">
            You do not currently have a device assigned to your account. Please
            contact your IT administrator to get a device enrolled.
          </p>
        </div>
      </div>
    );
  }

  const storagePercent =
    device.storage_total_gb > 0
      ? Math.round((device.storage_used_gb / device.storage_total_gb) * 100)
      : 0;

  const storageColor =
    storagePercent > 90
      ? 'text-red-600 dark:text-red-400'
      : storagePercent > 70
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-muted-foreground';

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">My Device</h1>
        <Link href="/portal/support">
          <Button className="gap-2">
            <LifeBuoy className="h-4 w-4" />
            Request Support
          </Button>
        </Link>
      </div>

      {/* Device Info Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                <Monitor className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg">{device.device_name}</CardTitle>
                <CardDescription>
                  Serial: {device.serial_number}
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {device.is_online ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                  <span className="text-sm text-green-600 dark:text-green-400">Online</span>
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-gray-400" />
                  <span className="text-sm text-muted-foreground">Offline</span>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground">macOS Version</p>
              <p className="text-sm font-medium">{device.macos_version}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Hardware Model</p>
              <p className="text-sm font-medium">{device.hardware_model}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">CPU Type</p>
              <div className="flex items-center gap-1.5">
                <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-sm font-medium">{getCpuTypeLabel(device.cpu_type)}</p>
              </div>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            Last active: {formatDistanceToNow(new Date(device.last_active_at), { addSuffix: true })}
          </div>
        </CardContent>
      </Card>

      {/* Storage Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
              <HardDrive className="h-4 w-4" />
            </div>
            <CardTitle className="text-base">Storage</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {device.storage_used_gb} GB used of {device.storage_total_gb} GB
              </span>
              <span className={cn('font-medium', storageColor)}>
                {storagePercent}%
              </span>
            </div>
            <Progress value={storagePercent} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* Battery Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
              <Battery className="h-4 w-4" />
            </div>
            <CardTitle className="text-base">Battery</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Health</p>
              <div className="flex items-center gap-1.5">
                <Progress value={device.battery_health} className="h-2 flex-1" />
                <span className="text-sm font-medium">{device.battery_health}%</span>
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Cycle Count</p>
              <p className="text-sm font-medium">{device.battery_cycle_count}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Security Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
              <Shield className="h-4 w-4" />
            </div>
            <CardTitle className="text-base">Security Status</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {getSecurityBadge(device.filevault_enabled, 'FileVault On', 'FileVault Off')}
            {getSecurityBadge(device.firewall_enabled, 'Firewall On', 'Firewall Off')}
            {getSecurityBadge(
              device.password_policy_compliant,
              'Password Policy Met',
              'Password Policy Not Met'
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
