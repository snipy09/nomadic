/**
 * Simple keyword skill tagger.
 *
 * The vocabulary is a plain `{ skillId: aliases[] }` map so another module (for
 * example the skill graph in packages/learning) can swap it out:
 *
 *   const tagger = createSkillTagger(mySkillGraphVocabulary);
 *   runPipeline({ ..., skillTagger: tagger });
 */

export type SkillVocabulary = Record<string, readonly string[]>;

export interface SkillTagger {
  readonly vocabulary: SkillVocabulary;
  /** Returns canonical skill ids found in the text, in vocabulary order. */
  tag(text: string): string[];
}

export const DEFAULT_SKILL_VOCABULARY: SkillVocabulary = {
  javascript: ['javascript', 'js', 'es6', 'ecmascript'],
  typescript: ['typescript', 'ts'],
  react: ['react', 'react.js', 'reactjs'],
  'react-native': ['react native'],
  nextjs: ['next.js', 'nextjs'],
  vue: ['vue', 'vue.js', 'vuejs', 'nuxt'],
  angular: ['angular', 'angularjs'],
  svelte: ['svelte', 'sveltekit'],
  html: ['html', 'html5'],
  css: ['css', 'css3', 'sass', 'scss', 'tailwind', 'tailwindcss'],
  nodejs: ['node.js', 'nodejs', 'node', 'express', 'express.js', 'nestjs'],
  python: ['python', 'django', 'flask', 'fastapi'],
  java: ['java', 'spring', 'spring boot'],
  kotlin: ['kotlin'],
  swift: ['swift', 'swiftui'],
  flutter: ['flutter', 'dart'],
  go: ['go', 'golang'],
  rust: ['rust'],
  ruby: ['ruby', 'rails', 'ruby on rails'],
  php: ['php', 'laravel'],
  csharp: ['c#', '.net', 'dotnet', 'asp.net'],
  cpp: ['c++', 'cpp'],
  scala: ['scala'],
  elixir: ['elixir', 'phoenix'],
  sql: ['sql', 'mysql', 'postgres', 'postgresql', 'sqlite', 'mssql'],
  nosql: ['mongodb', 'dynamodb', 'cassandra', 'nosql', 'firestore'],
  redis: ['redis'],
  graphql: ['graphql', 'apollo'],
  rest: ['rest api', 'restful', 'rest apis'],
  aws: ['aws', 'amazon web services', 'lambda', 'ec2', 's3'],
  gcp: ['gcp', 'google cloud', 'bigquery'],
  azure: ['azure'],
  docker: ['docker', 'containers'],
  kubernetes: ['kubernetes', 'k8s', 'helm'],
  terraform: ['terraform', 'infrastructure as code', 'pulumi'],
  'ci-cd': ['ci/cd', 'cicd', 'github actions', 'jenkins', 'gitlab ci'],
  linux: ['linux', 'bash', 'shell scripting'],
  git: ['git', 'github', 'gitlab'],
  kafka: ['kafka', 'rabbitmq', 'pub/sub'],
  spark: ['spark', 'pyspark', 'databricks'],
  airflow: ['airflow', 'dbt'],
  'machine-learning': ['machine learning', 'ml', 'scikit-learn', 'sklearn', 'xgboost'],
  'deep-learning': ['deep learning', 'pytorch', 'tensorflow', 'keras'],
  llm: ['llm', 'llms', 'large language model', 'generative ai', 'genai', 'langchain', 'rag', 'prompt engineering'],
  nlp: ['nlp', 'natural language processing'],
  'computer-vision': ['computer vision', 'opencv'],
  'data-analysis': ['data analysis', 'pandas', 'numpy', 'excel', 'tableau', 'power bi', 'looker'],
  statistics: ['statistics', 'a/b testing', 'experimentation'],
  'system-design': ['system design', 'distributed systems', 'microservices', 'scalability'],
  security: ['security', 'owasp', 'penetration testing', 'iam', 'oauth'],
  testing: ['testing', 'jest', 'cypress', 'playwright', 'selenium', 'unit tests', 'qa automation'],
  figma: ['figma', 'sketch', 'adobe xd'],
  'ui-ux': ['ui/ux', 'ux design', 'ui design', 'user research', 'wireframing'],
  android: ['android'],
  ios: ['ios'],
  blockchain: ['blockchain', 'solidity', 'web3', 'ethereum'],
  observability: ['observability', 'prometheus', 'grafana', 'datadog', 'opentelemetry'],
};

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Ambiguous short aliases that only count in a tech-list context (", go,", "with Go", "Go developer"). */
export const DEFAULT_AMBIGUOUS_ALIASES: ReadonlySet<string> = new Set(['go', 'ts', 'js', 'ml', 'rag', 'node', 'spring', 'rest api', 'containers', 'testing', 'security', 'iam', 'swift', 'rust', 'git', 'excel', 'statistics', 'android', 'ios']);

export interface SkillTaggerOptions {
  ambiguousAliases?: ReadonlySet<string>;
}

export function createSkillTagger(
  vocabulary: SkillVocabulary = DEFAULT_SKILL_VOCABULARY,
  options: SkillTaggerOptions = {},
): SkillTagger {
  const ambiguous = options.ambiguousAliases ?? DEFAULT_AMBIGUOUS_ALIASES;
  const compiled = Object.entries(vocabulary).map(([skill, aliases]) => ({
    skill,
    patterns: aliases.map(alias => ({
      alias,
      // Word-ish boundaries that also work for aliases containing symbols (c++, .net, ci/cd).
      re: new RegExp(`(?<![a-z0-9+#.])${escapeRegExp(alias.toLowerCase())}(?![a-z0-9+#])`, 'i'),
    })),
  }));

  return {
    vocabulary,
    tag(text: string): string[] {
      if (!text) return [];
      const lower = text.toLowerCase();
      const found: string[] = [];
      for (const { skill, patterns } of compiled) {
        for (const { alias, re } of patterns) {
          if (!re.test(lower)) continue;
          if (ambiguous.has(alias)) {
            // e.g. "go" in "go-to-market" or "ready to go": require a tech context nearby.
            const ctx = new RegExp(`(?:^|[,/(|•·\\n-]\\s*|\\b(?:in|with|using|and|or)\\s+)${escapeRegExp(alias)}(?:\\s*[,/)|•·\\n]|\\s+(?:and|or|developer|engineer|experience)\\b|$)`, 'i');
            if (!ctx.test(lower)) continue;
          }
          found.push(skill);
          break;
        }
      }
      return found;
    },
  };
}

export const defaultSkillTagger: SkillTagger = createSkillTagger();

/** Convenience wrapper around the default tagger (title + description). */
export function tagSkills(title: string, description = '', tagger: SkillTagger = defaultSkillTagger): string[] {
  return tagger.tag(`${title}\n${description}`);
}
