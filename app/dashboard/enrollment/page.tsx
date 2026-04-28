'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import type { EnrollmentToken, Device } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, format } from 'date-fns';

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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';

import { Plus, Copy, Trash2, Check, Clock, CircleAlert as AlertCircle, Download, Key, Apple } from 'lucide-react';

// ---------- Types ----------

interface TokenWithDevice extends EnrollmentToken {
  device?: Device | null;
}

// ---------- Helpers ----------

function getTokenStatus(token: TokenWithDevice): 'Used' | 'Unused' | 'Expired' {
  if (token.used) return 'Used';
  if (new Date(token.expires_at) < new Date()) return 'Expired';
  return 'Unused';
}

function getStatusBadge(status: 'Used' | 'Unused' | 'Expired') {
  const map: Record<string, { label: string; className: string }> = {
    Used: {
      label: 'Used',
      className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    },
    Unused: {
      label: 'Unused',
      className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    },
    Expired: {
      label: 'Expired',
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

function truncateToken(token: string): string {
  if (token.length <= 16) return token;
  return `${token.slice(0, 8)}...${token.slice(-4)}`;
}

// ---------- Skeletons ----------

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

// ---------- Main Page ----------

export default function EnrollmentPage() {
  const { organization, loading: authLoading } = useAuth();

  const [tokens, setTokens] = useState<TokenWithDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revokingToken, setRevokingToken] = useState<TokenWithDevice | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [generating, setGenerating] = useState(false);

  // APNs placeholder fields
  const [apnsCert, setApnsCert] = useState('');
  const [apnsKeyId, setApnsKeyId] = useState('');
  const [apnsTeamId, setApnsTeamId] = useState('');

  // ---------- Fetch tokens ----------

  const fetchTokens = useCallback(async () => {
    if (!organization?.id) return;
    setLoading(true);

    const { data } = await supabase
      .from('enrollment_tokens')
      .select('*')
      .eq('organization_id', organization.id)
      .order('created_at', { ascending: false });

    if (data && data.length > 0) {
      const tokenList = data as EnrollmentToken[];

      // Fetch devices that used these tokens
      const usedDeviceIds = tokenList
        .filter((t) => t.used_by_device_id)
        .map((t) => t.used_by_device_id as string);

      let deviceMap: Record<string, Device> = {};
      if (usedDeviceIds.length > 0) {
        const { data: devices } = await supabase
          .from('devices')
          .select('*')
          .in('id', usedDeviceIds);

        if (devices) {
          devices.forEach((d) => {
            deviceMap[d.id] = d as Device;
          });
        }
      }

      const enriched: TokenWithDevice[] = tokenList.map((t) => ({
        ...t,
        device: t.used_by_device_id ? deviceMap[t.used_by_device_id] || null : null,
      }));

      setTokens(enriched);
    } else {
      setTokens([]);
    }

    setLoading(false);
  }, [organization?.id]);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  // ---------- Generate token ----------

  const handleGenerate = useCallback(async () => {
    if (!organization?.id || !supabase.auth.getSession()) return;
    setGenerating(true);

    const token = crypto.randomUUID().replace(/-/g, '');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const { error } = await supabase.from('enrollment_tokens').insert({
      organization_id: organization.id,
      token,
      created_by: '',
      expires_at: expiresAt.toISOString(),
      used: false,
      used_by_device_id: null,
    });

    if (!error) {
      await fetchTokens();
    }
    setGenerating(false);
  }, [organization?.id, fetchTokens]);

  // ---------- Copy token ----------

  const handleCopy = useCallback(async (token: string, id: string) => {
    await navigator.clipboard.writeText(token);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  // ---------- Revoke token ----------

  const handleRevoke = useCallback(async () => {
    if (!revokingToken) return;
    setRevoking(true);

    const { error } = await supabase
      .from('enrollment_tokens')
      .delete()
      .eq('id', revokingToken.id);

    if (!error) {
      await fetchTokens();
    }
    setRevoking(false);
    setRevokingToken(null);
  }, [revokingToken, fetchTokens]);

  const isLoading = authLoading || loading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Device Enrollment</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Generate enrollment tokens to register new macOS devices into your fleet.
          </p>
        </div>
        <Button onClick={handleGenerate} disabled={generating} className="gap-2">
          {generating ? (
            <Check className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Generate Enrollment Token
        </Button>
      </div>

      {/* Tokens Table */}
      {isLoading ? (
        <TableSkeleton />
      ) : tokens.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
          <Key className="h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-lg font-medium text-muted-foreground">
            No enrollment tokens
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Generate a token to start enrolling devices.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Token</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Device</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tokens.map((token) => {
                const status = getTokenStatus(token);
                const isExpired = status === 'Expired';
                const isUsed = status === 'Used';

                return (
                  <TableRow key={token.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <code className="rounded bg-muted px-2 py-1 text-sm font-mono">
                          {truncateToken(token.token)}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleCopy(token.token, token.id)}
                        >
                          {copiedId === token.id ? (
                            <Check className="h-3.5 w-3.5 text-green-600" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(token.created_at), { addSuffix: true })}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        {isExpired ? (
                          <span className="text-red-600 dark:text-red-400">
                            {formatDistanceToNow(new Date(token.expires_at), { addSuffix: true })}
                          </span>
                        ) : (
                          formatDistanceToNow(new Date(token.expires_at), { addSuffix: true })
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(status)}</TableCell>
                    <TableCell className="text-sm">
                      {token.device ? (
                        <span className="font-medium">{token.device.device_name}</span>
                      ) : (
                        <span className="text-muted-foreground">--</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Dialog
                        open={revokingToken?.id === token.id}
                        onOpenChange={(open) => {
                          if (!open) setRevokingToken(null);
                        }}
                      >
                        <DialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            disabled={isUsed}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-red-600" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Revoke Enrollment Token</DialogTitle>
                            <DialogDescription>
                              Are you sure you want to revoke this token? This action cannot be
                              undone. Devices using this token will no longer be able to enroll.
                            </DialogDescription>
                          </DialogHeader>
                          <DialogFooter>
                            <Button
                              variant="outline"
                              onClick={() => setRevokingToken(null)}
                            >
                              Cancel
                            </Button>
                            <Button
                              variant="destructive"
                              onClick={handleRevoke}
                              disabled={revoking}
                            >
                              {revoking ? 'Revoking...' : 'Revoke Token'}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Enrollment Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Download className="h-4 w-4" />
            Enrollment Instructions
          </CardTitle>
          <CardDescription>
            Follow these steps to enroll a macOS device into CommandKit.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-4">
            <li className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                1
              </span>
              <div>
                <p className="font-medium">Install MDM Profile</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Run the following command on the target device, replacing TOKEN with a valid
                  enrollment token:
                </p>
                <div className="mt-2 flex items-center gap-2 rounded-md bg-muted p-3">
                  <code className="text-sm font-mono">
                    curl -sSL https://your-server/enroll/TOKEN | bash
                  </code>
                </div>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                2
              </span>
              <div>
                <p className="font-medium">Device Appears in Inventory</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Once the profile is installed, the device will automatically check in and appear
                  in the device inventory with its hardware details.
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                3
              </span>
              <div>
                <p className="font-medium">Agent Reports Metrics</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  The CommandKit agent running on the device will begin reporting system metrics,
                  compliance status, and accept remote commands from the dashboard.
                </p>
              </div>
            </li>
          </ol>
        </CardContent>
      </Card>

      {/* APNs Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Apple className="h-4 w-4" />
            APNs Configuration
          </CardTitle>
          <CardDescription>
            Configure Apple Push Notification service credentials to enable MDM push
            notifications to enrolled devices.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="apns-cert">APNs Certificate (.p8)</Label>
            <Input
              id="apns-cert"
              type="file"
              accept=".p8"
              className="cursor-pointer"
              value={apnsCert}
              onChange={(e) => setApnsCert(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Upload the APNs key file obtained from your Apple Developer account.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="apns-key-id">Key ID</Label>
              <Input
                id="apns-key-id"
                placeholder="e.g. ABC1234DEF"
                value={apnsKeyId}
                onChange={(e) => setApnsKeyId(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="apns-team-id">Team ID</Label>
              <Input
                id="apns-team-id"
                placeholder="e.g. DEF123GHIJ"
                value={apnsTeamId}
                onChange={(e) => setApnsTeamId(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/20">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-sm text-amber-800 dark:text-amber-300">
              APNs configuration is required for sending MDM commands to enrolled devices. Without
              valid credentials, commands will remain in a queued state.
            </p>
          </div>
          <Button variant="outline" className="gap-2">
            <Key className="h-4 w-4" />
            Save APNs Configuration
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
