import {
  claimWindowsOverlap,
  sameClaimKey,
  type Claim,
  type Entity,
  type Event,
  type Evidence,
} from '../../contracts/knowledge';

export type TimeWindow = { from?: string; to?: string };

export type FindQueryBase = {
  collectionId: string;
  limit?: number;
  timeWindow?: TimeWindow;
};

function inWindow(
  row: { validFrom?: string; validTo?: string; observedAt?: string; occurredAt?: string },
  window?: TimeWindow,
): boolean {
  if (!window?.from && !window?.to) return true;
  const from = window.from;
  const to = window.to;
  if (row.validFrom != null || row.validTo != null) {
    return claimWindowsOverlap(
      { validFrom: row.validFrom, validTo: row.validTo },
      { validFrom: from, validTo: to },
    );
  }
  const ts = row.observedAt ?? row.occurredAt;
  if (!ts) return true;
  if (from && ts < from) return false;
  if (to && ts >= to) return false;
  return true;
}

function cap<T>(rows: T[], limit?: number): T[] {
  const n = Math.max(1, Number(limit ?? 50));
  return rows.slice(0, n);
}

export function findClaims(input: FindQueryBase & {
  claims: Claim[];
  subject?: string;
  predicate?: string;
}): { records: Claim[]; evidenceIds: string[] } {
  let rows = input.claims.filter((c) => inWindow(c, input.timeWindow));
  if (input.subject) {
    rows = rows.filter((c) => sameClaimKey(c, { subject: input.subject!, predicate: c.predicate }));
  }
  if (input.predicate) {
    rows = rows.filter((c) => sameClaimKey(c, { subject: c.subject, predicate: input.predicate! }));
  }
  const records = cap(rows, input.limit);
  return {
    records,
    evidenceIds: [...new Set(records.map((r) => r.evidenceId).filter(Boolean))] as string[],
  };
}

export function findEntities(input: FindQueryBase & {
  entities: Entity[];
  query?: string;
}): { records: Entity[] } {
  const q = input.query?.trim().toLowerCase();
  let rows = input.entities;
  if (q) {
    rows = rows.filter(
      (e) =>
        e.label.toLowerCase().includes(q) ||
        e.entityId.toLowerCase().includes(q) ||
        (e.aliases ?? []).some((a) => a.toLowerCase().includes(q)),
    );
  }
  return { records: cap(rows, input.limit) };
}

export function findEvents(input: FindQueryBase & {
  events: Event[];
  typeId?: string;
}): { records: Event[]; evidenceIds: string[] } {
  let rows = input.events.filter((e) =>
    inWindow({ occurredAt: e.occurredAt }, input.timeWindow),
  );
  if (input.typeId) {
    rows = rows.filter((e) => e.typeId === input.typeId);
  }
  const records = cap(rows, input.limit);
  return {
    records,
    evidenceIds: [...new Set(records.map((r) => r.evidenceId).filter(Boolean))] as string[],
  };
}

export function findEvidence(input: FindQueryBase & {
  evidence: Evidence[];
  query?: string;
}): { records: Evidence[] } {
  const q = input.query?.trim().toLowerCase();
  let rows = input.evidence.filter((e) =>
    inWindow({ observedAt: e.observedAt }, input.timeWindow),
  );
  if (q) {
    rows = rows.filter(
      (e) =>
        e.text.toLowerCase().includes(q) ||
        (e.source ?? '').toLowerCase().includes(q) ||
        e.id.toLowerCase().includes(q),
    );
  }
  return { records: cap(rows, input.limit) };
}

export function inspectHistory(input: FindQueryBase & {
  claims: Claim[];
  subject: string;
  predicate: string;
}): {
  records: Claim[];
  evidenceIds: string[];
  alternatives: { claimId: string; object: string; status: string; source: string }[];
} {
  const rows = input.claims
    .filter((c) => sameClaimKey(c, input))
    .sort((a, b) => a.assertedAt.localeCompare(b.assertedAt));
  const records = cap(rows, input.limit);
  return {
    records,
    evidenceIds: [...new Set(records.map((r) => r.evidenceId).filter(Boolean))] as string[],
    alternatives: records.map((c) => ({
      claimId: c.claimId,
      object: c.object,
      status: c.status,
      source: c.source,
    })),
  };
}

export function comparePeriods(input: {
  collectionId: string;
  claims: Claim[];
  subject?: string;
  predicate?: string;
  windowA: TimeWindow;
  windowB: TimeWindow;
  limit?: number;
}): {
  periodA: Claim[];
  periodB: Claim[];
  evidenceIds: string[];
} {
  const base = { collectionId: input.collectionId, claims: input.claims, limit: input.limit };
  const a = findClaims({
    ...base,
    subject: input.subject,
    predicate: input.predicate,
    timeWindow: input.windowA,
  });
  const b = findClaims({
    ...base,
    subject: input.subject,
    predicate: input.predicate,
    timeWindow: input.windowB,
  });
  return {
    periodA: a.records,
    periodB: b.records,
    evidenceIds: [...new Set([...a.evidenceIds, ...b.evidenceIds])],
  };
}
