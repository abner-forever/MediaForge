import { get } from './base';
import type { PublishLogsResponse } from '../types';

export const publishLogsApi = {
  get: (after = 0, sessionId = '') => {
    let url = `/api/publish-logs?after=${after}`;
    if (sessionId) url += `&session_id=${encodeURIComponent(sessionId)}`;
    return get<PublishLogsResponse>(url);
  },
};
