/** Primitive schemas shared by the v1 and v2 learning models (no imports from either). */
import { z } from 'zod';

export const ROLE_FAMILY_IDS = [
  'frontend',
  'backend',
  'fullstack',
  'data-analyst',
  'data-ml',
  'product-manager',
  'design',
  'devops',
] as const;
export const RoleFamilyIdSchema = z.enum(ROLE_FAMILY_IDS);
export type RoleFamilyId = z.infer<typeof RoleFamilyIdSchema>;

/** Kebab-case identifier used for skills, lessons, items and resources. */
export const SlugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:[-:.][a-z0-9]+)*$/, 'must be a lowercase kebab-case slug');

/** Editorial lifecycle for content rows (lessons, practice items). */
export const ContentStatusSchema = z.enum(['draft', 'review', 'published', 'archived']);
export type ContentStatus = z.infer<typeof ContentStatusSchema>;

export const UuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'must be a UUID');
