import { get } from './base';
import type { DuplicateCheckResult } from '../types';

export const complianceApi = {
  duplicate: (title: string) => get<DuplicateCheckResult>(`/api/compliance/duplicate?title=${encodeURIComponent(title)}`),
};
