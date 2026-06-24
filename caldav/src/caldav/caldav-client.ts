import { createDAVClient, type DAVCalendar } from 'tsdav';
import type {
  CaldavCalendarInfo,
  CaldavConnectionConfig,
  CaldavEventSummary,
} from './caldav-types';
import {
  buildVcalendarIcs,
  eventOverlapsRange,
  parseCalendarObject,
  toCalDavTime,
} from './ical-utils';

function normalizeServerUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

function calendarDisplayName(cal: DAVCalendar): string {
  const raw = cal.displayName;
  if (typeof raw === 'string' && raw.trim()) {
    return raw.trim();
  }
  return cal.url?.split('/').filter(Boolean).pop() ?? cal.url ?? 'calendar';
}

export class CaldavClient {
  constructor(private readonly config: CaldavConnectionConfig) {}

  private async dav() {
    return createDAVClient({
      serverUrl: normalizeServerUrl(this.config.caldavUrl),
      credentials: {
        username: this.config.username,
        password: this.config.password,
      },
      authMethod: 'Basic',
      defaultAccountType: 'caldav',
    });
  }

  async listCalendars(): Promise<CaldavCalendarInfo[]> {
    const client = await this.dav();
    const calendars = await client.fetchCalendars();
    return calendars
      .filter((c: DAVCalendar) => Boolean(c.url))
      .map((c: DAVCalendar) => ({
        url: c.url!,
        name: calendarDisplayName(c),
      }));
  }

  private async resolveCalendars(
    calendarUrl?: string,
    calendarName?: string,
  ): Promise<DAVCalendar[]> {
    const client = await this.dav();
    const all = await client.fetchCalendars();
    const url = calendarUrl?.trim();
    const name = calendarName?.trim();
    if (url) {
      const hit = all.filter((c: DAVCalendar) => c.url === url);
      if (hit.length === 0) {
        throw new Error(`Calendar not found by url: ${url}`);
      }
      return hit;
    }
    if (name) {
      const hit = all.filter((c: DAVCalendar) => calendarDisplayName(c) === name);
      if (hit.length === 0) {
        throw new Error(`Calendar not found by name: ${name}`);
      }
      return hit;
    }
    return all;
  }

  async listEvents(opts: {
    startIso: string;
    endIso: string;
    calendarUrl?: string;
    calendarName?: string;
  }): Promise<CaldavEventSummary[]> {
    const client = await this.dav();
    const calendars = await this.resolveCalendars(
      opts.calendarUrl,
      opts.calendarName,
    );
    const timeRange = {
      start: toCalDavTime(opts.startIso),
      end: toCalDavTime(opts.endIso),
    };
    const events: CaldavEventSummary[] = [];
    for (const cal of calendars) {
      if (!cal.url) {
        continue;
      }
      const name = calendarDisplayName(cal);
      const objects = await client.fetchCalendarObjects({
        calendar: cal,
        timeRange,
      });
      for (const obj of objects) {
        const parsed = parseCalendarObject(obj, name, cal.url);
        for (const ev of parsed) {
          if (eventOverlapsRange(ev, opts.startIso, opts.endIso)) {
            events.push(ev);
          }
        }
      }
    }
    return events;
  }

  async getEvent(eventUrl: string): Promise<CaldavEventSummary | null> {
    const url = eventUrl.trim();
    const client = await this.dav();
    const calendars = await client.fetchCalendars();
    for (const cal of calendars) {
      if (!cal.url) {
        continue;
      }
      const objects = await client.fetchCalendarObjects({
        calendar: cal,
        objectUrls: [url],
      });
      if (objects.length === 0) {
        continue;
      }
      const parsed = parseCalendarObject(
        objects[0]!,
        calendarDisplayName(cal),
        cal.url,
      );
      if (parsed.length > 0) {
        return parsed[0]!;
      }
    }
    return null;
  }

  async createEvent(opts: {
    calendarUrl?: string;
    calendarName?: string;
    summary: string;
    startIso: string;
    endIso: string;
    description?: string;
    location?: string;
    allDay?: boolean;
    uid?: string;
  }): Promise<{ uid: string; eventUrl: string }> {
    const calendars = await this.resolveCalendars(
      opts.calendarUrl,
      opts.calendarName,
    );
    const cal = calendars[0];
    if (!cal?.url) {
      throw new Error('No calendar available for createEvent');
    }
    const uid =
      opts.uid?.trim() ||
      `${Date.now()}-${Math.random().toString(36).slice(2)}@conveyor`;
    const ics = buildVcalendarIcs({
      uid,
      summary: opts.summary,
      startIso: opts.startIso,
      endIso: opts.endIso,
      description: opts.description,
      location: opts.location,
      allDay: opts.allDay,
    });
    const client = await this.dav();
    const filename = `${uid.replace(/[^a-zA-Z0-9_-]/g, '_')}.ics`;
    await client.createCalendarObject({
      calendar: cal,
      filename,
      iCalString: ics,
    });
    const created = await this.getEvent(
      `${cal.url.replace(/\/$/, '')}/${filename}`,
    );
    return {
      uid,
      eventUrl: created?.eventUrl ?? `${cal.url}${filename}`,
    };
  }

  async updateEvent(opts: {
    eventUrl: string;
    summary?: string;
    startIso?: string;
    endIso?: string;
    description?: string;
    location?: string;
    allDay?: boolean;
  }): Promise<void> {
    const existing = await this.getEvent(opts.eventUrl);
    if (!existing) {
      throw new Error(`Event not found: ${opts.eventUrl}`);
    }
    const client = await this.dav();
    const calendars = await client.fetchCalendars();
    let targetCal: DAVCalendar | undefined;
    let targetObj = null as Awaited<
      ReturnType<typeof client.fetchCalendarObjects>
    >[number] | null;

    for (const cal of calendars) {
      if (!cal.url) {
        continue;
      }
      const objects = await client.fetchCalendarObjects({
        calendar: cal,
        objectUrls: [opts.eventUrl],
      });
      if (objects.length > 0) {
        targetCal = cal;
        targetObj = objects[0]!;
        break;
      }
    }
    if (!targetCal || !targetObj?.data) {
      throw new Error(`Event object not found: ${opts.eventUrl}`);
    }

    const ics = buildVcalendarIcs({
      uid: existing.uid,
      summary: opts.summary ?? existing.summary,
      startIso: opts.startIso ?? existing.startDate,
      endIso: opts.endIso ?? existing.endDate,
      description:
        opts.description !== undefined
          ? opts.description
          : existing.description,
      location:
        opts.location !== undefined ? opts.location : existing.location,
      allDay: opts.allDay ?? existing.allDay,
    });

    await client.updateCalendarObject({
      calendarObject: {
        url: targetObj.url,
        etag: targetObj.etag,
        data: ics,
      },
    });
  }

  async deleteEvent(eventUrl: string): Promise<void> {
    const client = await this.dav();
    const calendars = await client.fetchCalendars();
    for (const cal of calendars) {
      if (!cal.url) {
        continue;
      }
      const objects = await client.fetchCalendarObjects({
        calendar: cal,
        objectUrls: [eventUrl.trim()],
      });
      if (objects.length > 0) {
        await client.deleteCalendarObject({ calendarObject: objects[0]! });
        return;
      }
    }
    throw new Error(`Event not found: ${eventUrl}`);
  }
}

export function caldavFromInputs(
  inputs: CaldavConnectionConfig,
): CaldavClient {
  return new CaldavClient({
    caldavUrl: inputs.caldavUrl,
    username: inputs.username,
    password: inputs.password,
  });
}
