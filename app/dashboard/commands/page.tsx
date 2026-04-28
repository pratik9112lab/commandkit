'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import type { Command, Device, Profile } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

import { Terminal, Lock, RotateCcw, Power, Download, Trash2, FileText, Plus, Filter, ChevronDown, ChevronUp, Send, Clock, CircleCheck as CheckCircle, Circle as XCircle, Loader as Loader2 } from 'lucide-react';

// ---------- Types ----------

type CommandStatus = Command['status'];
type CommandType = Command['command_type'];

interface CommandWithDetails extends Command {
  device?: Device | null;
  issuer?: Profile | null;
}

// ---------- Helpers ----------

function getCommandTypeIcon(type: CommandType) {
  const map: Record<CommandType, React.ReactNode> = {
    lock: <Lock className="h-4 w-4" />,
    restart: <RotateCcw className="h-4 w-4" />,
    shutdown: <Power className="h-4 w-4" />,
    run_script: <Terminal className="h-4 w-4" />,
    install_app: <Download className="h-4 w-4" />,
    uninstall_app: <Trash2 className="h-4 w-4" />,
    collect_logs: <FileText className="h-4 w-4" />,
  };
  return map[type] || <Terminal className="h-4 w-4" />;
}

function getCommandTypeLabel(type: CommandType): string {
  const map: Record<CommandType, string> = {
    lock: 'Lock Device',
    restart: 'Restart',
    shutdown: 'Shutdown',
    run_script: 'Run Script',
    install_app: 'Install App',
    uninstall_app: 'Uninstall App',
    collect_logs: 'Collect Logs',
  };
  return map[type] || type;
}

function getStatusBadge(status: CommandStatus) {
  const map: Record<CommandStatus, { label: string; className: string }> = {
    pending: {
      label: 'Pending',
      className: 'bg-gray-100 text-gray-800 dark:bg-gray-800/30 dark:text-gray-400',
    },
    queued: {
      label: 'Queued',
      className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    },
    sent: {
      label: 'Sent',
      className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    },
    executing: {
      label: 'Executing',
      className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    },
    completed: {
      label: 'Completed',
      className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    },
    failed: {
      label: 'Failed',
      className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    },
  };
  const entry = map[status] || { label: status, className: '' };
  return (
    <Badge variant="secondary" className={cn('font-medium', entry.className)}>
      {entry.label}
    </Badge>
  );
}

function getResultPreview(result: Record<string, unknown> | null): string {
  if (!result) return '--';
  try {
    const str = JSON.stringify(result);
    return str.length > 60 ? str.slice(0, 60) + '...' : str;
  } catch {
    return '--';
  }
}

function getStatusIcon(status: CommandStatus) {
  const map: Record<CommandStatus, React.ReactNode> = {
    pending: <Clock className="h-3.5 w-3.5 text-gray-500" />,
    queued: <Clock className="h-3.5 w-3.5 text-blue-500" />,
    sent: <Send className="h-3.5 w-3.5 text-blue-500" />,
    executing: <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />,
    completed: <CheckCircle className="h-3.5 w-3.5 text-green-500" />,
    failed: <XCircle className="h-3.5 w-3.5 text-red-500" />,
  };
  return map[status] || null;
}

// ---------- Skeletons ----------

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-32" />
        </div>
      ))}
    </div>
  );
}

// ---------- Main Page ----------

