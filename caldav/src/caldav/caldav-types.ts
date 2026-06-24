export type CaldavConnectionConfig = {
  readonly caldavUrl: string;
  readonly username: string;
  readonly password: string;
};

export type CaldavCalendarInfo = {
  readonly url: string;
  readonly name: string;
};

export type CaldavEventSummary = {
  readonly uid: string;
  readonly summary: string;
  readonly calendarName: string;
  readonly calendarUrl: string;
  readonly eventUrl: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly allDay: boolean;
  readonly location?: string;
  readonly description?: string;
};
