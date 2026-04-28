'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import type { Device, Command, Ticket as TicketType } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Monitor, Wifi, ShieldAlert, Ticket, TriangleAlert as AlertTriangle, WifiOff, Circle as XCircle } from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { formatDistanceToNow } from 'date-fns';

// ---------- Chart configs ----------

const complianceChartConfig: ChartConfig = {
  compliant: { label: 'Compliant', color: 'hsl(142, 71%, 45%)' },
  non_compliant: { label: 'Non-Compliant', color: 'hsl(0, 72%, 51%)' },
  unknown: { label: 'Unknown', color: 'hsl(215, 16%, 46%)' },
};

const commandActivityChartConfig: ChartConfig = {
  lock: { label: 'Lock', color: 'hsl(215, 65%, 48%)' },
  restart: { label: 'Restart', color: 'hsl(142, 71%, 45%)' },
  shutdown: { label: 'Shutdown', color: 'hsl(38, 92%, 50%)' },
  run_script: { label: 'Run Script', color: 'hsl(200, 65%, 50%)' },
  install_app: { label: 'Install App', color: 'hsl(170, 60%, 45%)' },
  uninstall_app: { label: 'Uninstall App', color: 'hsl(0, 72%, 51%)' },
  collect_logs: { label: 'Collect Logs', color: 'hsl(280, 50%, 55%)' },
};

// ---------- Helpers ----------

