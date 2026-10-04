/**
 * Learn v2 resources: well-known free references for the new DSA, language,
 * core CS, aptitude and interview content. They were added without a link
 * check (the authoring environment could not reach these hosts), so every row
 * starts `unverified` and the app hides `learn-v2` rows until
 * `npm run check-links -w @job-automator/learning -- --write-seed` marks them
 * active in link-status.json (then rebuild the seed).
 */
import type { LearningResource } from '../../../src/types';

export const V2_RESOURCE_SOURCE = 'learn-v2 curation (link not checked yet)';

type Def = Pick<LearningResource, 'id' | 'title' | 'url' | 'provider' | 'type' | 'skill_ids' | 'level' | 'quality' | 'is_free'>;

const DEFS: Def[] = [
  { id: 'bigocheatsheet', title: 'Big-O Cheat Sheet', url: 'https://www.bigocheatsheet.com/', provider: 'bigocheatsheet.com', type: 'cheatsheet', skill_ids: ['dsa'], level: 1, quality: 4, is_free: true },
  { id: 'mit-6006', title: 'MIT 6.006 Introduction to Algorithms (OpenCourseWare)', url: 'https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/', provider: 'MIT OpenCourseWare', type: 'course', skill_ids: ['dsa'], level: 3, quality: 5, is_free: true },
  { id: 'visualgo', title: 'VisuAlgo: data structures and algorithms visualised', url: 'https://visualgo.net/en', provider: 'VisuAlgo', type: 'interactive', skill_ids: ['dsa'], level: 2, quality: 5, is_free: true },
  { id: 'cses-book', title: 'Competitive Programmer’s Handbook (Antti Laaksonen)', url: 'https://cses.fi/book/book.pdf', provider: 'CSES', type: 'book', skill_ids: ['dsa'], level: 3, quality: 5, is_free: true },
  { id: 'cp-algorithms', title: 'cp-algorithms: algorithms and data structures', url: 'https://cp-algorithms.com/', provider: 'cp-algorithms', type: 'doc', skill_ids: ['dsa'], level: 4, quality: 5, is_free: true },
  { id: 'learncpp', title: 'Learn C++', url: 'https://www.learncpp.com/', provider: 'learncpp.com', type: 'course', skill_ids: ['programming-fundamentals'], level: 1, quality: 5, is_free: true },
  { id: 'cppreference', title: 'C++ containers library reference', url: 'https://en.cppreference.com/w/cpp/container', provider: 'cppreference.com', type: 'doc', skill_ids: ['programming-fundamentals', 'dsa'], level: 2, quality: 5, is_free: true },
  { id: 'dev-java', title: 'Learn Java (dev.java)', url: 'https://dev.java/learn/', provider: 'Oracle (dev.java)', type: 'course', skill_ids: ['programming-fundamentals'], level: 1, quality: 5, is_free: true },
  { id: 'oracle-collections', title: 'The Java Tutorials: Collections', url: 'https://docs.oracle.com/javase/tutorial/collections/', provider: 'Oracle', type: 'doc', skill_ids: ['programming-fundamentals', 'dsa'], level: 2, quality: 4, is_free: true },
  { id: 'python-collections', title: 'Python docs: collections', url: 'https://docs.python.org/3/library/collections.html', provider: 'Python Software Foundation', type: 'doc', skill_ids: ['python', 'programming-fundamentals'], level: 2, quality: 5, is_free: true },
  { id: 'python-heapq', title: 'Python docs: heapq', url: 'https://docs.python.org/3/library/heapq.html', provider: 'Python Software Foundation', type: 'doc', skill_ids: ['python', 'dsa'], level: 2, quality: 5, is_free: true },
  { id: 'python-bisect', title: 'Python docs: bisect', url: 'https://docs.python.org/3/library/bisect.html', provider: 'Python Software Foundation', type: 'doc', skill_ids: ['python', 'dsa'], level: 2, quality: 5, is_free: true },
  { id: 'refactoring-guru', title: 'Refactoring.Guru: design patterns', url: 'https://refactoring.guru/design-patterns', provider: 'Refactoring.Guru', type: 'doc', skill_ids: ['oop'], level: 2, quality: 5, is_free: true },
  { id: 'sqlbolt', title: 'SQLBolt: interactive SQL lessons', url: 'https://sqlbolt.com/', provider: 'SQLBolt', type: 'interactive', skill_ids: ['sql', 'dbms'], level: 1, quality: 5, is_free: true },
  { id: 'postgresql-tutorial', title: 'PostgreSQL documentation: tutorial', url: 'https://www.postgresql.org/docs/current/tutorial.html', provider: 'PostgreSQL Global Development Group', type: 'doc', skill_ids: ['postgresql', 'dbms', 'sql'], level: 1, quality: 5, is_free: true },
  { id: 'use-the-index-luke', title: 'Use The Index, Luke: SQL indexing', url: 'https://use-the-index-luke.com/', provider: 'Markus Winand', type: 'book', skill_ids: ['dbms', 'advanced-sql'], level: 3, quality: 5, is_free: true },
  { id: 'ostep', title: 'Operating Systems: Three Easy Pieces', url: 'https://pages.cs.wisc.edu/~remzi/OSTEP/', provider: 'Remzi and Andrea Arpaci-Dusseau', type: 'book', skill_ids: ['operating-systems'], level: 3, quality: 5, is_free: true },
  { id: 'mdn-http-overview', title: 'MDN: An overview of HTTP', url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview', provider: 'Mozilla (MDN)', type: 'doc', skill_ids: ['http-fundamentals', 'computer-networks'], level: 1, quality: 5, is_free: true },
  { id: 'cloudflare-learning', title: 'Cloudflare Learning Center: what is DNS?', url: 'https://www.cloudflare.com/learning/dns/what-is-dns/', provider: 'Cloudflare', type: 'article', skill_ids: ['computer-networks', 'networking'], level: 1, quality: 4, is_free: true },
  { id: 'system-design-primer', title: 'The System Design Primer', url: 'https://github.com/donnemartin/system-design-primer', provider: 'GitHub (donnemartin)', type: 'doc', skill_ids: ['system-design'], level: 3, quality: 5, is_free: true },
  { id: 'indiabix-aptitude', title: 'IndiaBIX: aptitude questions', url: 'https://www.indiabix.com/aptitude/questions-and-answers/', provider: 'IndiaBIX', type: 'problem', skill_ids: ['aptitude-quant'], level: 1, quality: 3, is_free: true },
  { id: 'indiabix-logical', title: 'IndiaBIX: logical reasoning questions', url: 'https://www.indiabix.com/logical-reasoning/questions-and-answers/', provider: 'IndiaBIX', type: 'problem', skill_ids: ['aptitude-logical'], level: 1, quality: 3, is_free: true },
  { id: 'indiabix-verbal', title: 'IndiaBIX: verbal ability questions', url: 'https://www.indiabix.com/verbal-ability/questions-and-answers/', provider: 'IndiaBIX', type: 'problem', skill_ids: ['aptitude-verbal'], level: 1, quality: 3, is_free: true },
  { id: 'khan-academy-math', title: 'Khan Academy: math', url: 'https://www.khanacademy.org/math', provider: 'Khan Academy', type: 'course', skill_ids: ['aptitude-quant'], level: 1, quality: 4, is_free: true },
  { id: 'tih-resume', title: 'Tech Interview Handbook: resume', url: 'https://www.techinterviewhandbook.org/resume/', provider: 'Tech Interview Handbook', type: 'article', skill_ids: ['behavioral-interviews'], level: 1, quality: 4, is_free: true },
  { id: 'tih-behavioral', title: 'Tech Interview Handbook: behavioral interviews', url: 'https://www.techinterviewhandbook.org/behavioral-interview/', provider: 'Tech Interview Handbook', type: 'article', skill_ids: ['behavioral-interviews'], level: 1, quality: 4, is_free: true },
];

export const V2_RESOURCE_DEFS = DEFS.map((d) => ({ ...d, duration_minutes: null, source: V2_RESOURCE_SOURCE }));
