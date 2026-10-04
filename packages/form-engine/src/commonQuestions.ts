/**
 * Open questions that many application forms ask in different words ("Tell us about
 * yourself", "Introduce yourself", ...). The candidate answers each once (onboarding or
 * the Answers page); the answer is reused wherever a form's label matches one of the
 * patterns. Only questions that do not depend on the company are listed here.
 */
export interface CommonQuestion {
  id: string;
  /** The wording shown to the candidate. */
  question: string;
  patterns: RegExp[];
}

export const COMMON_QUESTIONS: readonly CommonQuestion[] = [
  {
    id: 'about_you',
    question: 'Tell us about yourself',
    patterns: [/tell (us|me) (a (little|bit) )?about yourself/, /introduce yourself/, /^about (you|yourself|me)$/, /brief (summary|introduction|bio)/, /professional summary/],
  },
  {
    id: 'proud_project',
    question: 'Describe a project you are proud of',
    patterns: [/project (you are|you're|that you are) (most )?proud/, /(describe|tell us about) (a|one) (project|thing you('ve| have) built)/, /most (challenging|interesting|impressive) project/],
  },
  {
    id: 'strengths',
    question: 'What are your key strengths?',
    patterns: [/(your|key|greatest|biggest) strengths?/, /what are you (best|good) at/],
  },
  {
    id: 'looking_for',
    question: 'What are you looking for in your next role?',
    patterns: [/looking for in (your|a|the) (next )?(role|job|position|opportunity|internship)/, /what (kind|type) of (role|work|opportunit)/, /career goals?/, /where do you see yourself/],
  },
  {
    id: 'why_change',
    question: 'Why are you looking for a new opportunity?',
    patterns: [/why are you (looking|leaving|seeking)/, /reason for (leaving|change|switch)/, /why (do you want to|are you) (change|switch|leave)/],
  },
];

const normLabel = (s: string) => s.toLowerCase().replace(/[*:?]+/g, ' ').replace(/\s+/g, ' ').trim();

/** The common question a form label asks, if any. */
export function matchCommonQuestion(label: string): CommonQuestion | undefined {
  const l = normLabel(label);
  if (!l || l.length > 300) return undefined;
  return COMMON_QUESTIONS.find((q) => q.patterns.some((p) => p.test(l)));
}