export default function CommandsPage() {
  const { organization, loading: authLoading } = useAuth();

  const [commands, setCommands] = useState<CommandWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [deviceFilter, setDeviceFilter] = useState<string>('all');

  // Pagination
  const [page, setPage] = useState(1);
  const perPage = 10;

  // New command dialog
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [selectedCommandType, setSelectedCommandType] = useState<string>('');
  const [payload, setPayload] = useState('{}');
  const [submitting, setSubmitting] = useState(false);

  // Devices for select dropdown
  const [devices, setDevices] = useState<Device[]>([]);

  // ---------- Fetch commands ----------

  const fetchCommands = useCallback(async () => {
    if (!organization?.id) return;

    const { data } = await supabase
      .from('commands')
      .select('*')
      .eq('organization_id', organization.id)
      .order('created_at', { ascending: false });

    if (data && data.length > 0) {
      const commandList = data as Command[];

      // Fetch associated devices
      const deviceIds = Array.from(new Set(commandList.map((c) => c.device_id)));
      let deviceMap: Record<string, Device> = {};
      if (deviceIds.length > 0) {
        const { data: deviceData } = await supabase
          .from('devices')
          .select('*')
          .in('id', deviceIds);

        if (deviceData) {
          deviceData.forEach((d) => {
            deviceMap[d.id] = d as Device;
          });
        }
      }

      // Fetch issuer profiles
      const issuerIds = Array.from(new Set(commandList.map((c) => c.issued_by).filter(Boolean) as string[]));
      let issuerMap: Record<string, Profile> = {};
      if (issuerIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('*')
          .in('id', issuerIds);

        if (profiles) {
          profiles.forEach((p) => {
            issuerMap[p.id] = p as Profile;
          });
        }
      }

      const enriched: CommandWithDetails[] = commandList.map((c) => ({
        ...c,
        device: deviceMap[c.device_id] || null,
        issuer: c.issued_by ? issuerMap[c.issued_by] || null : null,
      }));

      setCommands(enriched);
    } else {
      setCommands([]);
    }

    setLoading(false);
  }, [organization?.id]);

  // Fetch devices for the new command dropdown
  const fetchDevices = useCallback(async () => {
    if (!organization?.id) return;
    const { data } = await supabase
      .from('devices')
      .select('*')
      .eq('organization_id', organization.id);

    if (data) {
      setDevices(data as Device[]);
    }
  }, [organization?.id]);

  useEffect(() => {
    setLoading(true);
    fetchCommands();
    fetchDevices();
  }, [fetchCommands, fetchDevices]);

  // Real-time polling every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchCommands();
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchCommands]);

  // ---------- Filtered ----------

  const filteredCommands = useMemo(() => {
    let result = [...commands];

    if (statusFilter !== 'all') {
      result = result.filter((c) => c.status === statusFilter);
    }
    if (typeFilter !== 'all') {
      result = result.filter((c) => c.command_type === typeFilter);
    }
    if (deviceFilter !== 'all') {
      result = result.filter((c) => c.device_id === deviceFilter);
    }

    return result;
  }, [commands, statusFilter, typeFilter, deviceFilter]);

  // ---------- Pagination ----------

  const totalPages = Math.max(1, Math.ceil(filteredCommands.length / perPage));
  const safePage = Math.min(page, totalPages);
  const paginatedCommands = filteredCommands.slice(
    (safePage - 1) * perPage,
    safePage * perPage
  );

  // Reset page on filter changes
  useEffect(() => {
    setPage(1);
  }, [statusFilter, typeFilter, deviceFilter]);

  // ---------- Submit new command ----------

  const handleSubmitCommand = useCallback(async () => {
    if (!organization?.id || !selectedDevice || !selectedCommandType) return;
    setSubmitting(true);

    let parsedPayload: Record<string, unknown> = {};
    try {
      parsedPayload = JSON.parse(payload);
    } catch {
      parsedPayload = {};
    }

    const { error } = await supabase.from('commands').insert({
      organization_id: organization.id,
      device_id: selectedDevice,
      issued_by: '',
      command_type: selectedCommandType,
      payload: parsedPayload,
      status: 'pending',
    });

    if (!error) {
      setNewDialogOpen(false);
      setSelectedDevice('');
      setSelectedCommandType('');
      setPayload('{}');
      await fetchCommands();
    }
    setSubmitting(false);
  }, [organization?.id, selectedDevice, selectedCommandType, payload, fetchCommands]);

  const isLoading = authLoading || loading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Remote Commands</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Issue and monitor remote commands across your enrolled devices.
          </p>
        </div>
        <Dialog open={newDialogOpen} onOpenChange={setNewDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New Command
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Issue New Command</DialogTitle>
              <DialogDescription>
                Select a target device and command type. You can optionally provide a JSON
                payload for script execution or app installation commands.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Device</label>
                <Select value={selectedDevice} onValueChange={setSelectedDevice}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a device" />
                  </SelectTrigger>
                  <SelectContent>
                    {devices.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.device_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Command Type</label>
                <Select value={selectedCommandType} onValueChange={setSelectedCommandType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select command type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lock">Lock Device</SelectItem>
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
                <label className="text-sm font-medium">Payload (JSON, optional)</label>
                <Textarea
                  value={payload}
                  onChange={(e) => setPayload(e.target.value)}
                  placeholder='{"key": "value"}'
                  className="font-mono text-sm"
                  rows={4}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setNewDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmitCommand}
                disabled={submitting || !selectedDevice || !selectedCommandType}
                className="gap-2"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Issue Command
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="queued">Queued</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="executing">Executing</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Command Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="lock">Lock Device</SelectItem>
            <SelectItem value="restart">Restart</SelectItem>
            <SelectItem value="shutdown">Shutdown</SelectItem>
            <SelectItem value="run_script">Run Script</SelectItem>
            <SelectItem value="install_app">Install App</SelectItem>
            <SelectItem value="uninstall_app">Uninstall App</SelectItem>
            <SelectItem value="collect_logs">Collect Logs</SelectItem>
          </SelectContent>
        </Select>

        <Select value={deviceFilter} onValueChange={setDeviceFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Device" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Devices</SelectItem>
            {devices.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.device_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <TableSkeleton />
      ) : filteredCommands.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
          <Terminal className="h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-lg font-medium text-muted-foreground">
            No commands found
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {commands.length === 0
              ? 'Issue a command to get started.'
              : 'Try adjusting your filters.'}
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[30px]" />
                  <TableHead>Device Name</TableHead>
                  <TableHead>Command Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Issued By</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead>Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedCommands.map((command) => {
                  const isExpanded = expandedId === command.id;

                  return (
                    <React.Fragment key={command.id}>
                      <TableRow
                        className="cursor-pointer"
                        onClick={() =>
                          setExpandedId(isExpanded ? null : command.id)
                        }
                      >
                        <TableCell>
                          <button className="inline-flex">
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            )}
                          </button>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getStatusIcon(command.status)}
                            <span className="font-medium">
                              {command.device?.device_name || 'Unknown Device'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getCommandTypeIcon(command.command_type)}
                            <span>{getCommandTypeLabel(command.command_type)}</span>
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(command.status)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {command.issuer?.full_name || 'System'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(command.created_at), {
                            addSuffix: true,
                          })}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(command.updated_at), {
                            addSuffix: true,
                          })}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground font-mono">
                          {getResultPreview(command.result)}
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow className="bg-muted/30">
                          <TableCell colSpan={8} className="p-4">
                            <div className="grid gap-4 sm:grid-cols-2">
                              <div>
                                <p className="mb-1 text-sm font-medium">Payload</p>
                                <pre className="overflow-auto rounded-md bg-muted p-3 text-xs font-mono">
                                  {JSON.stringify(command.payload, null, 2)}
                                </pre>
                              </div>
                              <div>
                                <p className="mb-1 text-sm font-medium">Result</p>
                                <pre className="overflow-auto rounded-md bg-muted p-3 text-xs font-mono">
                                  {command.result
                                    ? JSON.stringify(command.result, null, 2)
                                    : 'No result yet'}
                                </pre>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {(safePage - 1) * perPage + 1}-{Math.min(safePage * perPage, filteredCommands.length)} of{' '}
              {filteredCommands.length} commands
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
