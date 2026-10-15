export interface NotificationItem {
  id: number;
  user_id: number;
  type: string;
  title: string;
  message: string;
  metadata: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
}
