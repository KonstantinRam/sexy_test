// Persona classification: how good a decision-maker target a role is.
// Priority per challenge/CLARIFICATIONS.md: AP/accounts payable, then
// owner/founder/president, then CFO/finance, then (office) manager.

/**
 * Lower rank = better target. 5 = unknown role (still a usable human).
 * 'excluded' = never a target: a Registered Agent is usually a law firm or
 * filing service, not the business itself.
 */
export type PersonaRank = 1 | 2 | 3 | 4 | 5 | 'excluded';

export function classifyPersona(role: string | null): PersonaRank {
  if (role === null) return 5;
  const r = role.toLowerCase();
  if (r.includes('registered agent')) return 'excluded';
  if (/\baccounts?\s+payable\b|\bap\b/.test(r)) return 1;
  if (/\b(owner|founder|president)\b/.test(r)) return 2;
  if (/\bcfo\b|\bfinance\b/.test(r)) return 3;
  if (/\bmanager\b/.test(r)) return 4;
  return 5;
}
