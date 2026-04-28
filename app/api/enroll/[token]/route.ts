import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  const { token } = params;

  const { data: enrollmentToken, error } = await supabase
    .from('enrollment_tokens')
    .select('id, organization_id, token, expires_at, used, created_by')
    .eq('token', token)
    .single();

  if (error || !enrollmentToken) {
    return NextResponse.json(
      { error: 'Enrollment token not found' },
      { status: 404 }
    );
  }

  if (enrollmentToken.used) {
    return NextResponse.json(
      { error: 'Enrollment token has already been used' },
      { status: 410 }
    );
  }

  if (new Date(enrollmentToken.expires_at) < new Date()) {
    return NextResponse.json(
      { error: 'Enrollment token has expired' },
      { status: 410 }
    );
  }

  const { data: organization } = await supabase
    .from('organizations')
    .select('id, name, slug')
    .eq('id', enrollmentToken.organization_id)
    .single();

  return NextResponse.json({
    enrollment_profile: {
      token: enrollmentToken.token,
      organization: organization
        ? { id: organization.id, name: organization.name, slug: organization.slug }
        : null,
      expires_at: enrollmentToken.expires_at,
      mdm_server_url: `${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/v1$/, '')}/api/enroll/${token}`,
    },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  const { token } = params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON in request body' },
      { status: 400 }
    );
  }

  const {
    serial_number,
    device_uuid,
    device_name,
    macos_version,
    hardware_model,
    cpu_type,
  } = body;

  if (!serial_number || !device_uuid || !device_name || !macos_version || !hardware_model || !cpu_type) {
    return NextResponse.json(
      { error: 'Missing required fields: serial_number, device_uuid, device_name, macos_version, hardware_model, cpu_type' },
      { status: 400 }
    );
  }

  const validCpuTypes = ['intel', 'apple_silicon', ''];
  if (!validCpuTypes.includes(cpu_type as string)) {
    return NextResponse.json(
      { error: 'Invalid cpu_type. Must be one of: intel, apple_silicon' },
      { status: 400 }
    );
  }

  // Validate enrollment token
  const { data: enrollmentToken, error: tokenError } = await supabase
    .from('enrollment_tokens')
    .select('id, organization_id, token, expires_at, used')
    .eq('token', token)
    .single();

  if (tokenError || !enrollmentToken) {
    return NextResponse.json(
      { error: 'Enrollment token not found' },
      { status: 404 }
    );
  }

  if (enrollmentToken.used) {
    return NextResponse.json(
      { error: 'Enrollment token has already been used' },
      { status: 410 }
    );
  }

  if (new Date(enrollmentToken.expires_at) < new Date()) {
    return NextResponse.json(
      { error: 'Enrollment token has expired' },
      { status: 410 }
    );
  }

  // Check for duplicate serial_number within the organization
  const { data: existingDevice } = await supabase
    .from('devices')
    .select('id')
    .eq('serial_number', serial_number as string)
    .eq('organization_id', enrollmentToken.organization_id)
    .maybeSingle();

  if (existingDevice) {
    return NextResponse.json(
      { error: 'A device with this serial number is already enrolled in this organization' },
      { status: 409 }
    );
  }

  // Check for duplicate device_uuid
  const { data: existingUuid } = await supabase
    .from('devices')
    .select('id')
    .eq('device_uuid', device_uuid as string)
    .maybeSingle();

  if (existingUuid) {
    return NextResponse.json(
      { error: 'A device with this UUID is already enrolled' },
      { status: 409 }
    );
  }

  // Create device record
  const { data: device, error: deviceError } = await supabase
    .from('devices')
    .insert({
      organization_id: enrollmentToken.organization_id,
      serial_number: serial_number as string,
      device_uuid: device_uuid as string,
      device_name: device_name as string,
      macos_version: macos_version as string,
      hardware_model: hardware_model as string,
      cpu_type: cpu_type as string,
      enrollment_token: token,
      enrollment_date: new Date().toISOString(),
      last_active_at: new Date().toISOString(),
      is_online: true,
      compliance_status: 'unknown',
    })
    .select()
    .single();

  if (deviceError || !device) {
    return NextResponse.json(
      { error: 'Failed to create device record', details: deviceError?.message },
      { status: 500 }
    );
  }

  // Mark enrollment token as used
  const { error: updateTokenError } = await supabase
    .from('enrollment_tokens')
    .update({
      used: true,
      used_by_device_id: device.id,
    })
    .eq('id', enrollmentToken.id);

  if (updateTokenError) {
    // Device was created but token update failed - log but don't fail the request
    console.error('Failed to mark enrollment token as used:', updateTokenError.message);
  }

  // Log enrollment to audit_logs
  await supabase.from('audit_logs').insert({
    organization_id: enrollmentToken.organization_id,
    actor_id: null,
    action: 'device.enrolled',
    resource_type: 'device',
    resource_id: device.id,
    details: {
      device_name: device.device_name,
      serial_number: device.serial_number,
      hardware_model: device.hardware_model,
      enrollment_token: token,
    },
  });

  return NextResponse.json(
    {
      device: {
        id: device.id,
        serial_number: device.serial_number,
        device_uuid: device.device_uuid,
        device_name: device.device_name,
        macos_version: device.macos_version,
        hardware_model: device.hardware_model,
        cpu_type: device.cpu_type,
        enrollment_date: device.enrollment_date,
        compliance_status: device.compliance_status,
      },
    },
    { status: 201 }
  );
}
