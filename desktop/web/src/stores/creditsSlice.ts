import type { StateCreator } from 'zustand';
import type { AppState } from './types';
import type { CheckinStatus } from '../types';

/* ── Credits Slice ─────────────────────────────── */

export interface CreditsSlice {
  creditsBalance: number;
  checkinStatus: CheckinStatus;
  setCreditsBalance: (balance: number) => void;
  setCheckinStatus: (status: CheckinStatus) => void;
}

const defaultCheckinStatus: CheckinStatus = {
  can_checkin: false,
  streak: 0,
  today_earned: 0,
};

export const createCreditsSlice: StateCreator<AppState, [], [], CreditsSlice> = (set) => ({
  creditsBalance: 0,
  checkinStatus: defaultCheckinStatus,
  setCreditsBalance: (balance) => set({ creditsBalance: balance }),
  setCheckinStatus: (status) => set({ checkinStatus: status }),
});
