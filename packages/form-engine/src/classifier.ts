import type { FieldKey, FormField } from './types.js';

const has = (s: string, re: RegExp) => re.test(s);

/**
 * Deterministic field -> profile key mapping. Order matters: specific intents first, generic names last.
 * The label carries the strongest signal; hints (name/id/autocomplete) are the fallback.
 */
export function classifyField(f: FormField): FieldKey {
  const label = f.label.toLowerCase();
  const hints = f.hints.toLowerCase();
  const both = `${label} ${hints}`;

  if (f.kind === 'file') {
    if (has(both, /cover/)) return 'coverLetterFile';
    return 'resume';
  }

  // Single checkbox that is an agreement/consent.
  if (f.kind === 'checkbox' && f.options.length <= 1 && has(label, /agree|consent|acknowledg|certify|accept|privacy|terms|i have read|i understand|authori[sz]e/))
    return 'consent';

  if (has(both, /gender identity|\bgender\b|\bsex\b/) && !has(label, /pronoun/)) return 'eeoGender';
  if (has(both, /pronoun/)) return 'pronouns';
  if (has(both, /\brace\b|ethnic|hispanic|latino/)) return 'eeoRace';
  if (has(both, /veteran|military/)) return 'eeoVeteran';
  if (has(both, /disabilit/)) return 'eeoDisability';

  if (has(label, /sponsor/) || has(label, /(require|need).{0,25}visa|visa.{0,25}(require|need)/)) return 'sponsorship';
  if (has(label, /(legally|lawfully)?\s*(authori[sz]ed|eligible|permitted|right) (to work)|work authori[sz]ation|authori[sz]ed to work|eligible to work/)) return 'workAuthorization';
  const choiceLike = f.kind === 'radio' || f.kind === 'select' || f.kind === 'combobox' || f.kind === 'checkbox';
  if (choiceLike && has(label, /relocat|on-?site|in[- ]office|in[- ]person|hybrid|days (a|per) week|work from (our|the) .*office|comfortable working/)) return 'relocate';
  if (has(label, /how did you (hear|find)|where did you (hear|find)|referral source|source of (application|referral)/)) return 'referral';

  // Structured autocomplete hints are authoritative when present.
  if (has(hints, /\bgiven-name\b/)) return 'firstName';
  if (has(hints, /\bfamily-name\b/)) return 'lastName';

  if (has(both, /first[\s_-]?name|given[\s_-]?name|\bfname\b|preferred first/)) return 'firstName';
  if (has(both, /last[\s_-]?name|family[\s_-]?name|surname|\blname\b/)) return 'lastName';
  if (has(both, /e-?mail/)) return 'email';
  if (has(both, /phone|mobile|\btel\b|contact number|whatsapp|cell/)) return 'phone';
  if (has(both, /linkedin/)) return 'linkedin';
  if (has(both, /github/)) return 'github';
  if (has(both, /twitter|\bx\.com|x \(twitter\)/)) return 'twitter';
  if (has(both, /portfolio|website|personal (site|url|page)|\bblog\b|homepage|other link|link to your/)) return 'portfolio';

  if (has(label, /current (company|employer|organi[sz]ation)|most recent (company|employer)|present (company|employer)|^(current )?employer|^company( name)?$|^organi[sz]ation$/)) return 'currentCompany';
  if (has(label, /^headline$|professional headline|current (job )?(title|role|position)|most recent (job )?(title|role)|^(job )?title$|^current role$/)) return 'currentTitle';
  if (has(label, /years? of (relevant |total |professional |work )?experience|experience \(?in years|total experience|how many years/)) return 'yearsExperience';
  if (has(label, /(current|present|existing|last drawn|last|annual).{0,20}(salary|ctc|compensation|pay)|(salary|ctc|compensation).{0,15}(current|present|last drawn)/)) return 'currentSalary';
  if (has(label, /salary|compensation|\bctc\b|pay expectation|expected pay/)) return 'salary';
  if (has(label, /notice period|start date|earliest.*start|when (can|could|would) you (start|join)|availab(le|ility) (to start|from)|how soon|joining date|date of joining/)) return 'noticePeriod';

  if (has(label, /address line|street|house (no|number)|flat|apartment|^address line ?\d?$/) || has(hints, /address-line|street-address/)) return 'address';
  if (has(label, /postal|zip|pin ?code/) || has(hints, /postal-code/)) return 'postalCode';
  if (has(label, /^state|province|^region$/) || has(hints, /address-level1/)) return 'state';
  if (has(label, /^country|country of residence|country\/region/)) return 'country';
  if (has(label, /\bcity\b|^town/)) return 'city';
  if (has(label, /location|where are you (based|located)|current (residence|address)|^address$|based in/) || has(hints, /\blocation\b|address-level2/)) return 'location';

  if (f.kind === 'textarea' || f.kind === 'richtext') {
    if (has(label, /cover letter|why (do you want|are you interested|us\b|this (role|company)|should (we|you)|you('re| are) (a )?(good|right|fit))|why hire|hire you|motivat|interest in/)) return 'coverLetterText';
    if (has(label, /about (you|yourself)|summary|bio\b|introduce|additional information|anything else|tell us/)) return 'summary';
  }

  // Full name last: many labels contain "name" (company name, etc.).
  if (has(label, /^(your |full |legal |candidate |applicant )?name$|^full[\s_-]?name|your (full |legal )?name|legal name/) || has(hints, /_systemfield_name|\bfullname\b|full_name|^name$|\bname name\b|\bname\b$/) && !has(label, /company|employer|school|university|reference|manager|organi/))
    return 'fullName';

  return 'unknown';
}
