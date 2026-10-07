/** The APK reads the published feed only; the scrapers run on the laptop / in CI. */
export { computeRelevanceScore, extractProfileKeywords } from '../../../../../packages/scrapers/src/relevance';
export async function runAllScrapers(): Promise<never[]> {
  return [];
}
