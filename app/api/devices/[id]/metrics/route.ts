import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface InstalledApp {
  app_name: string;
  app_version: string;
  bundle_id: string;
}

interface MetricsBody {
  storage_total_gb: number;
  storage_used_gb: number;
  battery_health: number;
  battery_cycle_count: number;
  filevault_enabled: boolean;
  firewall_enabled: boolean;
  password_policy_compliant: boolean;
  macos_version: string;
  device_name: string;
  is_online: boolean;
  installed_apps?: InstalledApp[];
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  let body: MetricsBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON in request body' },
      { status: 400 }
    );
  }

  const {
    storage_total_gb,
    storage_used_gb,
    battery_health,
    battery_cycle_count,
    filevault_enabled,
    firewall_enabled,
    password_policy_compliant,
    macos_version,
    device_name,
    is_online,
    installed_apps,
  } = body;

  // Validate required fields
  if (
    storage_total_gb === undefined ||
    storage_used_gb === undefined ||
    battery_health === undefined ||
    battery_cycle_count === undefined ||
    filevault_enabled === undefined ||
    firewall_enabled === undefined ||
    password_policy_compliant === undefined ||
    macos_version === undefined ||
    device_name === undefined ||
    is_online === undefined
  ) {
    return NextResponse.json(
      { error: 'Missing required fields. Required: storage_total_gb, storage_used_gb, battery_health, battery_cycle_count, filevault_enabled, firewall_enabled, password_policy_compliant, macos_version, device_name, is_online' },
      { status: 400 }
    );
  }

  // Verify device exists
  const { data: device, error: deviceError } = await supabase
    .from('devices')
    .select('id, organization_id')
    .eq('id', id)
    .single();

  if (deviceError || !device) {
    return NextResponse.json(
      { error: 'Device not found' },
      { status: 404 }
    );
  }

  // Calculate compliance status
  const compliance_status: 'compliant' | 'non_compliant' =
    filevault_enabled && firewall_enabled && password_policy_compliant
      ? 'compliant'
      : 'non_compliant';

  // Update device record
  const { error: updateError } = await supabase
    .from('devices')
    .update({
      storage_total_gb,
      storage_used_gb,
      battery_health,
      battery_cycle_count,
      filevault_enabled,
      firewall_enabled,
      password_policy_compliant,
      macos_version,
      device_name,
      is_online,
      compliance_status,
      last_active_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (updateError) {
    return NextResponse.json(
      { error: 'Failed to update device metrics', details: updateError.message },
      { status: 500 }
    );
  }

  // Handle installed apps if provided
  if (installed_apps !== undefined) {
    // Validate installed apps structure
    if (Array.isArray(installed_apps)) {
      for (const app of installed_apps) {
        if (!app.app_name || !app.bundle_id) {
          return NextResponse.json(
            { error: 'Each installed app must have app_name and bundle_id' },
            { status: 400 }
          );
        }
      }

      // Delete existing installed apps for this device
      const { error: deleteError } = await supabase
        .from('installed_apps')
        .delete()
        .eq('device_id', id);

      if (deleteError) {
        console.error('Failed to delete existing installed apps:', deleteError.message);
      }

      // Insert new installed apps
      if (installed_apps.length > 0) {
        const appsToInsert = installed_apps.map((app) => ({
          device_id: id,
          app_name: app.app_name,
          app_version: app.app_version || '',
          bundle_id: app.bundle_id,
          installed_at: new Date().toISOString(),
        }));

        const { error: insertError } = await supabase
          .from('installed_apps')
          .insert(appsToInsert);

        if (insertError) {
          console.error('Failed to insert installed apps:', insertError.message);
        }
      }
    }
  }

  // Log metrics update to audit
  await supabase.from('audit_logs').insert({
    organization_id: device.organization_id,
    actor_id: null,
    action: 'device.metrics_updated',
    resource_type: 'device',
    resource_id: id,
    details: {
      compliance_status,
      filevault_enabled,
      firewall_enabled,
      password_policy_compliant,
      macos_version,
      apps_count: Array.isArray(installed_apps) ? installed_apps.length : null,
    },
  });

  return NextResponse.json({
    message: 'Device metrics updated successfully',
    compliance_status,
  });
}
