/**
 * Pure helpers that turn an hourly crowd list into human-readable hints
 * for the "Stima Affluenza" card (trend, best time, peak / calm ranges).
 */

export interface CrowdInsightHour {
  hour: number;
  label: string;
  percent: number;
  level: string;
}

export interface CrowdRange {
  range: string;
  percent: number;
}

export function formatHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

export function getTrendText(hours: CrowdInsightHour[], current: CrowdInsightHour): string {
  const next = hours.find((h) => h.hour === current.hour + 1);
  if (!next) return 'Chiude alle 22:00';
  const arrow = next.percent > current.percent ? '↗' : next.percent < current.percent ? '↘' : '→';
  return `${arrow} Alle ${next.label}: ${next.level} (~${next.percent}%)`;
}

export function getBestTimeText(hours: CrowdInsightHour[], current: CrowdInsightHour): string {
  const best = hours
    .filter((h) => h.hour > current.hour)
    .sort((a, b) => a.hour - b.hour)
    .reduce<CrowdInsightHour | null>((acc, h) => (!acc || h.percent < acc.percent ? h : acc), null);
  if (!best || current.percent <= best.percent) return '⭐ Adesso è il momento migliore di oggi';
  return `⭐ Meglio oggi: ${best.label} (~${best.percent}%)`;
}

/** First run of consecutive hours sharing the day's max (or min) percent, e.g. "10:00-14:00". */
export function getExtremeRange(hours: CrowdInsightHour[], kind: 'max' | 'min'): CrowdRange | null {
  if (hours.length === 0) return null;
  const sorted = [...hours].sort((a, b) => a.hour - b.hour);
  const values = sorted.map((h) => h.percent);
  const target = kind === 'max' ? Math.max(...values) : Math.min(...values);
  const start = sorted.findIndex((h) => h.percent === target);
  let end = start;
  while (
    end + 1 < sorted.length &&
    sorted[end + 1].percent === target &&
    sorted[end + 1].hour === sorted[end].hour + 1
  ) {
    end++;
  }
  const range =
    end === start
      ? formatHour(sorted[start].hour)
      : `${formatHour(sorted[start].hour)}-${formatHour(sorted[end].hour + 1)}`;
  return { range, percent: target };
}
