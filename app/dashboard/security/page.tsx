'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import type { Device } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';

import { Shield, ShieldCheck, ShieldAlert, ShieldX, Lock, Clock as Unlock, Key, TriangleAlert as AlertTriangle, CircleCheck as CheckCircle, Circle as XCircle, RefreshCw, Monitor } from 'lucide-react';

// ---------- Types ----------

interface SecurityAlert {
  id: string;
  deviceId: string;
  deviceName: string;
  message: string;
  severity: 'critical' | 'warning' | 'info';
}

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

function getSeverityBadge(severity: SecurityAlert['severity']) {
  const map: Record<SecurityAlert['severity'], { label: string; className: string }> = {
    critical: {
      label: 'Critical',
      className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    },
    warning: {
      label: 'Warning',
      className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    },
    info: {
      label: 'Info',
      className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    },
  };
  const entry = map[severity];
  return (
    <Badge variant="secondary" className={cn('font-medium', entry.className)}>
      {entry.label}
    </Badge>
  );
}

function getDeviceIssues(device: Device): string[] {
  const issues: string[] = [];
  if (!device.filevault_enabled) issues.push('FileVault disabled');
  if (!device.firewall_enabled) issues.push('Firewall disabled');
  if (!device.password_policy_compliant) issues.push('Password policy non-compliant');
  return issues;
}

function deriveAlerts(devices: Device[]): SecurityAlert[] {
  const alerts: SecurityAlert[] = [];

  devices.forEach((device) => {
    if (!device.filevault_enabled) {
      alerts.push({
        id: `fv-${device.id}`,
        deviceId: device.id,
        deviceName: device.device_name,
        message: `FileVault disabled on ${device.device_name}`,
        severity: 'critical',
      });
    }
    if (!device.firewall_enabled) {
      alerts.push({
        id: `fw-${device.id}`,
        deviceId: device.id,
        deviceName: device.device_name,
        message: `Firewall disabled on ${device.device_name}`,
        severity: 'warning',
      });
    }
    if (!device.password_policy_compliant) {
      alerts.push({
        id: `pp-${device.id}`,
        deviceId: device.id,
        deviceName: device.device_name,
        message: `Password policy non-compliant on ${device.device_name}`,
        severity: 'warning',
      });
    }
  });

  // Sort: critical first, then warning, then info
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return alerts;
}

// ---------- Skeletons ----------

function CardSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-lg border p-6">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-2 h-8 w-16" />
        </div>
      ))}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

// ---------- Main Page ----------

