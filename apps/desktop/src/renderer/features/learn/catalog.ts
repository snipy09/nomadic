/**
 * The Learn v2 catalogue for the renderer: modules, topics, problems and
 * projects from the reviewed seed bundle, indexed once. Every link shown comes
 * from the bundle's problems (LeetCode) and curated resources.
 */
import { indexCatalog, type CatalogIndex, type LearnModule, type LearnTopic, type ProblemInfo, type Project } from '@job-automator/learning';
import { bundle } from './content';

let index: CatalogIndex | null = null;

export function learnIndex(): CatalogIndex {
  if (!index) index = indexCatalog(bundle);
  return index;
}

export const moduleById = (id: string): LearnModule | undefined => learnIndex().modules.get(id);
export const topicById = (id: string): LearnTopic | undefined => learnIndex().topics.get(id);
export const problemByRef = (ref: string): ProblemInfo | undefined => learnIndex().problems.get(ref);
export const projectById = (id: string): Project | undefined => learnIndex().projects.get(id);
export const allProjects = (): Project[] => learnIndex().catalog.projects;
