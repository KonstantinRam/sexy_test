// Identity extraction and matching. Pure heuristics — no LLM, no network.
import type { ProviderName } from './types.js';
import type { ProviderResults } from './providers.js';

/** A named person extracted from a provider result, with provenance. */
export interface Person {
  name: string;
  role: string | null;
  provider: ProviderName;
  source_url: string;
  /** Set when an honorific (e.g. "Dr.") was stripped from the raw name. */
  honorific?: string;
}

const HONORIFIC_RE = /^(dr|mr|mrs|ms|prof)\.?\s+/i;

// Small inline nickname table — deliberately capped, do not grow into a config.
const NICKNAMES: Record<string, string> = {
  bob: 'robert',
  jeff: 'jeffrey',
  bill: 'william',
  mike: 'michael',
  tom: 'thomas',
  dan: 'daniel',
};

const GENERIC_LOCAL_PARTS = new Set([
  'info',
  'office',
  'contact',
  'sales',
  'admin',
  'support',
  'hello',
]);

/** Canonical form of a first name: nickname resolved to its full form. */
function canonicalFirst(name: string): string {
  return NICKNAMES[name] ?? name;
}

/** Lowercased name tokens with honorifics and punctuation stripped. */
function nameTokens(name: string): string[] {
  return name
    .replace(HONORIFIC_RE, '')
    .toLowerCase()
    .replace(/[.,]/g, '')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Parse a raw listing name: embedded role in parens ("Jeff (manager)") and
 * leading honorific ("Dr. Patel") are split out of the name proper.
 */
function parseListingName(raw: string): {
  name: string;
  role: string | null;
  honorific: string | null;
} {
  let name = raw.trim();
  let role: string | null = null;
  const roleMatch = name.match(/^(.*?)\s*\(([^)]+)\)$/);
  if (roleMatch) {
    name = roleMatch[1].trim();
    role = roleMatch[2].trim();
  }
  let honorific: string | null = null;
  const honMatch = name.match(HONORIFIC_RE);
  if (honMatch) {
    honorific = honMatch[1];
    name = name.slice(honMatch[0].length).trim();
  }
  return { name, role, honorific };
}

/**
 * Extract named people from one company's provider results.
 *
 * - registry: name + role taken as given.
 * - listing: embedded role and honorific parsed out of the raw name.
 * - enrichment: never yields a Person — the email local-part is only a
 *   corroboration hint (see emailMatchesName).
 */
export function extractPeople(results: ProviderResults): Person[] {
  const people: Person[] = [];

  if (results.registry.status === 'found' && results.registry.record.name) {
    people.push({
      name: results.registry.record.name,
      role: results.registry.record.role,
      provider: 'registry',
      source_url: results.registry.record.source_url,
    });
  }

  if (results.listing.status === 'found' && results.listing.record.name) {
    const { name, role, honorific } = parseListingName(
      results.listing.record.name,
    );
    const person: Person = {
      name,
      role,
      provider: 'listing',
      source_url: results.listing.record.source_url,
    };
    if (honorific) person.honorific = honorific;
    people.push(person);
  }

  return people;
}

/**
 * Case-insensitive name match: exact, first-initial ("S. Murphy" ~
 * "Sean Murphy"), or nickname ("Bob" ~ "Robert") — last names must agree.
 */
export function namesMatch(a: string, b: string): boolean {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.length === 0 || tb.length === 0) return false;
  if (ta.join(' ') === tb.join(' ')) return true;

  const [firstA, lastA] = [ta[0], ta[ta.length - 1]];
  const [firstB, lastB] = [tb[0], tb[tb.length - 1]];
  if (lastA !== lastB) return false;

  // First-initial match: one side is a bare initial.
  if (
    (firstA.length === 1 || firstB.length === 1) &&
    firstA[0] === firstB[0]
  ) {
    return true;
  }

  return canonicalFirst(firstA) === canonicalFirst(firstB);
}

/**
 * Does an email local-part plausibly belong to this person?
 * Handles "karen", "d.ortega", "g.whitfield", "emily.hart" shapes.
 * Generic local-parts (info, office, ...) always fail.
 */
export function emailMatchesName(email: string, name: string): boolean {
  const local = email.split('@')[0]?.toLowerCase() ?? '';
  if (!local || GENERIC_LOCAL_PARTS.has(local)) return false;

  const tokens = nameTokens(name);
  if (tokens.length === 0) return false;
  const first = tokens[0];
  const last = tokens[tokens.length - 1];

  const parts = local.split(/[._-]/).filter(Boolean);
  if (parts.length >= 2) {
    // "d.ortega" / "emily.hart": first part is the first name or its initial,
    // second part is the last name.
    const [p0, p1] = parts;
    const firstOk =
      canonicalFirst(p0) === canonicalFirst(first) || p0 === first[0];
    return firstOk && p1 === last;
  }

  // Single-part local: "karen" ~ "Karen Liu".
  return canonicalFirst(local) === canonicalFirst(first) || local === last;
}

/**
 * Conflict: two named people from different providers whose names do not
 * match — the sources disagree about who runs this company.
 */
export function detectConflict(people: Person[]): boolean {
  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) {
      if (
        people[i].provider !== people[j].provider &&
        !namesMatch(people[i].name, people[j].name)
      ) {
        return true;
      }
    }
  }
  return false;
}
