// Confidence scoring and the ship/review gate.
// Additive and explainable: every applied delta, cap, and clamp is pushed to
// reasons[] so a human can reconstruct the score from the output alone.
import {
  detectConflict,
  emailMatchesName,
  extractPeople,
  namesMatch,
  type Person,
} from './identity.js';
import { classifyPersona } from './persona.js';
import type { ProviderResults } from './providers.js';
import type { ReviewReason } from './types.js';

// --- Tunable weights ---------------------------------------------------------
const PERSON_FROM_REGISTRY = 25;
const PERSON_FROM_LISTING = 15;
/** Same person attested by >=2 providers (namesMatch or a matching email). */
const PERSON_CORROBORATED = 15;
/** Enrichment email local-part matches the chosen person. */
const EMAIL_MATCHES_PERSON = 10;
/** Enrichment contributes floor(provider_confidence * this). */
const ENRICHMENT_CONFIDENCE_FACTOR = 0.4;
const PHONE_FROM_LISTING = 10;
/** Same phone number reported by >=2 providers. */
const PHONE_CORROBORATED = 15;
const GENERIC_INBOX_PENALTY = -20;
/** Conflicting identities across providers can never ship. */
const CONFLICT_CAP = 40;
/** A single source can never clear the ship threshold on its own. */
const SINGLE_PROVIDER_CAP = 65;

/** Ship cutoff per challenge/CLARIFICATIONS.md. */
export const SHIP_THRESHOLD = 70;

// Penalty list from the task spec. identity.ts keeps its own (unexported) list
// for emailMatchesName; this one only drives the scoring penalty.
const GENERIC_LOCAL_PARTS = new Set(['info', 'office', 'sales', 'contact']);

export interface ScoreResult {
  score: number;
  reasons: string[];
  reviewReason: ReviewReason | null;
}

export interface GateResult {
  contact_name: string;
  contact_role: string;
  contact_email_or_phone: string;
  needs_human_review: boolean;
  review_reason: ReviewReason | '';
}

interface Candidate {
  person: Person;
  rank: 1 | 2 | 3 | 4 | 5;
}

/** Everything score() and gate() need, derived once from the raw results. */
interface Evidence {
  providersFound: number;
  enrichmentOnly: boolean;
  people: Person[];
  /** People whose persona is not 'excluded', extraction order preserved. */
  candidates: Candidate[];
  /** Best candidate: lowest persona rank, registry-first on ties. */
  chosen: Candidate | null;
  email: string | null;
  emailIsGeneric: boolean;
  emailMatchesChosen: boolean;
  listingPhone: string | null;
  enrichmentPhone: string | null;
  /** The phone if listing and enrichment report the same number. */
  corroboratedPhone: string | null;
  /** See the anchoring rule where this is computed in analyze(). */
  identityAnchored: boolean;
  hasAnyChannel: boolean;
  conflict: boolean;
}

const digits = (phone: string): string => phone.replace(/\D/g, '');

/** First + last name present? A single token ("Jeff") is not a full identity. */
const hasFullName = (person: Person): boolean =>
  person.name.trim().split(/\s+/).length >= 2;

function analyze(results: ProviderResults): Evidence {
  const providersFound = [
    results.registry,
    results.listing,
    results.enrichment,
  ].filter((r) => r.status === 'found').length;

  const people = extractPeople(results);
  const candidates: Candidate[] = [];
  for (const person of people) {
    const rank = classifyPersona(person.role);
    if (rank !== 'excluded') candidates.push({ person, rank });
  }
  // extractPeople yields registry before listing, so on rank ties the registry
  // person wins.
  const chosen = candidates.reduce<Candidate | null>(
    (best, c) => (best === null || c.rank < best.rank ? c : best),
    null,
  );

  const enrichment =
    results.enrichment.status === 'found' ? results.enrichment.record : null;
  const email = enrichment?.email ?? null;
  const emailLocal = email?.split('@')[0]?.toLowerCase() ?? '';
  const listingPhone =
    results.listing.status === 'found' ? results.listing.record.phone : null;
  const enrichmentPhone = enrichment?.phone ?? null;
  const corroboratedPhone =
    listingPhone && enrichmentPhone && digits(listingPhone) === digits(enrichmentPhone)
      ? listingPhone
      : null;

  return {
    providersFound,
    enrichmentOnly: providersFound === 1 && enrichment !== null,
    people,
    candidates,
    chosen,
    email,
    emailIsGeneric: GENERIC_LOCAL_PARTS.has(emailLocal),
    emailMatchesChosen:
      email !== null && chosen !== null && emailMatchesName(email, chosen.person.name),
    listingPhone,
    enrichmentPhone,
    corroboratedPhone,
    // Anchoring rule: the identity is anchored only when some non-excluded
    // person has a full (first + last) name. Both name-based bonuses — person
    // corroboration via email and the email↔chosen-person match — require an
    // anchored identity: a lone first name ("Jeff") matched by its own email
    // local-part is circular evidence, not independent attestation.
    identityAnchored: candidates.some((c) => hasFullName(c.person)),
    hasAnyChannel: Boolean(email || listingPhone || enrichmentPhone),
    // Conflict only among non-excluded people: a registered agent differing
    // from the listing name is not a disagreement about who runs the company.
    conflict: detectConflict(candidates.map((c) => c.person)),
  };
}

