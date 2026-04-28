'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import type { Ticket, Device, Profile } from '@/lib/supabase';
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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import {
  Ticket as TicketIcon,
  Plus,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Monitor,
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
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

// ---------- Types ----------

interface TicketWithDetails extends Ticket {
  device?: Device | null;
  creator?: Profile | null;
}

// ---------- Main Page ----------

export default function TicketsPage() {
  const { organization, profile, loading: authLoading } = useAuth();

  const [tickets, setTickets] = useState<TicketWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');

  // Pagination
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  // New ticket dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newDeviceId, setNewDeviceId] = useState<string>('');
  const [newPriority, setNewPriority] = useState<Ticket['priority']>('medium');
  const [submitting, setSubmitting] = useState(false);

  // Devices list for dropdown
  const [devices, setDevices] = useState<Device[]>([]);

  // ---------- Fetch ----------

  useEffect(() => {
    if (!organization?.id) return;

    const fetchTickets = async () => {
      setLoading(true);
      const orgId = organization.id;

      const { data: ticketData } = await supabase
        .from('tickets')
        .select('*')
        .eq('organization_id', orgId)
        .order('updated_at', { ascending: false });

      if (ticketData) {
        const ticketList = ticketData as Ticket[];

        // Fetch creator profiles
        const creatorIds = Array.from(new Set(ticketList.map((t) => t.created_by)));
        let creatorMap: Record<string, Profile> = {};
        if (creatorIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('*')
            .in('id', creatorIds);
          if (profiles) {
            profiles.forEach((p) => {
              creatorMap[p.id] = p as Profile;
            });
          }
        }

        // Fetch device info
        const deviceIds = Array.from(new Set(ticketList.filter((t) => t.device_id).map((t) => t.device_id!)));
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

        const enriched: TicketWithDetails[] = ticketList.map((t) => ({
          ...t,
          device: t.device_id ? deviceMap[t.device_id] || null : null,
          creator: creatorMap[t.created_by] || null,
        }));

        setTickets(enriched);
      }
      setLoading(false);
    };

    const fetchDevices = async () => {
      const orgId = organization.id;
      const { data } = await supabase
        .from('devices')
        .select('id, device_name')
        .eq('organization_id', orgId)
        .order('device_name');
      if (data) {
        setDevices(data as Device[]);
      }
    };

    fetchTickets();
    fetchDevices();
  }, [organization?.id]);

  // ---------- Filtered ----------

  const filteredTickets = useMemo(() => {
    let result = [...tickets];

    if (statusFilter !== 'all') {
      result = result.filter((t) => t.status === statusFilter);
    }

    if (priorityFilter !== 'all') {
      result = result.filter((t) => t.priority === priorityFilter);
    }

    return result;
  }, [tickets, statusFilter, priorityFilter]);

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
  }, [statusFilter, priorityFilter, perPage]);

  // ---------- Toggle expand ----------

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  // ---------- Update ticket status ----------

  const handleStatusChange = useCallback(
    async (ticketId: string, newStatus: Ticket['status']) => {
      const { error } = await supabase
        .from('tickets')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', ticketId);

      if (!error) {
        setTickets((prev) =>
          prev.map((t) =>
            t.id === ticketId
              ? { ...t, status: newStatus, updated_at: new Date().toISOString() }
              : t
          )
        );
      }
    },
    []
  );

  // ---------- Create ticket ----------

  const handleCreateTicket = useCallback(async () => {
    if (!organization?.id || !profile?.id || !newSubject.trim()) return;

    setSubmitting(true);
    const { data, error } = await supabase
      .from('tickets')
      .insert({
        organization_id: organization.id,
        created_by: profile.id,
        subject: newSubject.trim(),
        description: newDescription.trim(),
        device_id: newDeviceId || null,
        priority: newPriority,
        status: 'open',
      })
      .select()
      .single();

    if (!error && data) {
      const newTicket = data as Ticket;
      // Fetch creator profile for the new ticket
      const { data: creatorProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', profile.id)
        .maybeSingle();

      // Fetch device info if assigned
      let deviceInfo: Device | null = null;
      if (newTicket.device_id) {
        const { data: deviceData } = await supabase
          .from('devices')
          .select('*')
          .eq('id', newTicket.device_id)
          .maybeSingle();
        if (deviceData) deviceInfo = deviceData as Device;
      }

      const enriched: TicketWithDetails = {
        ...newTicket,
        device: deviceInfo,
        creator: (creatorProfile as Profile) || null,
      };

      setTickets((prev) => [enriched, ...prev]);
      setNewSubject('');
      setNewDescription('');
      setNewDeviceId('');
      setNewPriority('medium');
      setDialogOpen(false);
    }
    setSubmitting(false);
  }, [organization?.id, profile?.id, newSubject, newDescription, newDeviceId, newPriority]);

  const isLoading = authLoading || loading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Support Tickets</h1>
          {!isLoading && (
            <Badge variant="secondary" className="font-medium">
              {tickets.length}
            </Badge>
          )}
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New Ticket
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Ticket</DialogTitle>
              <DialogDescription>
                Submit a support request. Fields marked with * are required.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="ticket-subject">Subject *</Label>
                <Input
                  id="ticket-subject"
                  placeholder="Brief description of the issue"
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ticket-description">Description</Label>
                <Textarea
                  id="ticket-description"
                  placeholder="Provide details about the issue..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ticket-device">Device (optional)</Label>
                <Select value={newDeviceId} onValueChange={setNewDeviceId}>
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
                <Label htmlFor="ticket-priority">Priority</Label>
                <Select
                  value={newPriority}
                  onValueChange={(v) => setNewPriority(v as Ticket['priority'])}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateTicket}
                disabled={submitting || !newSubject.trim()}
              >
                {submitting ? 'Creating...' : 'Create Ticket'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
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

        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
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
              ? 'Create a ticket to get started.'
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
                  <TableHead>Device</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created By</TableHead>
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
                        <TableCell>
                          {ticket.device ? (
                            <div className="flex items-center gap-1.5">
                              <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
                              <span>{ticket.device.device_name}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">--</span>
                          )}
                        </TableCell>
                        <TableCell>{getPriorityBadge(ticket.priority)}</TableCell>
                        <TableCell>
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="inline-block"
                          >
                            {profile?.role === 'admin' ? (
                              <Select
                                value={ticket.status}
                                onValueChange={(v) =>
                                  handleStatusChange(ticket.id, v as Ticket['status'])
                                }
                              >
                                <SelectTrigger className="h-7 w-auto border-0 p-0 gap-1 hover:bg-transparent">
                                  {getStatusBadge(ticket.status)}
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="open">Open</SelectItem>
                                  <SelectItem value="in_progress">In Progress</SelectItem>
                                  <SelectItem value="resolved">Resolved</SelectItem>
                                  <SelectItem value="closed">Closed</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              getStatusBadge(ticket.status)
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {ticket.creator?.full_name || (
                            <span className="text-muted-foreground">Unknown</span>
                          )}
                        </TableCell>
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
                          <TableCell colSpan={7}>
                            <div className="space-y-3 py-2">
                              <div>
                                <p className="text-sm font-medium text-muted-foreground mb-1">
                                  Description
                                </p>
                                <p className="text-sm whitespace-pre-wrap">
                                  {ticket.description || 'No description provided.'}
                                </p>
                              </div>
                              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                <span>
                                  Created: {format(new Date(ticket.created_at), 'PPpp')}
                                </span>
                                <span>
                                  Updated: {format(new Date(ticket.updated_at), 'PPpp')}
                                </span>
                                {ticket.resolved_at && (
                                  <span>
                                    Resolved: {format(new Date(ticket.resolved_at), 'PPpp')}
                                  </span>
                                )}
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
