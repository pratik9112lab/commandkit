'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import type { Device, Profile } from '@/lib/supabase';
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
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Monitor, Cpu, HardDrive, Battery, Shield, Wifi, WifiOff, MoveHorizontal as MoreHorizontal, ArrowUpDown, ChevronLeft, ChevronRight, Lock, RotateCcw } from 'lucide-react';

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

function getCpuTypeLabel(cpuType: Device['cpu_type']): string {
  if (cpuType === 'apple_silicon') return 'Apple Silicon';
  if (cpuType === 'intel') return 'Intel';
  return 'Unknown';
}

// ---------- Skeletons ----------

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

// ---------- Types ----------

type SortField = 'device_name' | 'last_active_at' | 'enrollment_date';
type SortDirection = 'asc' | 'desc';

interface DeviceWithUser extends Device {
  assigned_user?: Profile | null;
}

// ---------- Main Page ----------

export default function DevicesPage() {
  const router = useRouter();
  const { organization, loading: authLoading } = useAuth();

  const [devices, setDevices] = useState<DeviceWithUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [complianceFilter, setComplianceFilter] = useState<string>('all');
  const [onlineFilter, setOnlineFilter] = useState<string>('all');
  const [cpuFilter, setCpuFilter] = useState<string>('all');

  // Sort
  const [sortField, setSortField] = useState<SortField>('device_name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Pagination
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ---------- Fetch ----------

  useEffect(() => {
    if (!organization?.id) return;

    const fetchDevices = async () => {
      setLoading(true);
      const orgId = organization.id;

      const { data } = await supabase
        .from('devices')
        .select('*')
        .eq('organization_id', orgId);

      if (data) {
        const deviceList = data as Device[];

        // Fetch assigned user profiles in a batch
        const userIds = deviceList
          .map((d) => d.assigned_user_id)
          .filter((id): id is string => id !== null);

        let userMap: Record<string, Profile> = {};
        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('*')
            .in('id', userIds);

          if (profiles) {
            profiles.forEach((p) => {
              userMap[p.id] = p as Profile;
            });
          }
        }

        const enriched: DeviceWithUser[] = deviceList.map((d) => ({
          ...d,
          assigned_user: d.assigned_user_id ? userMap[d.assigned_user_id] || null : null,
        }));

        setDevices(enriched);
      }
      setLoading(false);
    };

    fetchDevices();
  }, [organization?.id]);

  // ---------- Filtered & sorted ----------

  const filteredDevices = useMemo(() => {
    let result = [...devices];

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (d) =>
          d.device_name.toLowerCase().includes(q) ||
          d.serial_number.toLowerCase().includes(q) ||
          d.hardware_model.toLowerCase().includes(q)
      );
    }

    // Compliance filter
    if (complianceFilter !== 'all') {
      result = result.filter((d) => d.compliance_status === complianceFilter);
    }

    // Online filter
    if (onlineFilter === 'online') {
      result = result.filter((d) => d.is_online);
    } else if (onlineFilter === 'offline') {
      result = result.filter((d) => !d.is_online);
    }

    // CPU filter
    if (cpuFilter !== 'all') {
      result = result.filter((d) => d.cpu_type === cpuFilter);
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'device_name') {
        cmp = a.device_name.localeCompare(b.device_name);
      } else if (sortField === 'last_active_at') {
        cmp =
          new Date(a.last_active_at).getTime() -
          new Date(b.last_active_at).getTime();
      } else if (sortField === 'enrollment_date') {
        cmp =
          new Date(a.enrollment_date).getTime() -
          new Date(b.enrollment_date).getTime();
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [devices, search, complianceFilter, onlineFilter, cpuFilter, sortField, sortDirection]);

  // ---------- Pagination ----------

  const totalPages = Math.max(1, Math.ceil(filteredDevices.length / perPage));
  const safePage = Math.min(page, totalPages);
  const paginatedDevices = filteredDevices.slice(
    (safePage - 1) * perPage,
    safePage * perPage
  );

  // ---------- Selection ----------

  const allOnPageSelected =
    paginatedDevices.length > 0 &&
    paginatedDevices.every((d) => selectedIds.has(d.id));

  const toggleAll = useCallback(() => {
    if (allOnPageSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        paginatedDevices.forEach((d) => next.delete(d.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        paginatedDevices.forEach((d) => next.add(d.id));
        return next;
      });
    }
  }, [allOnPageSelected, paginatedDevices]);

  const toggleRow = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // ---------- Sort toggle ----------

  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortField(field);
        setSortDirection('asc');
      }
    },
    [sortField]
  );

  // ---------- Bulk actions ----------

  const handleBulkLock = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const { error } = await supabase.from('commands').insert(
      ids.map((deviceId) => ({
        organization_id: organization!.id,
        device_id: deviceId,
        issued_by: '',
        command_type: 'lock',
        payload: {},
        status: 'pending',
      }))
    );
    if (!error) {
      setSelectedIds(new Set());
    }
  }, [selectedIds, organization]);

  const handleBulkRestart = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const { error } = await supabase.from('commands').insert(
      ids.map((deviceId) => ({
        organization_id: organization!.id,
        device_id: deviceId,
        issued_by: '',
        command_type: 'restart',
        payload: {},
        status: 'pending',
      }))
    );
    if (!error) {
      setSelectedIds(new Set());
    }
  }, [selectedIds, organization]);

  // ---------- Reset page when filters change ----------

  useEffect(() => {
    setPage(1);
  }, [search, complianceFilter, onlineFilter, cpuFilter, perPage]);

  const isLoading = authLoading || loading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Devices</h1>
        {!isLoading && (
          <Badge variant="secondary" className="font-medium">
            {devices.length}
          </Badge>
        )}
      </div>

      {/* Filters Row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Search */}
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, serial, or model..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Filter dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={complianceFilter} onValueChange={setComplianceFilter}>
            <SelectTrigger className="w-[150px]">
              <Shield className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Compliance" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="compliant">Compliant</SelectItem>
              <SelectItem value="non_compliant">Non-Compliant</SelectItem>
              <SelectItem value="unknown">Unknown</SelectItem>
            </SelectContent>
          </Select>

          <Select value={onlineFilter} onValueChange={setOnlineFilter}>
            <SelectTrigger className="w-[130px]">
              <Wifi className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Online" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="online">Online</SelectItem>
              <SelectItem value="offline">Offline</SelectItem>
            </SelectContent>
          </Select>

          <Select value={cpuFilter} onValueChange={setCpuFilter}>
            <SelectTrigger className="w-[150px]">
              <Cpu className="mr-2 h-4 w-4" />
              <SelectValue placeholder="CPU Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="intel">Intel</SelectItem>
              <SelectItem value="apple_silicon">Apple Silicon</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border bg-blue-50 px-4 py-2 dark:bg-blue-950/20">
          <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
            {selectedIds.size} device{selectedIds.size > 1 ? 's' : ''} selected
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleBulkLock}
            className="gap-2"
          >
            <Lock className="h-4 w-4" />
            Lock Devices
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleBulkRestart}
            className="gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            Restart Devices
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedIds(new Set())}
          >
            Clear
          </Button>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <TableSkeleton />
      ) : filteredDevices.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
          <Monitor className="h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-lg font-medium text-muted-foreground">
            No devices found
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {devices.length === 0
              ? 'Enroll devices to see them appear here.'
              : 'Try adjusting your search or filters.'}
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">
                    <Checkbox
                      checked={allOnPageSelected}
                      onCheckedChange={toggleAll}
                      aria-label="Select all on page"
                    />
                  </TableHead>
                  <TableHead>
                    <button
                      className="inline-flex items-center gap-1 hover:underline"
                      onClick={() => handleSort('device_name')}
                    >
                      Device Name
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead>Serial Number</TableHead>
                  <TableHead>macOS Version</TableHead>
                  <TableHead>Hardware Model</TableHead>
                  <TableHead>CPU Type</TableHead>
                  <TableHead>Storage</TableHead>
                  <TableHead>Battery</TableHead>
                  <TableHead>Compliance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>
                    <button
                      className="inline-flex items-center gap-1 hover:underline"
                      onClick={() => handleSort('last_active_at')}
                    >
                      Last Active
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button
                      className="inline-flex items-center gap-1 hover:underline"
                      onClick={() => handleSort('enrollment_date')}
                    >
                      Enrolled
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead>Assigned User</TableHead>
                  <TableHead className="w-[40px]">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedDevices.map((device) => {
                  const storagePercent =
                    device.storage_total_gb > 0
                      ? Math.round(
                          (device.storage_used_gb / device.storage_total_gb) * 100
                        )
                      : 0;

                  return (
                    <TableRow
                      key={device.id}
                      className="cursor-pointer"
                      data-state={selectedIds.has(device.id) ? 'selected' : undefined}
                      onClick={() =>
                        router.push(`/dashboard/devices/${device.id}`)
                      }
                    >
                      <TableCell
                        onClick={(e) => e.stopPropagation()}
                        className="pr-0"
                      >
                        <Checkbox
                          checked={selectedIds.has(device.id)}
                          onCheckedChange={() => toggleRow(device.id)}
                          aria-label={`Select ${device.device_name}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Monitor className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{device.device_name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {device.serial_number}
                      </TableCell>
                      <TableCell>{device.macos_version}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {device.hardware_model}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{getCpuTypeLabel(device.cpu_type)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <HardDrive className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <div className="min-w-[80px] flex-1">
                            <Progress value={storagePercent} className="h-2" />
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {device.storage_used_gb}/{device.storage_total_gb} GB
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Battery className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm">{device.battery_health}%</span>
                        </div>
                      </TableCell>
                      <TableCell>{getComplianceBadge(device.compliance_status)}</TableCell>
                      <TableCell>
                        {device.is_online ? (
                          <div className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-green-500" />
                            <span className="text-sm text-green-600 dark:text-green-400">Online</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-gray-400" />
                            <span className="text-sm text-muted-foreground">Offline</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(device.last_active_at), {
                          addSuffix: true,
                        })}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(device.enrollment_date), {
                          addSuffix: true,
                        })}
                      </TableCell>
                      <TableCell className="text-sm">
                        {device.assigned_user?.full_name || (
                          <span className="text-muted-foreground">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell
                        onClick={(e) => e.stopPropagation()}
                        className="pr-0"
                      >
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Actions</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() =>
                                router.push(`/dashboard/devices/${device.id}`)
                              }
                            >
                              <Monitor className="mr-2 h-4 w-4" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                if (organization?.id) {
                                  supabase.from('commands').insert({
                                    organization_id: organization.id,
                                    device_id: device.id,
                                    issued_by: '',
                                    command_type: 'lock',
                                    payload: {},
                                    status: 'pending',
                                  });
                                }
                              }}
                            >
                              <Lock className="mr-2 h-4 w-4" />
                              Lock Device
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                if (organization?.id) {
                                  supabase.from('commands').insert({
                                    organization_id: organization.id,
                                    device_id: device.id,
                                    issued_by: '',
                                    command_type: 'restart',
                                    payload: {},
                                    status: 'pending',
                                  });
                                }
                              }}
                            >
                              <RotateCcw className="mr-2 h-4 w-4" />
                              Restart Device
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
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
                {Math.min(safePage * perPage, filteredDevices.length)} of{' '}
                {filteredDevices.length}
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
