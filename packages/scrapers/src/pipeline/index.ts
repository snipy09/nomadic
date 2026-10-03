/** Public API of the job pipeline (CLI, workflows, admin tooling). */
export { JobSchema, parseJob, SOURCE_IDS, ROLE_FAMILIES, SENIORITIES } from '../job-schema.js';
export type { Job, JobCandidate, PipelineJob, SourceId, RoleFamily, Seniority, LinkStatus } from '../job-schema.js';
export { SOURCES, selectSources, getSource } from '../sources/registry.js';
export type { SourceDefinition, SourceContext, SourceSelection, Tier } from '../sources/registry.js';
export { runPipeline, computeAlert } from './run.js';
export type { PipelineOptions, PipelineReport, SourceStats } from './run.js';
export { MemoryJobStore, SupabaseJobStore, getRecentScrapeRuns, toJobRow, jobHashFor } from './store.js';
export type { JobStore, JobRow, ScrapeRunRow, RecentRunsOptions } from './store.js';
export { dedupeJobs } from './dedupe.js';
export { validateLinks, checkLink } from './link-validate.js';
export { classifyRoleFamily, classifySeniority } from './classify.js';
export { scoreJob } from './score.js';
export { formatBenchMarkdown, formatRunTable } from './report.js';