export function score(results: ProviderResults): ScoreResult {
  const ev = analyze(results);
  const reasons: string[] = [];

  // Hard rule (a): nothing came back at all.
  if (ev.providersFound === 0) {
    return {
      score: 0,
      reasons: ['hard rule: all providers absent => score 0'],
      reviewReason: 'no_sources_found',
    };
  }

  let total = 0;
  const add = (points: number, why: string): void => {
    total += points;
    reasons.push(`${why}: ${points >= 0 ? '+' : ''}${points}`);
  };

  // People. Excluded personas earn nothing — they are not the business.
  for (const person of ev.people) {
    if (classifyPersona(person.role) === 'excluded') {
      reasons.push(
        `person from ${person.provider} ("${person.name}", ${person.role}) excluded — not a decision-maker: +0`,
      );
      continue;
    }
    const role = person.role ? `, ${person.role}` : '';
    if (person.provider === 'registry') {
      add(PERSON_FROM_REGISTRY, `person from registry ("${person.name}"${role})`);
    } else {
      add(PERSON_FROM_LISTING, `person from listing ("${person.name}"${role})`);
    }
  }

  // Person corroborated across >=2 providers: matching names from two
  // providers, or an enrichment email matching a named person (the email path
  // is subject to the anchoring rule — see analyze()).
  const namePair = ev.candidates.find((a) =>
    ev.candidates.some(
      (b) =>
        a.person.provider !== b.person.provider &&
        namesMatch(a.person.name, b.person.name),
    ),
  );
  if (namePair) {
    add(
      PERSON_CORROBORATED,
      `person "${namePair.person.name}" corroborated by matching names across providers`,
    );
  } else {
    const emailMatch =
      ev.email === null || !ev.identityAnchored
        ? undefined
        : ev.candidates.find((c) => emailMatchesName(ev.email!, c.person.name));
    if (emailMatch) {
      add(
        PERSON_CORROBORATED,
        `person "${emailMatch.person.name}" corroborated by enrichment email ${ev.email}`,
      );
    }
  }

  // Also subject to the anchoring rule (see analyze()).
  if (ev.identityAnchored && ev.emailMatchesChosen && ev.chosen) {
    add(
      EMAIL_MATCHES_PERSON,
      `email local-part of ${ev.email} matches chosen person "${ev.chosen.person.name}"`,
    );
  }

  if (results.enrichment.status === 'found' && (ev.email || ev.enrichmentPhone)) {
    const confidence = results.enrichment.record.provider_confidence;
    add(
      Math.floor(confidence * ENRICHMENT_CONFIDENCE_FACTOR),
      `enrichment channel at provider confidence ${confidence} (floor of ${ENRICHMENT_CONFIDENCE_FACTOR}x)`,
    );
  }

  if (ev.listingPhone) {
    add(PHONE_FROM_LISTING, `phone ${ev.listingPhone} present from listing`);
  }
  if (ev.corroboratedPhone) {
    add(PHONE_CORROBORATED, `same phone ${ev.corroboratedPhone} in 2 providers`);
  }

  if (ev.email && ev.emailIsGeneric) {
    add(GENERIC_INBOX_PENALTY, `generic inbox ${ev.email}`);
  }

  // Hard rules (b)-(e), reason priority in that order; caps always apply.
  let reviewReason: ReviewReason | null = null;
  if (!ev.hasAnyChannel) {
    reviewReason = 'no_contact_channel';
    reasons.push('hard rule: no email or phone from any provider => no_contact_channel');
  } else if (ev.candidates.length === 0 && !ev.enrichmentOnly) {
    // Enrichment never yields a person, so for enrichment-only rows "no
    // decision-maker" is vacuous — rule (e) single_weak_source is the real
    // diagnosis there.
    reviewReason = 'no_decision_maker_identified';
    reasons.push(
      'hard rule: no person with a non-excluded persona => no_decision_maker_identified',
    );
  }
  if (ev.conflict) {
    if (total > CONFLICT_CAP) {
      reasons.push(`hard rule: conflicting identities => score capped at ${CONFLICT_CAP}`);
      total = CONFLICT_CAP;
    }
    reviewReason ??= 'conflicting_identities';
  }
  if (ev.providersFound === 1) {
    if (total > SINGLE_PROVIDER_CAP) {
      reasons.push(
        `hard rule: only one provider returned data => score capped at ${SINGLE_PROVIDER_CAP}`,
      );
      total = SINGLE_PROVIDER_CAP;
    }
    if (ev.enrichmentOnly) reviewReason ??= 'single_weak_source';
  }

  const clamped = Math.max(0, Math.min(100, total));
  if (clamped !== total) reasons.push(`raw score ${total} clamped to ${clamped}`);

  return { score: clamped, reasons, reviewReason };
}

/**
 * Ship/review gate per challenge/CLARIFICATIONS.md: below SHIP_THRESHOLD the
 * contact fields are blanked and the row goes to human review (the score is
 * still reported by the caller). Channel preference when shipping:
 * corroborated personal email > personal email > corroborated phone > phone.
 */
export function gate(results: ProviderResults, scored: ScoreResult): GateResult {
  if (scored.score < SHIP_THRESHOLD) {
    return {
      contact_name: '',
      contact_role: '',
      contact_email_or_phone: '',
      needs_human_review: true,
      review_reason: scored.reviewReason ?? 'below_threshold',
    };
  }

  const ev = analyze(results);
  // Only enrichment yields emails, so "corroborated personal email" and
  // "personal email" resolve to the same value — the email wins over any
  // phone either way; among phones the corroborated one wins.
  let channel = '';
  if (ev.email && !ev.emailIsGeneric) {
    channel = ev.email;
  } else if (ev.corroboratedPhone) {
    channel = ev.corroboratedPhone;
  } else {
    channel = ev.listingPhone ?? ev.enrichmentPhone ?? '';
  }

  return {
    contact_name: ev.chosen?.person.name ?? '',
    contact_role: ev.chosen?.person.role ?? '',
    contact_email_or_phone: channel,
    needs_human_review: false,
    review_reason: '',
  };
}
