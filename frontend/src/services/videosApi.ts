import { api, API_BASE_URL } from './api';
import type { DriveVideosResponse } from '../types/videos';

function authHeaders(): Record<string, string> {
  const token =
    localStorage.getItem('@venue-intelligence:token') ||
    (import.meta.env.VITE_API_TOKEN as string | undefined);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function getDriveVideos(signal?: AbortSignal) {
  const { data } = await api.get<DriveVideosResponse>('/api/v1/videos', {
    headers: authHeaders(),
    signal,
    timeout: 60_000,
  });
  return data.videos;
}

export function getDriveVideoContentUrl(contentPath: string): string {
  return new URL(contentPath, API_BASE_URL).toString();
}
