/** Text rules shared by the Outreach composer (renderer) and the review gate (main). */

/** LinkedIn connection notes are cut off by LinkedIn above this length. */
export const LINKEDIN_NOTE_LIMIT = 300;

/** Template gaps the user has not filled: `[Your name]`, `{{company}}`, `<role>`. */
export function findPlaceholders(text: string): string[] {
  const found = text.match(/\[[^\]\n]{1,60}\]|\{\{[^}\n]{0,60}\}\}|<[A-Za-z][^<>\n]{0,40}>/g) ?? [];
  return [...new Set(found)];
}