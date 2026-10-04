/**
 * Region filter. Nomadic is for students in India, so by default the pipeline keeps only jobs a
 * candidate in India can take: located in India, or remote without a country restriction that
 * excludes India. Sources that only list Indian jobs (Internshala, Naukri, Indeed India) skip the check.
 */

export type Region = 'india' | 'all';

const INDIA =
  /\b(india|indian|bharat|bengaluru|bangalore|mumbai|navi mumbai|thane|pune|hyderabad|secunderabad|chennai|delhi|new delhi|ncr|gurgaon|gurugram|noida|greater noida|faridabad|kolkata|ahmedabad|gandhinagar|jaipur|kochi|cochin|coimbatore|chandigarh|mohali|indore|bhopal|trivandrum|thiruvananthapuram|mysore|mysuru|mangalore|mangaluru|nagpur|bhubaneswar|vadodara|surat|lucknow|visakhapatnam|vizag|goa|dehradun|patna|ranchi|guwahati)\b/i;

/** Remote with no place, or a place that includes India. */
const OPEN_REMOTE = /\b(worldwide|anywhere|global|globally|apac|asia|asia[\s-]?pacific|south asia|emerging markets)\b/i;

export function parseRegion(value: string | undefined): Region {
  return value?.trim().toLowerCase() === 'all' ? 'all' : 'india';
}

export function isIndiaEligible(job: { location: string; remote: boolean }): boolean {
  const location = job.location.trim();
  if (INDIA.test(location)) return true;
  if (!job.remote) return false;
  // "Remote", "" or "Remote - Worldwide": open to India. "Remote (US only)", "Remote, Europe": not.
  const place = location.replace(/\b(remote|fully remote|work from home|wfh)\b/gi, '').replace(/[\s,;:/()|–-]+/g, ' ').trim();
  return place === '' || OPEN_REMOTE.test(place);
}
