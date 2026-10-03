/**
 * Curated resource library seed.
 *
 * RULE: only URLs that already exist in the repository's data are included.
 * Nothing here was invented. Every row starts as `unverified`; the link
 * checker (scripts/check-links.ts) promotes rows to `active` or hides them as
 * `broken`. Titles taken from repo data that could not be confirmed against
 * the target page carry quality 3 and a "verify title" note in `source`.
 *
 * Search-result pages and placeholder links found in the repo are listed in
 * EXCLUDED_RESOURCES with the reason they were rejected, so curators can find
 * real replacements.
 */
import type { LearningResource } from '../../src/types';

type ResourceDef = Pick<
  LearningResource,
  'id' | 'title' | 'url' | 'provider' | 'type' | 'skill_ids' | 'level' | 'quality' | 'is_free' | 'source'
> & { duration_minutes?: number | null };

export const RESOURCE_DEFS: ResourceDef[] = [
  // From apps/desktop/src/renderer/data/roadmaps.ts
  { id: 'mdn-learn-html', title: 'MDN Web Docs: Learn HTML', url: 'https://developer.mozilla.org/en-US/docs/Learn/HTML', provider: 'Mozilla (MDN)', type: 'doc', skill_ids: ['html', 'accessibility'], level: 1, quality: 5, is_free: true, source: 'roadmaps.ts frontend/html-css-dom' },
  { id: 'fcc-css-grid-flexbox', title: 'CSS Grid & Flexbox Complete Masterclass', url: 'https://www.youtube.com/watch?v=rg7Fvvl3taU', provider: 'YouTube / freeCodeCamp', type: 'video', duration_minutes: 150, skill_ids: ['css-layout', 'css'], level: 2, quality: 3, is_free: true, source: 'roadmaps.ts frontend/html-css-dom (verify title)' },
  { id: 'javascript-info', title: 'The Modern JavaScript Tutorial (javascript.info)', url: 'https://javascript.info', provider: 'javascript.info', type: 'doc', skill_ids: ['javascript', 'async-javascript', 'dom-apis'], level: 1, quality: 5, is_free: true, source: 'roadmaps.ts frontend/javascript-es6' },
  { id: 'jsconf-event-loop', title: 'What the heck is the event loop anyway? (Philip Roberts, JSConf)', url: 'https://www.youtube.com/watch?v=8aGhZQkoFbQ', provider: 'JSConf / YouTube', type: 'video', duration_minutes: 27, skill_ids: ['async-javascript', 'nodejs'], level: 2, quality: 5, is_free: true, source: 'roadmaps.ts frontend/javascript-es6; db.ts curated_learning_resources' },
  { id: 'google-api-design-guide', title: 'API Design Guide (Google Cloud)', url: 'https://cloud.google.com/apis/design', provider: 'Google Cloud', type: 'doc', skill_ids: ['rest-api-design'], level: 2, quality: 4, is_free: true, source: 'roadmaps.ts backend/backend-apis' },
  { id: 'gv-user-interviews', title: 'How to Conduct User Interviews (GV Library)', url: 'https://library.gv.com/how-to-conduct-user-interviews-9b48b77054a8', provider: 'GV', type: 'article', skill_ids: ['product-discovery', 'usability-testing'], level: 1, quality: 4, is_free: true, source: 'roadmaps.ts product-management/pm-foundations' },
  { id: 'posthog-docs', title: 'PostHog Docs: Product Analytics, Funnels & Experiments', url: 'https://posthog.com/docs', provider: 'PostHog', type: 'doc', skill_ids: ['product-analytics', 'ab-testing'], level: 2, quality: 3, is_free: true, source: 'roadmaps.ts product-management/pm-metrics' },
  { id: 'material-design-3', title: 'Material Design 3 Guidelines', url: 'https://m3.material.io', provider: 'Google', type: 'doc', skill_ids: ['design-principles', 'design-systems', 'color-theory', 'typography'], level: 1, quality: 5, is_free: true, source: 'roadmaps.ts ui-ux-design/ui-foundations' },

  // From apps/desktop/src/renderer/data/resourceVault.ts (textbooks + cheatsheets)
  { id: 'ddia-book', title: 'Designing Data-Intensive Applications (Martin Kleppmann)', url: 'https://dataintensive.net', provider: "O'Reilly / Martin Kleppmann", type: 'book', skill_ids: ['system-design', 'postgresql', 'message-queues'], level: 4, quality: 5, is_free: false, source: 'resourceVault.ts book-ddia readUrl' },
  { id: 'ddia-references', title: 'DDIA chapter references (GitHub)', url: 'https://github.com/ept/ddia-references', provider: 'GitHub', type: 'doc', skill_ids: ['system-design'], level: 4, quality: 3, is_free: true, source: 'resourceVault.ts book-ddia notesDocUrl' },
  { id: 'clean-code-book', title: 'Clean Code (Robert C. Martin)', url: 'https://www.oreilly.com/library/view/clean-code-a/9780136083238/', provider: "O'Reilly", type: 'book', skill_ids: ['programming-fundamentals', 'testing-fundamentals'], level: 2, quality: 4, is_free: false, source: 'resourceVault.ts book-clean-code readUrl' },
  { id: 'bytebytego', title: 'ByteByteGo: System Design Interview (Alex Xu)', url: 'https://bytebytego.com', provider: 'ByteByteGo', type: 'course', skill_ids: ['system-design'], level: 4, quality: 4, is_free: false, source: 'resourceVault.ts book-system-design readUrl' },
  { id: 'you-dont-know-js', title: "You Don't Know JS Yet (Kyle Simpson)", url: 'https://github.com/getify/You-Dont-Know-JS', provider: 'GitHub', type: 'book', skill_ids: ['javascript', 'async-javascript'], level: 2, quality: 5, is_free: true, source: 'resourceVault.ts book-ydkjs readUrl' },
  { id: 'cracking-the-pm-interview', title: 'Cracking the PM Interview (McDowell & Bavaro)', url: 'https://crackingthepminterview.com', provider: 'CareerCup', type: 'book', skill_ids: ['product-sense', 'behavioral-interviews'], level: 2, quality: 4, is_free: false, source: 'resourceVault.ts book-cracking-pm readUrl' },
  { id: 'react-dev', title: 'React Documentation (react.dev)', url: 'https://react.dev', provider: 'React (Meta)', type: 'doc', skill_ids: ['react', 'react-state-management'], level: 2, quality: 5, is_free: true, source: 'resourceVault.ts cs-react18 viewUrl' },
  { id: 'postgresql-org', title: 'PostgreSQL Official Site & Documentation', url: 'https://postgresql.org', provider: 'PostgreSQL Global Development Group', type: 'doc', skill_ids: ['postgresql', 'sql'], level: 3, quality: 4, is_free: true, source: 'resourceVault.ts cs-sql-indexes viewUrl' },
  { id: 'kubernetes-io', title: 'Kubernetes Documentation', url: 'https://kubernetes.io', provider: 'CNCF', type: 'doc', skill_ids: ['kubernetes'], level: 3, quality: 5, is_free: true, source: 'resourceVault.ts cs-docker-k8s viewUrl' },

  // From apps/desktop/src/main/db.ts curated_learning_resources seed
  { id: 'yt-nextjs-server-components', title: 'Next.js Full Stack Architecture & Server Components', url: 'https://www.youtube.com/watch?v=wm5gMKuwSYk', provider: 'YouTube', type: 'video', duration_minutes: 35, skill_ids: ['nextjs', 'fullstack-architecture'], level: 3, quality: 3, is_free: true, source: 'db.ts curated_learning_resources (verify title)' },
  { id: 'yt-distributed-cache-redis', title: 'System Design: Distributed Cache & Redis', url: 'https://www.youtube.com/watch?v=iuqZvajTOyA', provider: 'YouTube', type: 'video', duration_minutes: 45, skill_ids: ['caching', 'system-design'], level: 3, quality: 3, is_free: true, source: 'db.ts curated_learning_resources (verify title)' },
  { id: 'yt-docker-kubernetes-pipelines', title: 'Docker & Kubernetes Deployment', url: 'https://www.youtube.com/watch?v=X48VuDVv0do', provider: 'YouTube', type: 'video', duration_minutes: 40, skill_ids: ['docker', 'kubernetes'], level: 2, quality: 3, is_free: true, source: 'db.ts curated_learning_resources (verify title)' },
  { id: 'yt-postgresql-indexing', title: 'PostgreSQL Performance Tuning & Indexing', url: 'https://www.youtube.com/watch?v=clqv_X5q8QY', provider: 'YouTube', type: 'video', duration_minutes: 30, skill_ids: ['postgresql'], level: 3, quality: 3, is_free: true, source: 'db.ts curated_learning_resources (verify title)' },

  // From leetcodeCompaniesDataset.json / InterviewPrep links (practice problems)
  { id: 'leetcode-problemset', title: 'LeetCode Problem Set', url: 'https://leetcode.com/problemset/all/', provider: 'LeetCode', type: 'problem', skill_ids: ['dsa'], level: 3, quality: 4, is_free: true, source: 'InterviewPrep links' },
  { id: 'leetcode-two-sum', title: 'LeetCode: Two Sum', url: 'https://leetcode.com/problems/two-sum', provider: 'LeetCode', type: 'problem', skill_ids: ['dsa'], level: 2, quality: 4, is_free: true, source: 'leetcodeCompaniesDataset.json' },
  { id: 'leetcode-number-of-islands', title: 'LeetCode: Number of Islands', url: 'https://leetcode.com/problems/number-of-islands', provider: 'LeetCode', type: 'problem', skill_ids: ['dsa'], level: 3, quality: 4, is_free: true, source: 'leetcodeCompaniesDataset.json' },
  { id: 'leetcode-merge-intervals', title: 'LeetCode: Merge Intervals', url: 'https://leetcode.com/problems/merge-intervals', provider: 'LeetCode', type: 'problem', skill_ids: ['dsa'], level: 3, quality: 4, is_free: true, source: 'leetcodeCompaniesDataset.json' },
  { id: 'leetcode-longest-substring', title: 'LeetCode: Longest Substring Without Repeating Characters', url: 'https://leetcode.com/problems/longest-substring-without-repeating-characters', provider: 'LeetCode', type: 'problem', skill_ids: ['dsa'], level: 3, quality: 4, is_free: true, source: 'leetcodeCompaniesDataset.json' },
  { id: 'leetcode-lru-cache', title: 'LeetCode: LRU Cache', url: 'https://leetcode.com/problems/lru-cache/', provider: 'LeetCode', type: 'problem', skill_ids: ['dsa', 'caching'], level: 3, quality: 4, is_free: true, source: 'leetcodePremiumDataset.ts / resourceVault q-dsa-lru-cache' },
  { id: 'leetcode-trapping-rain-water', title: 'LeetCode: Trapping Rain Water', url: 'https://leetcode.com/problems/trapping-rain-water/', provider: 'LeetCode', type: 'problem', skill_ids: ['dsa'], level: 4, quality: 4, is_free: true, source: 'leetcodePremiumDataset.ts' },
  { id: 'leetcode-median-two-sorted-arrays', title: 'LeetCode: Median of Two Sorted Arrays', url: 'https://leetcode.com/problems/median-of-two-sorted-arrays/', provider: 'LeetCode', type: 'problem', skill_ids: ['dsa'], level: 5, quality: 4, is_free: true, source: 'leetcodePremiumDataset.ts' },
];

