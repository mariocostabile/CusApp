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

export interface LiveTrend {
  kind: 'more' | 'less' | 'usual';
  headline: string;
  arrow: string;
  color: string;
}

/**
 * Google gives live crowding only in words ("Meno affollato del solito"), never as a number:
 * this is the only real-time signal, so the card shows it as the headline.
 */
export function getLiveTrend(status: string | undefined): LiveTrend {
  if (/più affollat/i.test(status || '')) {
    return { kind: 'more', headline: 'Più gente del solito', arrow: '↑', color: '#DC2626' };
  }
  if (/meno affollat/i.test(status || '')) {
    return { kind: 'less', headline: 'Meno gente del solito', arrow: '↓', color: '#16A34A' };
  }
  return { kind: 'usual', headline: 'Come al solito', arrow: '=', color: '#475569' };
}

/** Three-color group for the booking pills, which keep their green/amber/red palette. */
export type CrowdTone = 'calm' | 'moderate' | 'busy';

export interface CrowdLevel {
  level: string;
  color: string;
  tone: CrowdTone;
}

// One scale for the whole card: the level/color stored in the data file are not reliable
// (old live readings left "Calmo" on a 90% hour, and equal values had different colors).
const CROWD_LEVELS: ({ below: number } & CrowdLevel)[] = [
  { below: 20, level: 'Molto calmo', color: '#10B981', tone: 'calm' },
  { below: 40, level: 'Calmo', color: '#34D399', tone: 'calm' },
  { below: 60, level: 'Moderato', color: '#F59E0B', tone: 'moderate' },
  { below: 80, level: 'Affollato', color: '#F97316', tone: 'busy' },
];

export function getCrowdLevel(percent: number): CrowdLevel {
  const match = CROWD_LEVELS.find((l) => percent < l.below);
  return match
    ? { level: match.level, color: match.color, tone: match.tone }
    : { level: 'Molto affollato', color: '#EF4444', tone: 'busy' };
}

/**
 * Expected crowd for a 2-hour booking slot: average of Google's typical values for its hours.
 * Null when Google has no data for those hours (it has none for Saturday).
 */
export function getSlotCrowdLevel(
  hours: { hour: number; typical: number }[],
  startHour: number
): CrowdLevel | null {
  const inSlot = hours.filter((h) => h.hour >= startHour && h.hour < startHour + 2);
  if (inSlot.length === 0) return null;
  return getCrowdLevel(Math.round(inSlot.reduce((sum, h) => sum + h.typical, 0) / inSlot.length));
}
