'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import type { Ticket, Device } from '@/lib/supabase';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import { CircleCheck as CheckCircle2, LifeBuoy } from 'lucide-react';

export default function PortalSupportPage() {
  const { user, profile, organization, loading: authLoading } = useAuth();

  // Form state
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Ticket['priority']>('medium');
  const [deviceId, setDeviceId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Device state
  const [assignedDevice, setAssignedDevice] = useState<Device | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);

  // Fetch assigned device and org devices
  useEffect(() => {
    if (!user?.id || !organization?.id) return;

    const fetchData = async () => {
      // Fetch assigned device
      const { data: assignedData } = await supabase
        .from('devices')
        .select('*')
        .eq('assigned_user_id', user.id)
        .maybeSingle();

      if (assignedData) {
        const dev = assignedData as Device;
        setAssignedDevice(dev);
        setDeviceId(dev.id);
        setDevices([dev]);
      }

      // Fetch all org devices for the dropdown
      const { data: orgDevices } = await supabase
        .from('devices')
        .select('id, device_name')
        .eq('organization_id', organization.id)
        .order('device_name');

      if (orgDevices) {
        setDevices(orgDevices as Device[]);
      }
    };

    fetchData();
  }, [user?.id, organization?.id]);

  const handleSubmit = useCallback(async () => {
    if (!organization?.id || !profile?.id || !subject.trim()) return;

    setSubmitting(true);
    const { error } = await supabase.from('tickets').insert({
      organization_id: organization.id,
      created_by: profile.id,
      subject: subject.trim(),
      description: description.trim(),
      device_id: deviceId || null,
      priority,
      status: 'open',
    });

    if (!error) {
      setSubmitted(true);
      setSubject('');
      setDescription('');
      setPriority('medium');
      if (assignedDevice) {
        setDeviceId(assignedDevice.id);
      } else {
        setDeviceId('');
      }
    }
    setSubmitting(false);
  }, [organization?.id, profile?.id, subject, description, deviceId, priority, assignedDevice]);

  if (submitted) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="flex flex-col items-center justify-center rounded-lg border py-16">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-lg font-semibold">Support Request Submitted</h2>
          <p className="mt-1 text-sm text-muted-foreground text-center max-w-sm">
            Your support request has been submitted successfully. Our team will
            review it and get back to you.
          </p>
          <Button
            variant="outline"
            className="mt-6"
            onClick={() => setSubmitted(false)}
          >
            Submit Another Request
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Request Support</h1>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
              <LifeBuoy className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg">New Support Request</CardTitle>
              <CardDescription>
                Describe your issue and we will help you resolve it.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="support-subject">Subject *</Label>
              <Input
                id="support-subject"
                placeholder="Brief description of the issue"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="support-description">Description</Label>
              <Textarea
                id="support-description"
                placeholder="Provide details about the issue, including any error messages or steps to reproduce..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="support-device">Device</Label>
              <Select value={deviceId} onValueChange={setDeviceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a device" />
                </SelectTrigger>
                <SelectContent>
                  {devices.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.device_name}
                      {d.id === assignedDevice?.id ? ' (My Device)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="support-priority">Priority</Label>
              <Select
                value={priority}
                onValueChange={(v) => setPriority(v as Ticket['priority'])}
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

            <Button
              className="w-full"
              onClick={handleSubmit}
              disabled={submitting || !subject.trim()}
            >
              {submitting ? 'Submitting...' : 'Submit Request'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
