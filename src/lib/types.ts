export type EventCategory = "politics" | "conflict" | "science" | "culture" | "economy" | "disaster" | "society";
export interface HistoryEvent {
  id: string;
  title: string;
  summary: string;
  date: string;
  month: string;
  countryCodes: string[];
  lat: number;
  lng: number;
  category: EventCategory;
  score: number;
  sourceUrl: string;
  sourceTitle: string;
  imageUrl: string | null;
  imageCredit: string | null;
}
export interface Country { code: string; name: string; nameEn: string; lat: number; lng: number }
export interface AtlasStatus {
  startMonth: string;
  latestMonth: string;
  eventCount: number;
  candidateCount?: number;
  monthCount: number;
  completedMonths: number;
  pendingMonths: number;
  lastSyncAt: string | null;
  sync: { running: boolean; processed: number; total: number; error: string | null };
  coverage: { month: string; count: number }[];
  sourceNote: string;
}
