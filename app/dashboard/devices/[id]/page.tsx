'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import type { Device, InstalledApp, Command, Profile } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, format } from 'date-fns';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Monitor, Cpu, HardDrive, Battery, Shield, Lock, Terminal, AppWindow, Activity, CircleCheck as CheckCircle, Circle as XCircle, TriangleAlert as AlertTriangle, Send, Plus } from 'lucide-react';

// ---------- Helpers ----------

function getComplianceBadge(status: Device['compliance_status']) {
  const map: Record<string, { label: string; className: string }> = {
    compliant: {
      label: 'Compliant',
      className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    },
    non_compliant: {
      label: 'Non-Compliant',
      className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    },
    unknown: {
      label: 'Unknown',
      className: 'bg-gray-100 text-gray-800 dark:bg-gray-800/30 dark:text-gray-400',
    },
  };
  const entry = map[status] || { label: status, className: '' };
  return (
    <Badge variant="secondary" className={cn('font-medium', entry.className)}>
      {entry.label}
    </Badge>
  );
}

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

function getCpuTypeLabel(cpuType: Device['cpu_type']): string {
  if (cpuType === 'apple_silicon') return 'Apple Silicon';
  if (cpuType === 'intel') return 'Intel';
  return 'Unknown';
}

// ---------- Skeletons ----------

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-8 w-8" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-28" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ---------- Main Page ----------