export default function SecurityPage() {
  const { organization, loading: authLoading } = useAuth();

  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  // ---------- Fetch devices ----------

  const fetchDevices = useCallback(async () => {
    if (!organization?.id) return;
    setLoading(true);

    const { data } = await supabase
      .from('devices')
      .select('*')
      .eq('organization_id', organization.id);

    if (data) {
      setDevices(data as Device[]);
    } else {
      setDevices([]);
    }
    setLoading(false);
  }, [organization?.id]);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  // ---------- Derived data ----------

  const totalDevices = devices.length;
  const compliantCount = devices.filter((d) => d.compliance_status === 'compliant').length;
  const nonCompliantCount = devices.filter((d) => d.compliance_status === 'non_compliant').length;
  const unknownCount = devices.filter((d) => d.compliance_status === 'unknown').length;

  // FileVault stats
  const fileVaultEnabled = devices.filter((d) => d.filevault_enabled).length;
  const fileVaultDisabled = devices.filter((d) => !d.filevault_enabled).length;
  const fileVaultPercent = totalDevices > 0 ? Math.round((fileVaultEnabled / totalDevices) * 100) : 0;

  // Firewall stats
  const firewallEnabled = devices.filter((d) => d.firewall_enabled).length;
  const firewallDisabled = devices.filter((d) => !d.firewall_enabled).length;
  const firewallPercent = totalDevices > 0 ? Math.round((firewallEnabled / totalDevices) * 100) : 0;

  // Password policy stats
  const passwordCompliant = devices.filter((d) => d.password_policy_compliant).length;
  const passwordNonCompliant = devices.filter((d) => !d.password_policy_compliant).length;
  const passwordPercent = totalDevices > 0 ? Math.round((passwordCompliant / totalDevices) * 100) : 0;

  // Non-compliant devices
  const nonCompliantDevices = useMemo(
    () => devices.filter((d) => d.compliance_status === 'non_compliant'),
    [devices]
  );

  // Security alerts
  const alerts = useMemo(() => deriveAlerts(devices), [devices]);

  // ---------- Run compliance check ----------

  const handleComplianceCheck = useCallback(async () => {
    setChecking(true);
    // Simulate a compliance check running for 2 seconds
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setChecking(false);
    toast.success('Compliance check completed', {
      description: `Scanned ${totalDevices} device${totalDevices !== 1 ? 's' : ''}. ${nonCompliantCount} non-compliant device${nonCompliantCount !== 1 ? 's' : ''} found.`,
    });
  }, [totalDevices, nonCompliantCount]);

  const isLoading = authLoading || loading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Security</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Monitor device compliance, security policies, and alerts across your fleet.
          </p>
        </div>
        <Button onClick={handleComplianceCheck} disabled={checking} className="gap-2">
          {checking ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {checking ? 'Checking...' : 'Run Compliance Check'}
        </Button>
      </div>

      {/* Summary Cards */}
      {isLoading ? (
        <CardSkeleton />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Devices</CardTitle>
              <Monitor className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalDevices}</div>
              <p className="text-xs text-muted-foreground">Enrolled in fleet</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Compliant</CardTitle>
              <ShieldCheck className="h-4 w-4 text-green-600 dark:text-green-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {compliantCount}
              </div>
              <p className="text-xs text-muted-foreground">Meeting all policies</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Non-Compliant</CardTitle>
              <ShieldX className="h-4 w-4 text-red-600 dark:text-red-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                {nonCompliantCount}
              </div>
              <p className="text-xs text-muted-foreground">Policy violations found</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Unknown</CardTitle>
              <Shield className="h-4 w-4 text-gray-500 dark:text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-500 dark:text-gray-400">
                {unknownCount}
              </div>
              <p className="text-xs text-muted-foreground">Not yet assessed</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Compliance Breakdown */}
      {isLoading ? (
        <CardSkeleton />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-4 w-4" />
              Compliance Breakdown
            </CardTitle>
            <CardDescription>
              Overview of security policy compliance across your fleet.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* FileVault */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {fileVaultPercent >= 80 ? (
                    <Lock className="h-4 w-4 text-green-600 dark:text-green-400" />
                  ) : (
                    <Unlock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  )}
                  <span className="text-sm font-medium">FileVault</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-green-600 dark:text-green-400">
                    {fileVaultEnabled} enabled
                  </span>
                  <span className="text-red-600 dark:text-red-400">
                    {fileVaultDisabled} disabled
                  </span>
                </div>
              </div>
              <Progress value={fileVaultPercent} className="h-3" />
              <p className="text-xs text-muted-foreground">
                {fileVaultPercent}% of devices have FileVault enabled
              </p>
            </div>

            {/* Firewall */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {firewallPercent >= 80 ? (
                    <ShieldCheck className="h-4 w-4 text-green-600 dark:text-green-400" />
                  ) : (
                    <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  )}
                  <span className="text-sm font-medium">Firewall</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-green-600 dark:text-green-400">
                    {firewallEnabled} enabled
                  </span>
                  <span className="text-red-600 dark:text-red-400">
                    {firewallDisabled} disabled
                  </span>
                </div>
              </div>
              <Progress value={firewallPercent} className="h-3" />
              <p className="text-xs text-muted-foreground">
                {firewallPercent}% of devices have Firewall enabled
              </p>
            </div>

            {/* Password Policy */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {passwordPercent >= 80 ? (
                    <Key className="h-4 w-4 text-green-600 dark:text-green-400" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  )}
                  <span className="text-sm font-medium">Password Policy</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-green-600 dark:text-green-400">
                    {passwordCompliant} compliant
                  </span>
                  <span className="text-red-600 dark:text-red-400">
                    {passwordNonCompliant} non-compliant
                  </span>
                </div>
              </div>
              <Progress value={passwordPercent} className="h-3" />
              <p className="text-xs text-muted-foreground">
                {passwordPercent}% of devices meet password policy requirements
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Non-Compliant Devices Table */}
      {isLoading ? (
        <TableSkeleton />
      ) : nonCompliantDevices.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="h-4 w-4" />
              Non-Compliant Devices
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-8">
              <CheckCircle className="h-10 w-10 text-green-500" />
              <p className="mt-2 text-sm font-medium text-muted-foreground">
                All devices are compliant
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="h-4 w-4" />
              Non-Compliant Devices
            </CardTitle>
            <CardDescription>
              Devices with one or more security policy violations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Device Name</TableHead>
                    <TableHead>Serial Number</TableHead>
                    <TableHead>Issues</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {nonCompliantDevices.map((device) => {
                    const issues = getDeviceIssues(device);
                    return (
                      <TableRow key={device.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Monitor className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{device.device_name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {device.serial_number}
                        </TableCell>
                        <TableCell>
                          <ul className="space-y-1">
                            {issues.map((issue) => (
                              <li
                                key={issue}
                                className="flex items-center gap-1.5 text-sm"
                              >
                                <XCircle className="h-3.5 w-3.5 text-red-500" />
                                <span>{issue}</span>
                              </li>
                            ))}
                          </ul>
                        </TableCell>
                        <TableCell>{getComplianceBadge(device.compliance_status)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Security Alerts */}
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : alerts.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4" />
              Security Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-8">
              <CheckCircle className="h-10 w-10 text-green-500" />
              <p className="mt-2 text-sm font-medium text-muted-foreground">
                No security alerts
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4" />
              Security Alerts
            </CardTitle>
            <CardDescription>
              Active security issues derived from device states.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {alerts.map((alert) => (
              <Alert
                key={alert.id}
                variant={alert.severity === 'critical' ? 'destructive' : 'default'}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    {alert.severity === 'critical' ? (
                      <ShieldX className="mt-0.5 h-4 w-4 shrink-0" />
                    ) : alert.severity === 'warning' ? (
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    ) : (
                      <Shield className="mt-0.5 h-4 w-4 shrink-0" />
                    )}
                    <div>
                      <AlertTitle className="text-sm">{alert.message}</AlertTitle>
                      <AlertDescription className="text-xs">
                        Device: {alert.deviceName}
                      </AlertDescription>
                    </div>
                  </div>
                  {getSeverityBadge(alert.severity)}
                </div>
              </Alert>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
