// Opt-out suppression list — the FINAL gate, applied after scoring/gating.
// A suppressed row ships an empty contact regardless of score (compliance:
// opt-out must be honored even for high-confidence matches).
import { normalizeCompanyName } from './load.js';
import type { OutputRow } from './types.js';

export interface SuppressionEntry {
  key_type: 'company' | 'email' | 'phone';
  key_value: string;
  reason: string;
  added_at: string;
}

const digits = (s: string): string => s.replace(/\D/g, '');

/**
 * Does any suppression entry match this draft output row?
 * Normalization per key_type: company via normalizeCompanyName, email via
 * lowercase/trim, phone via digits-only comparison.
 */
export function isSuppressed(
  draft: OutputRow,
  list: SuppressionEntry[],
): boolean {
  const channel = draft.contact_email_or_phone.trim();
  return list.some((entry) => {
    switch (entry.key_type) {
      case 'company':
        return (
          normalizeCompanyName(draft.company_name) ===
          normalizeCompanyName(entry.key_value)
        );
      case 'email':
        return (
          channel !== '' &&
          channel.toLowerCase() === entry.key_value.trim().toLowerCase()
        );
      case 'phone':
        return digits(channel) !== '' && digits(channel) === digits(entry.key_value);
    }
  });
}