function getCommandStatusBadge(status: Command['status']) {
  const map: Record<string, { label: string; className: string }> = {
    pending: { label: 'Pending', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
    queued: { label: 'Queued', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
    sent: { label: 'Sent', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
    executing: { label: 'Executing', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
    completed: { label: 'Completed', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
    failed: { label: 'Failed', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  };
  const entry = map[status] || { label: status, className: '' };
  return (
    <Badge variant="secondary" className={cn('font-medium', entry.className)}>
      {entry.label}
    </Badge>
  );
}

function getCommandTypeLabel(type: Command['command_type']): string {
  const map: Record<string, string> = {
    lock: 'Lock',
    restart: 'Restart',
    shutdown: 'Shutdown',
    run_script: 'Run Script',
    install_app: 'Install App',
    uninstall_app: 'Uninstall App',
    collect_logs: 'Collect Logs',
  };
  return map[type] || type;
}

// ---------- Skeleton components ----------

function StatsCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-4 rounded" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-16" />
      </CardContent>
    </Card>
  );
}

function ChartSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-48" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-[250px] w-full" />
      </CardContent>
    </Card>
  );
}

function ActivitySkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

// ---------- Main page ----------

export default function DashboardPage() {
  const { profile, organization, loading: authLoading } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [commands, setCommands] = useState<Command[]>([]);
  const [tickets, setTickets] = useState<TicketType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!organization?.id) return;

    const fetchData = async () => {
      setLoading(true);
      const orgId = organization.id;

      const [devicesRes, commandsRes, ticketsRes] = await Promise.all([
        supabase.from('devices').select('*').eq('organization_id', orgId),
        supabase
          .from('commands')
          .select('*')
          .eq('organization_id', orgId)
          .order('created_at', { ascending: false }),
        supabase
          .from('tickets')
          .select('*')
          .eq('organization_id', orgId),
      ]);

      if (devicesRes.data) setDevices(devicesRes.data as Device[]);
      if (commandsRes.data) setCommands(commandsRes.data as Command[]);
      if (ticketsRes.data) setTickets(ticketsRes.data as TicketType[]);
      setLoading(false);
    };

    fetchData();
  }, [organization?.id]);

  // ---------- Derived data ----------

  const totalDevices = devices.length;
  const onlineDevices = devices.filter((d) => d.is_online).length;
  const nonCompliantDevices = devices.filter(
    (d) => d.compliance_status === 'non_compliant'
  ).length;
  const openTickets = tickets.filter((t) => t.status === 'open' || t.status === 'in_progress').length;

  const complianceData = useMemo(() => {
    const counts = { compliant: 0, non_compliant: 0, unknown: 0 };
    devices.forEach((d) => {
      if (d.compliance_status in counts) {
        counts[d.compliance_status as keyof typeof counts]++;
      } else {
        counts.unknown++;
      }
    });
    return [
      { name: 'Compliant', value: counts.compliant, fill: 'var(--color-compliant)' },
      { name: 'Non-Compliant', value: counts.non_compliant, fill: 'var(--color-non_compliant)' },
      { name: 'Unknown', value: counts.unknown, fill: 'var(--color-unknown)' },
    ];
  }, [devices]);

  const commandActivityData = useMemo(() => {
    const typeCounts: Record<string, number> = {};
    commands.forEach((c) => {
      typeCounts[c.command_type] = (typeCounts[c.command_type] || 0) + 1;
    });
    return Object.entries(typeCounts).map(([type, count]) => ({
      type,
      count,
      fill: `var(--color-${type})`,
    }));
  }, [commands]);

  const recentCommands = useMemo(() => commands.slice(0, 5), [commands]);

  const offlineDevices = useMemo(
    () => devices.filter((d) => !d.is_online),
    [devices]
  );

  const alerts = useMemo(() => {
    const items: { id: string; icon: React.ReactNode; label: string; variant: 'warning' | 'danger' }[] = [];

    offlineDevices.forEach((d) => {
      items.push({
        id: `offline-${d.id}`,
        icon: <WifiOff className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />,
        label: `${d.device_name} is offline`,
        variant: 'warning',
      });
    });

    devices
      .filter((d) => d.compliance_status === 'non_compliant')
      .forEach((d) => {
        items.push({
          id: `noncompliant-${d.id}`,
          icon: <ShieldAlert className="h-4 w-4 text-red-600 dark:text-red-400" />,
          label: `${d.device_name} is non-compliant`,
          variant: 'danger',
        });
      });

    commands
      .filter((c) => c.status === 'failed')
      .slice(0, 5)
      .forEach((c) => {
        items.push({
          id: `failed-${c.id}`,
          icon: <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />,
          label: `${getCommandTypeLabel(c.command_type)} command failed`,
          variant: 'danger',
        });
      });

    return items;
  }, [offlineDevices, devices, commands]);

  const isLoading = authLoading || loading;

  return (
    <div className="space-y-6">
      {/* Welcome header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Welcome back, {profile?.full_name || 'User'}
        </h1>
        <p className="text-muted-foreground">
          {organization?.name || 'Organization'} dashboard overview
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <StatsCardSkeleton key={i} />)
        ) : (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Devices</CardTitle>
                <Monitor className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalDevices}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Online Devices</CardTitle>
                <Wifi className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{onlineDevices}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Non-Compliant</CardTitle>
                <ShieldAlert className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{nonCompliantDevices}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Open Tickets</CardTitle>
                <Ticket className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{openTickets}</div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        {isLoading ? (
          <>
            <ChartSkeleton />
            <ChartSkeleton />
          </>
        ) : (
          <>
            {/* Device Compliance donut chart */}
            <Card>
              <CardHeader>
                <CardTitle>Device Compliance</CardTitle>
                <CardDescription>
                  Compliance status across all enrolled devices
                </CardDescription>
              </CardHeader>
              <CardContent>
                {complianceData.every((d) => d.value === 0) ? (
                  <div className="flex h-[250px] items-center justify-center text-muted-foreground">
                    No device data available
                  </div>
                ) : (
                  <ChartContainer config={complianceChartConfig} className="mx-auto h-[250px] w-full">
                    <PieChart>
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Pie
                        data={complianceData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={2}
                      >
                        {complianceData.map((entry, index) => (
                          <Cell key={index} fill={entry.fill} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            {/* Command Activity bar chart */}
            <Card>
              <CardHeader>
                <CardTitle>Command Activity</CardTitle>
                <CardDescription>
                  Commands grouped by type
                </CardDescription>
              </CardHeader>
              <CardContent>
                {commandActivityData.length === 0 ? (
                  <div className="flex h-[250px] items-center justify-center text-muted-foreground">
                    No command data available
                  </div>
                ) : (
                  <ChartContainer config={commandActivityChartConfig} className="mx-auto h-[250px] w-full">
                    <BarChart data={commandActivityData} layout="vertical">
                      <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis
                        type="category"
                        dataKey="type"
                        tickFormatter={(value: string) =>
                          getCommandTypeLabel(value as Command['command_type'])
                        }
                        width={90}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                        {commandActivityData.map((entry, index) => (
                          <Cell key={index} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Recent Activity + Alerts */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest 5 commands issued</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <ActivitySkeleton />
            ) : recentCommands.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-muted-foreground">
                No recent commands
              </div>
            ) : (
              <div className="space-y-4">
                {recentCommands.map((cmd) => {
                  const device = devices.find((d) => d.id === cmd.device_id);
                  return (
                    <div
                      key={cmd.id}
                      className="flex items-center justify-between gap-4"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {device?.device_name || 'Unknown Device'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {getCommandTypeLabel(cmd.command_type)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        {getCommandStatusBadge(cmd.status)}
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDistanceToNow(new Date(cmd.created_at), {
                            addSuffix: true,
                          })}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Alerts */}
        <Card>
          <CardHeader>
            <CardTitle>Alerts</CardTitle>
            <CardDescription>
              Issues requiring your attention
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-4 w-4 rounded" />
                    <Skeleton className="h-4 w-48" />
                  </div>
                ))}
              </div>
            ) : alerts.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-muted-foreground">
                <AlertTriangle className="mr-2 h-4 w-4" />
                No alerts at this time
              </div>
            ) : (
              <div className="space-y-3">
                {alerts.slice(0, 10).map((alert) => (
                  <div
                    key={alert.id}
                    className="flex items-center gap-3 rounded-md border px-3 py-2"
                  >
                    {alert.icon}
                    <span className="text-sm">{alert.label}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
