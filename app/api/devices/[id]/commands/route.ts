import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

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

  // Fetch pending and queued commands for this device
  const { data: commands, error: commandsError } = await supabase
    .from('commands')
    .select('id, command_type, payload, status')
    .eq('device_id', id)
    .in('status', ['pending', 'queued'])
    .order('created_at', { ascending: true });

  if (commandsError) {
    return NextResponse.json(
      { error: 'Failed to fetch commands', details: commandsError.message },
      { status: 500 }
    );
  }

  if (!commands || commands.length === 0) {
    return NextResponse.json({ commands: [] });
  }

  // Update fetched commands to 'sent' status
  const commandIds = commands.map((cmd) => cmd.id);

  const { error: updateError } = await supabase
    .from('commands')
    .update({
      status: 'sent',
      updated_at: new Date().toISOString(),
    })
    .in('id', commandIds);

  if (updateError) {
    console.error('Failed to update command statuses to sent:', updateError.message);
    // Still return the commands even if status update fails
  }

  // Format response
  const formattedCommands = commands.map((cmd) => ({
    id: cmd.id,
    command_type: cmd.command_type,
    payload: cmd.payload,
  }));

  return NextResponse.json({ commands: formattedCommands });
}
