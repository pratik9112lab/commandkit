'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import type { Ticket } from '@/lib/supabase';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Ticket as TicketIcon,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

// ---------- Helpers ----------

function getPriorityBadge(priority: Ticket['priority']) {
  const map: Record<string, { label: string; className: string }> = {
    low: {
      label: 'Low',
      className: 'bg-gray-100 text-gray-800 dark:bg-gray-800/30 dark:text-gray-400',
    },
    medium: {
      label: 'Medium',
      className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    },
    high: {
      label: 'High',
      className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    },
    critical: {
      label: 'Critical',
      className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    },
  };
  const entry = map[priority] || { label: priority, className: '' };
  return (
    <Badge variant="secondary" className={cn('font-medium', entry.className)}>
      {entry.label}
    </Badge>
  );
}

function getStatusBadge(status: Ticket['status']) {
  const map: Record<string, { label: string; className: string }> = {
    open: {
      label: 'Open',
      className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    },
    in_progress: {
      label: 'In Progress',
      className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    },
    resolved: {
      label: 'Resolved',
      className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    },
    closed: {
      label: 'Closed',
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

// ---------- Skeletons ----------

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

// ---------- Main Page ----------

export default function PortalTicketsPage() {
  const { user, loading: authLoading } = useAuth();

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filter
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Pagination
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  // ---------- Fetch ----------

  useEffect(() => {
    if (!user?.id) return;

    const fetchTickets = async () => {
      setLoading(true);

      const { data } = await supabase
        .from('tickets')
        .select('*')
        .eq('created_by', user.id)
        .order('updated_at', { ascending: false });

      if (data) {
        setTickets(data as Ticket[]);
      }
      setLoading(false);
    };

    fetchTickets();
  }, [user?.id]);

  // ---------- Filtered ----------

  const filteredTickets = useMemo(() => {
    let result = [...tickets];

    if (statusFilter !== 'all') {
      result = result.filter((t) => t.status === statusFilter);
    }

    return result;
  }, [tickets, statusFilter]);

  // ---------- Pagination ----------

  const totalPages = Math.max(1, Math.ceil(filteredTickets.length / perPage));
  const safePage = Math.min(page, totalPages);
  const paginatedTickets = filteredTickets.slice(
    (safePage - 1) * perPage,
    safePage * perPage
  );

  // ---------- Reset page on filter change ----------

  useEffect(() => {
    setPage(1);
  }, [statusFilter, perPage]);

  // ---------- Toggle expand ----------

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const isLoading = authLoading || loading;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">My Tickets</h1>
          {!isLoading && (
            <Badge variant="secondary" className="font-medium">
              {tickets.length}
            </Badge>
          )}
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <TableSkeleton />
      ) : filteredTickets.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
          <TicketIcon className="h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-lg font-medium text-muted-foreground">
            No tickets found
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {tickets.length === 0
              ? 'You have not submitted any support tickets yet.'
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
                  <TableHead>Subject</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedTickets.map((ticket) => {
                  const isExpanded = expandedId === ticket.id;
                  return (
                    <React.Fragment key={ticket.id}>
                      <TableRow
                        className="cursor-pointer"
                        onClick={() => toggleExpand(ticket.id)}
                      >
                        <TableCell className="w-[40px]">
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          {ticket.subject}
                        </TableCell>
                        <TableCell>{getPriorityBadge(ticket.priority)}</TableCell>
                        <TableCell>{getStatusBadge(ticket.status)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(ticket.created_at), {
                            addSuffix: true,
                          })}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(ticket.updated_at), {
                            addSuffix: true,
                          })}
                        </TableCell>
                      </TableRow>

                      {/* Expanded description row */}
                      {isExpanded && (
                        <TableRow>
                          <TableCell />
                          <TableCell colSpan={5}>
                            <div className="py-2">
                              <p className="text-sm font-medium text-muted-foreground mb-1">
                                Description
                              </p>
                              <p className="text-sm whitespace-pre-wrap">
                                {ticket.description || 'No description provided.'}
                              </p>
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
                {Math.min(safePage * perPage, filteredTickets.length)} of{' '}
                {filteredTickets.length}
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
