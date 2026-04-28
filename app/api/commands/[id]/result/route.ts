import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface CommandResultBody {
  status: 'completed' | 'failed';
  result: {
    stdout?: string;
    stderr?: string;
    exit_code?: number;
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  let body: CommandResultBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON in request body' },
      { status: 400 }
    );
  }

  const { status, result } = body;

  // Validate status
  if (!status || !['completed', 'failed'].includes(status)) {
    return NextResponse.json(
      { error: 'Invalid status. Must be "completed" or "failed"' },
      { status: 400 }
    );
  }

  // Validate result object
  if (!result || typeof result !== 'object') {
    return NextResponse.json(
      { error: 'Missing or invalid result object. Expected { stdout?, stderr?, exit_code? }' },
      { status: 400 }
    );
  }

  // Verify command exists
  const { data: command, error: commandError } = await supabase
    .from('commands')
    .select('id, device_id, organization_id, status, command_type')
    .eq('id', id)
    .single();

  if (commandError || !command) {
    return NextResponse.json(
      { error: 'Command not found' },
      { status: 404 }
    );
  }

  // Only allow updating commands that are in 'sent' or 'executing' status
  if (!['sent', 'executing'].includes(command.status)) {
    return NextResponse.json(
      { error: `Cannot update command result. Command status is "${command.status}", expected "sent" or "executing"` },
      { status: 409 }
    );
  }

  // Update command record with result
  const { error: updateError } = await supabase
    .from('commands')
    .update({
      status,
      result: {
        stdout: result.stdout ?? null,
        stderr: result.stderr ?? null,
        exit_code: result.exit_code ?? null,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (updateError) {
    return NextResponse.json(
      { error: 'Failed to update command result', details: updateError.message },
      { status: 500 }
    );
  }

  // Log command result to audit
  await supabase.from('audit_logs').insert({
    organization_id: command.organization_id,
    actor_id: null,
    action: `command.${status}`,
    resource_type: 'command',
    resource_id: id,
    details: {
      command_type: command.command_type,
      device_id: command.device_id,
      exit_code: result.exit_code ?? null,
      has_stderr: !!(result.stderr),
    },
  });

  return NextResponse.json({
    message: 'Command result recorded successfully',
    command_id: id,
    status,
  });
}
