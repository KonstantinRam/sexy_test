// Domain model for the contact-finder slice. Types only — no logic.

/** One row of data/companies.csv — all we know about an account. */
export interface InputRow {
  company_name: string;
  mailing_address: string;
}

/** Business-registry lookup result (registered agent / owner). */
export interface RegistryRecord {
  name: string | null;
  role: string | null;
  source_url: string;
}

/** Web/maps business-listing result (generic phone, sometimes role-less name). */
export interface ListingRecord {
  name: string | null;
  phone: string | null;
  source_url: string;
}

/** Email/phone enrichment result with the provider's self-reported confidence (0-100). */
export interface EnrichmentRecord {
  email: string | null;
  phone: string | null;
  provider_confidence: number;
  source_url: string;
}

export type ProviderName = 'registry' | 'listing' | 'enrichment';

/**
 * Result of querying one provider for one company.
 *
 * 'absent' (key missing in the mock response) and 'found' with all-null fields
 * are DIFFERENT states: absent means the source had nothing at all; found-with-nulls
 * means the source responded but the fields were empty. This distinction is
 * load-bearing for confidence scoring and "cannot-verify" handling.
 */
export type ProviderResult<R> =
  | { status: 'absent' }
  | { status: 'found'; record: R };

/** A value carried with its provenance — every emitted value must be attributable. */
export interface SourcedValue<T> {
  value: T;
  provider: ProviderName;
  source_url: string;
}

export type ReviewReason =
  | 'suppressed'
  | 'no_sources_found'
  | 'no_contact_channel'
  | 'no_decision_maker_identified'
  | 'conflicting_identities'
  | 'single_weak_source'
  | 'below_threshold';

/** One row of the final output CSV. */
export interface OutputRow {
  company_name: string;
  contact_name: string;
  contact_role: string;
  contact_email_or_phone: string;
  confidence_score: number;
  source: string;
  source_urls: string;
  needs_human_review: boolean;
  review_reason: ReviewReason | '';
}
