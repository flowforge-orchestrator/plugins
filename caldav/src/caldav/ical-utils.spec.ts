import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { eventOverlapsRange, toCalDavTime } from './ical-utils';

describe('toCalDavTime', () => {
  it('formats Zulu ISO for CalDAV time-range', () => {
    assert.equal(
      toCalDavTime('2026-06-04T12:30:00.000Z'),
      '20260604T123000Z',
    );
  });

  it('formats offset ISO for CalDAV time-range', () => {
    assert.equal(
      toCalDavTime('2026-06-01T00:00:00+03:00'),
      '20260531T210000Z',
    );
  });

  it('converts unqualified input to UTC Z', () => {
    assert.equal(
      toCalDavTime('2026-06-04T12:30:00'),
      '20260604T093000Z',
    );
  });
});

describe('eventOverlapsRange', () => {
  it('detects overlap', () => {
    assert.equal(
      eventOverlapsRange(
        {
          uid: '1',
          summary: 'x',
          calendarName: 'c',
          calendarUrl: 'u',
          eventUrl: 'e',
          startDate: '2026-06-04T10:00:00',
          endDate: '2026-06-04T11:00:00',
          allDay: false,
        },
        '2026-06-04T09:00:00',
        '2026-06-04T12:00:00',
      ),
      true,
    );
  });
});