export default function DeviceDetailPage() {
  const router = useRouter();
  const params = useParams();
  const deviceId = params.id as string;
  const { organization, loading: authLoading } = useAuth();

  const [device, setDevice] = useState<Device | null>(null);
  const [assignedUser, setAssignedUser] = useState<Profile | null>(null);
  const [installedApps, setInstalledApps] = useState<InstalledApp[]>([]);
  const [commands, setCommands] = useState<Command[]>([]);
  const [loading, setLoading] = useState(true);

  // New command dialog
  const [commandDialogOpen, setCommandDialogOpen] = useState(false);
  const [newCommandType, setNewCommandType] = useState<Command['command_type']>('lock');
  const [newCommandPayload, setNewCommandPayload] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // ---------- Fetch ----------

  useEffect(() => {
    if (!deviceId) return;

    const fetchDevice = async () => {
      setLoading(true);

      const { data: deviceData } = await supabase
        .from('devices')
        .select('*')
        .eq('id', deviceId)
        .maybeSingle();

      if (deviceData) {
        const d = deviceData as Device;
        setDevice(d);

        // Fetch assigned user
        if (d.assigned_user_id) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', d.assigned_user_id)
            .maybeSingle();
          if (profile) setAssignedUser(profile as Profile);
        }

        // Fetch installed apps
        const { data: apps } = await supabase
          .from('installed_apps')
          .select('*')
          .eq('device_id', deviceId)
          .order('app_name', { ascending: true });
        if (apps) setInstalledApps(apps as InstalledApp[]);

        // Fetch commands
        const { data: cmds } = await supabase
          .from('commands')
          .select('*')
          .eq('device_id', deviceId)
          .order('created_at', { ascending: false });
        if (cmds) setCommands(cmds as Command[]);
      }

      setLoading(false);
    };

    fetchDevice();
  }, [deviceId]);

  // ---------- Submit command ----------

  const handleSubmitCommand = useCallback(async () => {
    if (!organization?.id || !deviceId) return;

    setSubmitting(true);
    let payload: Record<string, unknown> = {};
    if (newCommandPayload.trim()) {
      try {
        payload = JSON.parse(newCommandPayload);
      } catch {
        payload = { raw: newCommandPayload };
      }
    }

    const { error } = await supabase.from('commands').insert({
      organization_id: organization.id,
      device_id: deviceId,
      issued_by: '',
      command_type: newCommandType,
      payload,
      status: 'pending',
    });

    if (!error) {
      // Refresh commands
      const { data: cmds } = await supabase
        .from('commands')
        .select('*')
        .eq('device_id', deviceId)
        .order('created_at', { ascending: false });
      if (cmds) setCommands(cmds as Command[]);

      setCommandDialogOpen(false);
      setNewCommandPayload('');
      setNewCommandType('lock');
    }

    setSubmitting(false);
  }, [organization?.id, deviceId, newCommandType, newCommandPayload]);

  // ---------- Compliance score ----------

  const complianceScore = useMemo(() => {
    if (!device) return 0;
    let score = 0;
    if (device.filevault_enabled) score += 1;
    if (device.firewall_enabled) score += 1;
    if (device.password_policy_compliant) score += 1;
    return Math.round((score / 3) * 100);
  }, [device]);

  const isLoading = authLoading || loading;

  if (isLoading) {
    return <DetailSkeleton />;
  }

  if (!device) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Monitor className="h-12 w-12 text-muted-foreground/50" />
        <p className="mt-4 text-lg font-medium text-muted-foreground">
          Device not found
        </p>
        <Button
          variant="outline"
          className="mt-4 gap-2"
          onClick={() => router.push('/dashboard/devices')}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Devices
        </Button>
      </div>
    );
  }

  const storagePercent =
    device.storage_total_gb > 0
      ? Math.round((device.storage_used_gb / device.storage_total_gb) * 100)
      : 0;

  return (
    <div className="space-y-6">
      {/* Back button & header */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="mb-2 gap-2 text-muted-foreground"
          onClick={() => router.push('/dashboard/devices')}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Devices
        </Button>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600/10">
              <Monitor className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                {device.device_name}
              </h1>
              <p className="text-sm text-muted-foreground">
                Serial: {device.serial_number}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {device.is_online ? (
              <Badge
                variant="secondary"
                className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
              >
                <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-green-500" />
                Online
              </Badge>
            ) : (
              <Badge
                variant="secondary"
                className="bg-gray-100 text-gray-800 dark:bg-gray-800/30 dark:text-gray-400"
              >
                <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-gray-400" />
                Offline
              </Badge>
            )}
            {getComplianceBadge(device.compliance_status)}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview" className="gap-2">
            <Activity className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="applications" className="gap-2">
            <AppWindow className="h-4 w-4" />
            Applications
          </TabsTrigger>
          <TabsTrigger value="commands" className="gap-2">
            <Terminal className="h-4 w-4" />
            Commands
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2">
            <Shield className="h-4 w-4" />
            Security
          </TabsTrigger>
        </TabsList>

        {/* ===== Overview Tab ===== */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* System Info */}
            <Card>
              <CardHeader className="flex flex-row items-center gap-2 pb-2">
                <Monitor className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">System Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">macOS</span>
                  <span className="font-medium">{device.macos_version}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Hardware</span>
                  <span className="font-medium">{device.hardware_model}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">CPU</span>
                  <span className="flex items-center gap-1.5 font-medium">
                    <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                    {getCpuTypeLabel(device.cpu_type)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">UUID</span>
                  <span className="font-mono text-xs">{device.device_uuid}</span>
                </div>
              </CardContent>
            </Card>

            {/* Storage */}
            <Card>
              <CardHeader className="flex flex-row items-center gap-2 pb-2">
                <HardDrive className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">Storage</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Used</span>
                  <span className="font-medium">
                    {device.storage_used_gb} / {device.storage_total_gb} GB
                  </span>
                </div>
                <Progress value={storagePercent} />
                <p className="text-xs text-muted-foreground">
                  {storagePercent}% used
                </p>
              </CardContent>
            </Card>

            {/* Battery */}
            <Card>
              <CardHeader className="flex flex-row items-center gap-2 pb-2">
                <Battery className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">Battery</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Health</span>
                  <span className="font-medium">{device.battery_health}%</span>
                </div>
                <Progress
                  value={device.battery_health}
                  className={cn(
                    device.battery_health > 80
                      ? '[&>div]:bg-green-500'
                      : device.battery_health > 50
                      ? '[&>div]:bg-yellow-500'
                      : '[&>div]:bg-red-500'
                  )}
                />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cycle Count</span>
                  <span className="font-medium">{device.battery_cycle_count}</span>
                </div>
              </CardContent>
            </Card>

            {/* Activity */}
            <Card>
              <CardHeader className="flex flex-row items-center gap-2 pb-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">Activity</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Enrolled</span>
                  <span className="font-medium">
                    {format(new Date(device.enrollment_date), 'MMM d, yyyy')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last Active</span>
                  <span className="font-medium">
                    {formatDistanceToNow(new Date(device.last_active_at), {
                      addSuffix: true,
                    })}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Assigned User */}
            <Card>
              <CardHeader className="flex flex-row items-center gap-2 pb-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">Assigned User</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                {assignedUser ? (
                  <div className="space-y-1">
                    <p className="font-medium">{assignedUser.full_name}</p>
                    <p className="text-muted-foreground">{assignedUser.email}</p>
                  </div>
                ) : (
                  <p className="text-muted-foreground">No user assigned</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ===== Applications Tab ===== */}
        <TabsContent value="applications" className="space-y-4">
          {installedApps.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
              <AppWindow className="h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-lg font-medium text-muted-foreground">
                No installed apps found
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Application data will appear once the device reports its inventory.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>App Name</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>Bundle ID</TableHead>
                    <TableHead>Installed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {installedApps.map((app) => (
                    <TableRow key={app.id}>
                      <TableCell className="font-medium">
                        {app.app_name}
                      </TableCell>
                      <TableCell>{app.app_version}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {app.bundle_id}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDistanceToNow(new Date(app.installed_at), {
                          addSuffix: true,
                        })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ===== Commands Tab ===== */}
        <TabsContent value="commands" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Command History</h3>
            <Dialog open={commandDialogOpen} onOpenChange={setCommandDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-2">
                  <Plus className="h-4 w-4" />
                  New Command
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Issue New Command</DialogTitle>
                  <DialogDescription>
                    Send a command to {device.device_name}. The command will be
                    queued and delivered to the device.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Command Type</label>
                    <Select
                      value={newCommandType}
                      onValueChange={(v) =>
                        setNewCommandType(v as Command['command_type'])
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lock">Lock</SelectItem>
                        <SelectItem value="restart">Restart</SelectItem>
                        <SelectItem value="shutdown">Shutdown</SelectItem>
                        <SelectItem value="run_script">Run Script</SelectItem>
                        <SelectItem value="install_app">Install App</SelectItem>
                        <SelectItem value="uninstall_app">Uninstall App</SelectItem>
                        <SelectItem value="collect_logs">Collect Logs</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Payload{' '}
                      <span className="font-normal text-muted-foreground">
                        (optional, JSON)
                      </span>
                    </label>
                    <Textarea
                      placeholder='{"script": "#!/bin/bash\necho hello"}'
                      value={newCommandPayload}
                      onChange={(e) => setNewCommandPayload(e.target.value)}
                      rows={5}
                      className="font-mono text-sm"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setCommandDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSubmitCommand}
                    disabled={submitting}
                    className="gap-2"
                  >
                    <Send className="h-4 w-4" />
                    {submitting ? 'Sending...' : 'Send Command'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {commands.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
              <Terminal className="h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-lg font-medium text-muted-foreground">
                No commands yet
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Issue a command to this device to get started.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Issued</TableHead>
                    <TableHead>Result Preview</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {commands.map((cmd) => (
                    <TableRow key={cmd.id}>
                      <TableCell className="font-medium">
                        {getCommandTypeLabel(cmd.command_type)}
                      </TableCell>
                      <TableCell>
                        {getCommandStatusBadge(cmd.status)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDistanceToNow(new Date(cmd.created_at), {
                          addSuffix: true,
                        })}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                        {cmd.result
                          ? JSON.stringify(cmd.result).slice(0, 80)
                          : '--'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ===== Security Tab ===== */}
        <TabsContent value="security" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* FileVault */}
            <Card>
              <CardHeader className="flex flex-row items-center gap-2 pb-2">
                <Lock className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">FileVault</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  {device.filevault_enabled ? (
                    <>
                      <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                      <span className="text-sm font-medium text-green-700 dark:text-green-400">
                        Enabled
                      </span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                      <span className="text-sm font-medium text-red-700 dark:text-red-400">
                        Disabled
                      </span>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Firewall */}
            <Card>
              <CardHeader className="flex flex-row items-center gap-2 pb-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">Firewall</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  {device.firewall_enabled ? (
                    <>
                      <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                      <span className="text-sm font-medium text-green-700 dark:text-green-400">
                        Enabled
                      </span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                      <span className="text-sm font-medium text-red-700 dark:text-red-400">
                        Disabled
                      </span>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Password Policy */}
            <Card>
              <CardHeader className="flex flex-row items-center gap-2 pb-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">Password Policy</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  {device.password_policy_compliant ? (
                    <>
                      <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                      <span className="text-sm font-medium text-green-700 dark:text-green-400">
                        Compliant
                      </span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                      <span className="text-sm font-medium text-yellow-700 dark:text-yellow-400">
                        Non-Compliant
                      </span>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Compliance Score */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Compliance Score</CardTitle>
              <CardDescription>
                Calculated from FileVault, Firewall, and Password Policy status
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="text-3xl font-bold">{complianceScore}%</div>
                <div className="flex-1">
                  <Progress
                    value={complianceScore}
                    className={cn(
                      'h-3',
                      complianceScore >= 100
                        ? '[&>div]:bg-green-500'
                        : complianceScore >= 66
                        ? '[&>div]:bg-yellow-500'
                        : complianceScore >= 33
                        ? '[&>div]:bg-orange-500'
                        : '[&>div]:bg-red-500'
                    )}
                  />
                </div>
              </div>
              <div className="grid gap-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">FileVault Encryption</span>
                  {device.filevault_enabled ? (
                    <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Firewall Enabled</span>
                  {device.firewall_enabled ? (
                    <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Password Policy</span>
                  {device.password_policy_compliant ? (
                    <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
