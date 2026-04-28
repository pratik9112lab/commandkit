import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  organization_id: string | null;
  role: 'admin' | 'employee';
  created_at: string;
  updated_at: string;
};

export type Organization = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  max_devices: number;
  created_at: string;
  updated_at: string;
};

export type Device = {
  id: string;
  organization_id: string;
  serial_number: string;
  device_uuid: string;
  device_name: string;
  macos_version: string;
  hardware_model: string;
  cpu_type: 'intel' | 'apple_silicon' | '';
  assigned_user_id: string | null;
  enrollment_token: string;
  enrollment_date: string;
  last_active_at: string;
  is_online: boolean;
  storage_total_gb: number;
  storage_used_gb: number;
  battery_health: number;
  battery_cycle_count: number;
  filevault_enabled: boolean;
  firewall_enabled: boolean;
  password_policy_compliant: boolean;
  compliance_status: 'compliant' | 'non_compliant' | 'unknown';
  created_at: string;
  updated_at: string;
};

export type Command = {
  id: string;
  organization_id: string;
  device_id: string;
  issued_by: string;
  command_type: 'lock' | 'restart' | 'shutdown' | 'run_script' | 'install_app' | 'uninstall_app' | 'collect_logs';
  payload: Record<string, unknown>;
  status: 'pending' | 'queued' | 'sent' | 'executing' | 'completed' | 'failed';
  result: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type Ticket = {
  id: string;
  organization_id: string;
  device_id: string | null;
  created_by: string;
  subject: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AuditLog = {
  id: string;
  organization_id: string;
  actor_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  details: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
};

export type EnrollmentToken = {
  id: string;
  organization_id: string;
  token: string;
  created_by: string;
  expires_at: string;
  used: boolean;
  used_by_device_id: string | null;
  created_at: string;
};

export type InstalledApp = {
  id: string;
  device_id: string;
  app_name: string;
  app_version: string;
  bundle_id: string;
  installed_at: string;
};
