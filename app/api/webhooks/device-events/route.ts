import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface DeviceEventBody {
  device_id: string;
  event_type: string;
  payload: Record<string, unknown>;
}

// Event types that affect device status
const STATUS_EVENTS: Record<string, boolean> = {
  'device.online': true,
  'device.offline': false,
  'device.awake': true,
  'device.sleep': false,
};

export async function POST(request: NextRequest) {
  let body: DeviceEventBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON in request body' },
      { status: 400 }
    );
  }

  const { device_id, event_type, payload } = body;

  // Validate required fields
  if (!device_id || !event_type) {
    return NextResponse.json(
      { error: 'Missing required fields: device_id, event_type' },
      { status: 400 }
    );
  }

  if (typeof event_type !== 'string') {
    return NextResponse.json(
      { error: 'event_type must be a string' },
      { status: 400 }
    );
  }

  if (payload && typeof payload !== 'object') {
    return NextResponse.json(
      { error: 'payload must be an object' },
      { status: 400 }
    );
  }

  // Verify device exists
  const { data: device, error: deviceError } = await supabase
    .from('devices')
    .select('id, organization_id, device_name')
    .eq('id', device_id)
    .single();

  if (deviceError || !device) {
    return NextResponse.json(
      { error: 'Device not found' },
      { status: 404 }
    );
  }

  // Log the event to audit_logs
  const { error: auditError } = await supabase.from('audit_logs').insert({
    organization_id: device.organization_id,
    actor_id: null,
    action: `device_event.${event_type}`,
    resource_type: 'device',
    resource_id: device_id,
    details: {
      event_type,
      device_name: device.device_name,
      payload: payload ?? {},
    },
  });

  if (auditError) {
    console.error('Failed to log device event to audit_logs:', auditError.message);
  }

  // Update device status if this is a known status event
  if (event_type in STATUS_EVENTS) {
    const isOnline = STATUS_EVENTS[event_type];

    const { error: updateError } = await supabase
      .from('devices')
      .update({
        is_online: isOnline,
        last_active_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', device_id);

    if (updateError) {
      console.error('Failed to update device status:', updateError.message);
    }
  }

  // Handle specific event types that require additional device updates
  if (event_type === 'device.enrollment_confirmed') {
    const { error: updateError } = await supabase
      .from('devices')
      .update({
        is_online: true,
        last_active_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', device_id);

    if (updateError) {
      console.error('Failed to update device on enrollment confirmation:', updateError.message);
    }
  }

  if (event_type === 'device.unenrolled') {
    const { error: updateError } = await supabase
      .from('devices')
      .update({
        is_online: false,
        last_active_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', device_id);

    if (updateError) {
      console.error('Failed to update device on unenrollment:', updateError.message);
    }
  }

  return NextResponse.json({
    message: 'Device event processed successfully',
    device_id,
    event_type,
  });
}
