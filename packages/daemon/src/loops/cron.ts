// Hand-rolled 5-field cron, no scheduling dependency (P4-D48).
export type CronSpec = { fields: Set<number>[]; anyDay: boolean; anyWeekday: boolean };

const BOUNDS: [number, number][] = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];

function field(text: string, [lo, hi]: [number, number]): Set<number> {
  const out = new Set<number>();
  for (const part of text.split(",")) {
    const m = /^(?:(\*)|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/.exec(part);
    if (!m) throw new Error(`invalid cron field: ${text}`);
    const step = m[4] === undefined ? 1 : Number(m[4]);
    const from = m[1] ? lo : Number(m[2]);
    // "5/15" means from 5 to the top, as in Vixie cron
    const to = m[1] || (m[3] === undefined && m[4] !== undefined) ? hi : Number(m[3] ?? m[2]);
    if (from < lo || to > hi || from > to || step < 1) throw new Error(`invalid cron field: ${text}`);
    for (let v = from; v <= to; v += step) out.add(v);
  }
  return out;
}

export function parseCron(expr: string): CronSpec {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`a cron needs 5 fields: ${expr}`);
  const fields = parts.map((p, i) => field(p, BOUNDS[i]!));
  if (fields[4]!.delete(7)) fields[4]!.add(0); // 7 is Sunday too
  return { fields, anyDay: parts[2]!.startsWith("*"), anyWeekday: parts[4]!.startsWith("*") };
}

function matches({ fields: [min, hour, dom, month, dow], anyDay, anyWeekday }: CronSpec, d: Date): boolean {
  if (!min!.has(d.getMinutes()) || !hour!.has(d.getHours()) || !month!.has(d.getMonth() + 1)) return false;
  const day = dom!.has(d.getDate()), weekday = dow!.has(d.getDay());
  // both restricted: either matches, as in Vixie cron
  return anyDay ? weekday : anyWeekday ? day : day || weekday;
}

/** The first minute strictly after `after` that the spec matches, in local time. */
export function nextRun(spec: CronSpec, after: Date): Date {
  const d = new Date(after);
  d.setSeconds(0, 0);
  for (let i = 0; i < 366 * 24 * 60; i++) {
    d.setTime(d.getTime() + 60_000);
    if (matches(spec, d)) return d;
  }
  throw new Error("the cron never runs within 366 days");
}
