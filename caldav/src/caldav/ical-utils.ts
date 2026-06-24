import ICAL from 'ical.js';
import type { DAVCalendarObject } from 'tsdav';
import type { CaldavEventSummary } from './caldav-types';

export function toCalDavTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date: ${iso}`);
  }
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function icalTimeToIso(time: ICAL.Time | null): string {
  if (!time) {
    return '';
  }
  const js = time.toJSDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${js.getFullYear()}-${pad(js.getMonth() + 1)}-${pad(js.getDate())}T` +
    `${pad(js.getHours())}:${pad(js.getMinutes())}:${pad(js.getSeconds())}`
  );
}

export function parseCalendarObject(
  obj: DAVCalendarObject,
  calendarName: string,
  calendarUrl: string,
): CaldavEventSummary[] {
  const data = obj.data?.trim();
  if (!data || !obj.url) {
    return [];
  }
  const root = new ICAL.Component(ICAL.parse(data));
  const out: CaldavEventSummary[] = [];
  for (const ve of root.getAllSubcomponents('vevent')) {
    const ev = new ICAL.Event(ve);
    const uid = ev.uid;
    if (!uid) {
      continue;
    }
    out.push({
      uid,
      summary: ev.summary ?? '',
      calendarName,
      calendarUrl,
      eventUrl: obj.url,
      startDate: icalTimeToIso(ev.startDate),
      endDate: icalTimeToIso(ev.endDate),
      allDay: Boolean(ev.startDate?.isDate),
      ...(ev.location ? { location: ev.location } : {}),
      ...(ev.description ? { description: ev.description } : {}),
    });
  }
  return out;
}

export type BuildVeventParams = {
  readonly uid: string;
  readonly summary: string;
  readonly startIso: string;
  readonly endIso: string;
  readonly description?: string;
  readonly location?: string;
  readonly allDay?: boolean;
};

export function buildVcalendarIcs(params: BuildVeventParams): string {
  const cal = new ICAL.Component(['vcalendar', [], []]);
  cal.updatePropertyWithValue('prodid', '-//conveyor//caldav//EN');
  cal.updatePropertyWithValue('version', '2.0');
  const vevent = new ICAL.Component('vevent');
  vevent.updatePropertyWithValue('uid', params.uid);
  vevent.updatePropertyWithValue('summary', params.summary);
  const start = ICAL.Time.fromDateTimeString(
    params.startIso.replace('Z', '').slice(0, 19),
  );
  const end = ICAL.Time.fromDateTimeString(
    params.endIso.replace('Z', '').slice(0, 19),
  );
  if (params.allDay) {
    start.isDate = true;
    end.isDate = true;
  }
  vevent.updatePropertyWithValue('dtstart', start);
  vevent.updatePropertyWithValue('dtend', end);
  vevent.updatePropertyWithValue(
    'dtstamp',
    ICAL.Time.fromJSDate(new Date(), false),
  );
  if (params.description) {
    vevent.updatePropertyWithValue('description', params.description);
  }
  if (params.location) {
    vevent.updatePropertyWithValue('location', params.location);
  }
  cal.addSubcomponent(vevent);
  return cal.toString();
}

export function eventOverlapsRange(
  ev: CaldavEventSummary,
  startIso: string,
  endIso: string,
): boolean {
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  const evStart = new Date(ev.startDate).getTime();
  const evEnd = new Date(ev.endDate).getTime();
  if (
    Number.isNaN(startMs) ||
    Number.isNaN(endMs) ||
    Number.isNaN(evStart) ||
    Number.isNaN(evEnd)
  ) {
    return true;
  }
  return evStart < endMs && evEnd > startMs;
}
