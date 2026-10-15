import { create } from 'zustand';

export type ManagementType = 'GUEST' | 'HOST' | 'VISIT' | null;
export type VisitManagementAction = 'STATUS' | 'RESCHEDULE' | 'REASSIGN' | 'ESCALATE' | 'EXTEND';

interface ManagementState {
  isOpen: boolean;
  type: ManagementType;
  id: number | null;
  requestedVisitAction: VisitManagementAction | null;
  open: (type: ManagementType, id: number, requestedVisitAction?: VisitManagementAction | null) => void;
  close: () => void;
}

export const useManagementStore = create<ManagementState>((set) => ({
  isOpen: false,
  type: null,
  id: null,
  requestedVisitAction: null,
  open: (type, id, requestedVisitAction = null) =>
    set({ isOpen: true, type, id, requestedVisitAction }),
  close: () =>
    set({ isOpen: false, type: null, id: null, requestedVisitAction: null }),
}));
