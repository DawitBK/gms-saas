export type VisitMessage = {
  id: number;
  visit_id: number;
  sender_id: number;
  content: string;
  created_at: string;
  sender: {
    id: number;
    full_name: string | null;
    email: string | null;
  };
};
