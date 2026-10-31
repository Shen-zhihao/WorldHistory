export interface MonthCheck { month: string; checked_at: string | null; error: string | null }

/** Keep the last active year in the refresh window across December → January. */
export function planSyncYears(cutoff: string, lastSyncAt: string | null, checked: ReadonlyMap<string, MonthCheck>, force = false, now = Date.now()): number[] {
  const currentYear = Number(cutoff.slice(0, 4));
  const lastYear = lastSyncAt ? Number(lastSyncAt.slice(0, 4)) : currentYear;
  return Array.from({ length: currentYear - 1799 }, (_, i) => 1800 + i).filter(year => {
    if (force || year >= Math.min(lastYear, currentYear)) return true;
    for (let m = 1; m <= 12; m++) {
      const month = `${year}-${String(m).padStart(2, "0")}`;
      if (month > cutoff.slice(0, 7)) break;
      const record = checked.get(month);
      if (!record?.checked_at || record.error || now - Date.parse(record.checked_at) > 30 * 86400000) return true;
    }
    return false;
  });
}