/** Links found in the repo that are NOT curated content, and why. */
export const EXCLUDED_RESOURCES: Array<{ title: string; url: string; reason: string; suggested_skill_ids: string[]; source: string }> = [
  { title: 'The Mom Test: How to Talk to Customers (Summary Guide)', url: 'https://www.youtube.com/results?search_query=the+mom+test+summary', reason: 'search_results_page', suggested_skill_ids: ['product-discovery'], source: 'roadmaps.ts' },
  { title: 'Sizing Markets: TAM, SAM, and SOM Guide', url: 'https://www.youtube.com/results?search_query=TAM+SAM+SOM+product+management', reason: 'search_results_page', suggested_skill_ids: ['market-research'], source: 'roadmaps.ts' },
  { title: "Lenny's Newsletter: How to Write a High-Standard PRD", url: 'https://google.com/search?q=lenny+rachitsky+how+to+write+a+prd', reason: 'search_results_page', suggested_skill_ids: ['prd-writing'], source: 'roadmaps.ts' },
  { title: 'PRD Masterclass & Walkthrough', url: 'https://www.youtube.com/results?search_query=how+to+write+a+product+requirements+document', reason: 'search_results_page', suggested_skill_ids: ['prd-writing'], source: 'roadmaps.ts' },
  { title: 'Designing North Star Metrics (Reforge Methodology)', url: 'https://www.youtube.com/results?search_query=north+star+metric+product+management', reason: 'search_results_page', suggested_skill_ids: ['product-analytics'], source: 'roadmaps.ts' },
  { title: 'Refactoring UI: Practical Design Principles', url: 'https://www.youtube.com/results?search_query=refactoring+ui+principles', reason: 'search_results_page', suggested_skill_ids: ['design-principles'], source: 'roadmaps.ts' },
  { title: 'Figma Auto Layout In-Depth Tutorial', url: 'https://www.youtube.com/results?search_query=figma+auto+layout+masterclass', reason: 'search_results_page', suggested_skill_ids: ['figma-auto-layout'], source: 'roadmaps.ts' },
  { title: 'Full Stack Architecture Masterclass', url: 'https://www.youtube.com/results?search_query=full+stack+web+architecture', reason: 'search_results_page', suggested_skill_ids: ['fullstack-architecture'], source: 'roadmaps.ts' },
  { title: 'RAG Architecture & Vector Embeddings Deep Dive', url: 'https://www.youtube.com/results?search_query=rag+architecture+vector+database', reason: 'search_results_page', suggested_skill_ids: ['rag-vector-search'], source: 'roadmaps.ts' },
  { title: 'Docker & Kubernetes Mastery (Bret Fisher)', url: 'https://www.youtube.com/results?search_query=docker+and+kubernetes+mastery', reason: 'search_results_page', suggested_skill_ids: ['docker', 'kubernetes'], source: 'roadmaps.ts' },
  { title: 'Video walkthrough placeholders (6 vault questions)', url: 'https://youtube.com', reason: 'placeholder_homepage', suggested_skill_ids: ['dsa', 'system-design', 'react', 'advanced-sql', 'product-sense'], source: 'resourceVault.ts videoWalkthroughUrl' },
  { title: 'LeetCode solutions mirror (URL prefix only)', url: 'https://walkccc.me/LeetCode/problems/', reason: 'incomplete_url_template', suggested_skill_ids: ['dsa'], source: 'renderer components' },
];
