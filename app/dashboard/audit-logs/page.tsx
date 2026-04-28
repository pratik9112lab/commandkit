'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import type { AuditLog, Profile } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, format, subHours, subDays, isAfter } from 'date-fns';

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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  FileText,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Globe,
} from 'lucide-react';

// ---------- Helpers ----------

function getActionBadge(action: string) {
  const colorMap: Record<string, string> = {
    create: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    update: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    delete: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    login: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    logout: 'bg-gray-100 text-gray-800 dark:bg-gray-800/30 dark:text-gray-400',
    enroll: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    command: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    lock: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    unlock: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  };

  const className = colorMap[action.toLowerCase()] || 'bg-gray-100 text-gray-800 dark:bg-gray-800/30 dark:text-gray-400';

  return (
    <Badge variant="secondary" className={cn('font-medium', className)}>
      {action}
    </Badge>
  );
}

function truncateId(id: string | null, length = 8): string {
  if (!id) return '--';
  return id.length > length ? `${id.slice(0, length)}...` : id;
}

// ---------- Skeletons ----------

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-28" />
        </div>
      ))}
    </div>
  );
}

// ---------- Types ----------

type DateRange = '24h' | '7d' | '30d' | 'all';

interface AuditLogWithActor extends AuditLog {
  actor?: Profile | null;
}

// ---------- Main Page ----------

export default function AuditLogsPage() {
  const { organization, loading: authLoading } = useAuth();

  const [logs, setLogs] = useState<AuditLogWithActor[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filters
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [resourceFilter, setResourceFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<DateRange>('7d');

  // Pagination
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  // ---------- Fetch ----------

  useEffect(() => {
    if (!organization?.id) return;

    const fetchLogs = async () => {
      setLoading(true);
      const orgId = organization.id;

      const { data } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });

      if (data) {
        const logList = data as AuditLog[];

        // Fetch actor profiles
        const actorIds = Array.from(new Set(logList.filter((l) => l.actor_id).map((l) => l.actor_id!)));
        let actorMap: Record<string, Profile> = {};
        if (actorIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('*')
            .in('id', actorIds);
          if (profiles) {
            profiles.forEach((p) => {
              actorMap[p.id] = p as Profile;
            });
          }
        }

        const enriched: AuditLogWithActor[] = logList.map((l) => ({
          ...l,
          actor: l.actor_id ? actorMap[l.actor_id] || null : null,
        }));

        setLogs(enriched);
      }
      setLoading(false);
    };

    fetchLogs();
  }, [organization?.id]);

  // ---------- Available action and resource types ----------

  const actionTypes = useMemo(() => {
    const set = new Set(logs.map((l) => l.action));
    return Array.from(set).sort();
  }, [logs]);

  const resourceTypes = useMemo(() => {
    const set = new Set(logs.map((l) => l.resource_type));
    return Array.from(set).sort();
  }, [logs]);

  // ---------- Filtered ----------

  const filteredLogs = useMemo(() => {
    let result = [...logs];

    // Date range filter
    if (dateRange !== 'all') {
      const now = new Date();
      let cutoff: Date;
      if (dateRange === '24h') {
        cutoff = subHours(now, 24);
      } else if (dateRange === '7d') {
        cutoff = subDays(now, 7);
      } else {
        cutoff = subDays(now, 30);
      }
      result = result.filter((l) => isAfter(new Date(l.created_at), cutoff));
    }

    // Action filter
    if (actionFilter !== 'all') {
      result = result.filter((l) => l.action === actionFilter);
    }

    // Resource type filter
    if (resourceFilter !== 'all') {
      result = result.filter((l) => l.resource_type === resourceFilter);
    }

    return result;
  }, [logs, dateRange, actionFilter, resourceFilter]);

  // ---------- Pagination ----------

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / perPage));
  const safePage = Math.min(page, totalPages);
  const paginatedLogs = filteredLogs.slice(
    (safePage - 1) * perPage,
    safePage * perPage
  );

  // ---------- Reset page on filter change ----------

  useEffect(() => {
    setPage(1);
  }, [actionFilter, resourceFilter, dateRange, perPage]);

  // ---------- Toggle expand ----------

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const isLoading = authLoading || loading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Audit Logs</h1>
        {!isLoading && (
          <Badge variant="secondary" className="font-medium">
            {logs.length}
          </Badge>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Date range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="24h">Last 24h</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="all">All time</SelectItem>
          </SelectContent>
        </Select>

        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Action" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            {actionTypes.map((action) => (
              <SelectItem key={action} value={action}>
                {action}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={resourceFilter} onValueChange={setResourceFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Resource" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Resources</SelectItem>
            {resourceTypes.map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <TableSkeleton />
      ) : filteredLogs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
          <FileText className="h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-lg font-medium text-muted-foreground">
            No audit logs found
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {logs.length === 0
              ? 'Audit logs will appear as actions are performed.'
              : 'Try adjusting your filters.'}
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]" />
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Resource Type</TableHead>
                  <TableHead>Resource ID</TableHead>
                  <TableHead>IP Address</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedLogs.map((log) => {
                  const isExpanded = expandedId === log.id;
                  return (
                    <React.Fragment key={log.id}>
                      <TableRow
                        className="cursor-pointer"
                        onClick={() => toggleExpand(log.id)}
                      >
                        <TableCell className="w-[40px]">
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {formatDistanceToNow(new Date(log.created_at), {
                            addSuffix: true,
                          })}
                        </TableCell>
                        <TableCell className="text-sm">
                          {log.actor?.email || (
                            <span className="text-muted-foreground">System</span>
                          )}
                        </TableCell>
                        <TableCell>{getActionBadge(log.action)}</TableCell>
                        <TableCell className="text-sm">
                          {log.resource_type}
                        </TableCell>
                        <TableCell className="text-sm font-mono text-muted-foreground">
                          {truncateId(log.resource_id)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {log.ip_address ? (
                            <div className="flex items-center gap-1.5">
                              <Globe className="h-3.5 w-3.5" />
                              <span>{log.ip_address}</span>
                            </div>
                          ) : (
                            '--'
                          )}
                        </TableCell>
                      </TableRow>

                      {/* Expanded details row */}
                      {isExpanded && (
                        <TableRow>
                          <TableCell />
                          <TableCell colSpan={6}>
                            <div className="space-y-3 py-2">
                              <div>
                                <p className="text-sm font-medium text-muted-foreground mb-1">
                                  Full Timestamp
                                </p>
                                <p className="text-sm">
                                  {format(new Date(log.created_at), 'PPpp')}
                                </p>
                              </div>
                              <div>
                                <p className="text-sm font-medium text-muted-foreground mb-1">
                                  Details (JSON)
                                </p>
                                <pre className="max-h-60 overflow-auto rounded-md bg-muted p-3 text-xs">
                                  {JSON.stringify(log.details, null, 2)}
                                </pre>
                              </div>
                              {log.resource_id && (
                                <div>
                                  <p className="text-sm font-medium text-muted-foreground mb-1">
                                    Full Resource ID
                                  </p>
                                  <p className="text-sm font-mono">{log.resource_id}</p>
                                </div>
                              )}
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
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Rows per page</span>
              <Select
                value={String(perPage)}
                onValueChange={(v) => setPerPage(Number(v))}
              >
                <SelectTrigger className="h-8 w-[70px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>
                {(safePage - 1) * perPage + 1}-
                {Math.min(safePage * perPage, filteredLogs.length)} of{' '}
                {filteredLogs.length}
              </span>

              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span className="sr-only">Previous page</span>
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                  <span className="sr-only">Next page</span>
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
