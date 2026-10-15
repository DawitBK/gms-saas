export interface OperationsDashboard {
  generated_at: string;
  summary: {
    total_guests: number;
    vip_guests: number;
    active_guests: number;
    pending_approvals: number;
    entries_today: number;
    active_credentials: number;
    declined_total: number;
    expired_total: number;
    total_visits: number;
    frequent_guests: number;
    active_visitors: number;
  };
  alerts: Array<{
    key: string;
    severity: 'info' | 'warning' | 'critical';
    label: string;
    count: number;
    description: string;
  }>;
  activity: Array<{
    id: string;
    title: string;
    detail: string;
    occurred_at: string;
    tone: 'neutral' | 'success' | 'warning' | 'critical';
  }>;
  queue: Array<{
    id: number;
    reference_number: string | null;
    guest_name: string;
    guest_email: string;
    company: string | null;
    status: string;
    service_name: string | null;
    department_name: string | null;
    guest_id?: number;
    assigned_host_id?: number;
    assigned_host_name: string | null;
    assigned_host_email: string | null;
    escalated_to_reception: boolean;
    escalation_reason: string | null;
    escalated_by_name: string | null;
    escalated_at: string | null;
    approval_status: string | null;
    credential_status: string | null;
    credential_provider: string | null;
    credential_qr_code: string | null;
    credential_pin_code: string | null;
    scheduled_start: string;
    scheduled_end: string;
    has_conflict: boolean;
    assignment_history?: Array<{
      id: number;
      host_name: string | null;
      assigned_by_name: string | null;
      assigned_at: string;
      reason: string | null;
      is_current: boolean;
    }>;
  }>;
  status_distribution: Array<{
    status: string;
    count: number;
    percent: number;
  }>;
  daily_trend: Array<{
    day: string;
    count: number;
  }>;
}

export interface OperationsReport {
  metrics: {
    total_visits: number;
    approval_rate: number;
    cancellation_rate: number;
    declined_rate: number;
  };
  status_distribution: Array<{
    status: string;
    count: number;
    percent: number;
  }>;
  daily_trend: Array<{
    day: string;
    count: number;
  }>;
  department_performance: Array<{
    department: string;
    total: number;
    completed: number;
    processed: number;
    completed_rate: number;
    processed_rate: number;
  }>;
  hourly_trend: Array<{
    hour: string;
    count: number;
  }>;
  service_distribution: Array<{
    service: string;
    count: number;
    percent: number;
  }>;
  visits: any[];
  organization_insights?: Array<{ company: string; count: number; percent: number }>;
  purpose_insights?: Array<{ purpose: string; count: number; percent: number }>;
  rating_insights?: {
    average_rating: number;
    total_reviews: number;
    recent_feedback: Array<{
      guest_id: number;
      host_name: string;
      rating: number;
      comment: string;
      created_at: string;
    }>;
  };
  punctuality_insights?: {
    on_time_percentage: number;
    avg_delay_minutes: number;
  };
  guest_type_insights?: Array<{ type: string; count: number; percent: number }>;
}

export interface OperationsIntegrationHealth {
  generated_at: string;
  providers: {
    redis: { configured: boolean; queue_count: number };
    email: { configured: boolean; provider: string };
    sms: { configured: boolean; provider: string };
    unifi_access: { configured: boolean; has_webhook_secret: boolean };
  };
  failures: {
    outbox: number;
    webhook_events: number;
    credentials: number;
    approved_with_failed_credentials: number;
    unifi_reconciliation_pending: number;
  };
  queues: Array<{
    queue: string;
    waiting: number;
    active: number;
    failed: number;
    delayed: number;
  }>;
  failed_outbox: Array<{
    id: number;
    channel: string;
    status: string;
    aggregate_type: string | null;
    aggregate_id: string | null;
    event_type: string | null;
    queue_name: string | null;
    job_name: string | null;
    attempt_count: number;
    max_attempts: number;
    available_at: string;
    error_message: string | null;
    updated_at: string;
  }>;
  unifi_reconciliation_pending: Array<{
    id: number;
    visit_id: number;
    provisioned_at: string | null;
    fallback_reason: string | null;
    updated_at: string;
  }>;
  failed_webhooks: Array<{
    id: number;
    source: string;
    event_id: string;
    event_type: string;
    error_message: string | null;
    updated_at: string;
  }>;
  failed_credentials: Array<{
    id: number;
    visit_id: number;
    provider: string;
    status: string;
    failure_reason: string | null;
    updated_at: string;
  }>;
  approved_with_failed_credentials: Array<{
    visit_id: number;
    reference_number: string | null;
    office_id: number;
    guest_id: number;
    visit_updated_at: string;
    credential_id: number;
    credential_provider: string | null;
    credential_updated_at: string;
    failure_reason: string | null;
  }>;
}
