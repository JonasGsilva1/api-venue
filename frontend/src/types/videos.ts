export interface DriveVideo {
  id: string;
  name: string;
  mime_type: string;
  size?: number | null;
  thumbnail_url?: string | null;
  content_url: string;
}

export interface DriveVideosResponse {
  total: number;
  videos: DriveVideo[];
}
