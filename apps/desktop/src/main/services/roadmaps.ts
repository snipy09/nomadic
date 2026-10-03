import type { AiJson, CustomRoadmapParams, OnboardingProfileParams, RoadmapExplanationInput, RoadmapExplanationResult } from '../../shared/ipc.js';
import { aiProxy } from './ai-proxy.js';
import { saveCustomRoadmapDb } from '../db.js';
import { log } from './app-context.js';

/**
 * AI generation for the Learner hub: onboarding profile synthesis and custom
 * career roadmaps. Both fall back to deterministic templates when the AI call
 * fails, and persist the resulting roadmap to `custom_roadmaps`.
 */

// ── AI Onboarding Profile Generator ─────────────────────────────────────────
// Curated, stable resource links used when AI synthesis fails. Deliberately role-agnostic:
// never point at search result pages (YouTube/Google), which are not real resources.
const CURATED_FALLBACK_RESOURCES = {
  VIDEO: { url: 'https://www.youtube.com/@freecodecamp', type: 'video', duration: '30 mins' },
  PRACTICE: { url: 'https://www.freecodecamp.org/learn', type: 'video', duration: '40 mins' },
  DOCS: { url: 'https://roadmap.sh', type: 'doc' },
  INTERVIEW: { url: 'https://www.themuse.com/advice/star-interview-method', type: 'guide' },
};

export async function generateAiOnboardingProfile(
  params: OnboardingProfileParams
): Promise<{ success: boolean; profile?: AiJson; roadmap?: AiJson }> {
  const { targetRole, customSkills, targetHorizon, dailyCommitment } = params;
  const horizon = targetHorizon || '3 Months';
  const commitment = dailyCommitment || '2 Hours/Day';
  log(`[Onboarding] Building starter roadmap for: "${targetRole}" (${horizon}, ${commitment})...`);

  // Not an ai-proxy task: the profile is never synthesized by a model (decision 25 and
  // "AI never invents profile data"). The deterministic roadmap below is used.
  // Universal fallback profile & roadmap
  const fallbackSkills = (customSkills && customSkills.length > 0)
    ? customSkills.join(', ')
    : 'Strategy, Execution, Workflow Automation, Analytics, Leadership';

  const fallbackId = `roadmap-${Date.now()}`;
  const fallbackRoadmap = {
    id: fallbackId,
    title: `${targetRole || 'Career'} Acceleration Roadmap`,
    domain: 'Professional Track',
    targetRoles: [targetRole || 'Specialist'],
    targetHorizon: '2 Months',
    dailyCommitment: '2 Hours/Day',
    milestones: [
      {
        id: 'phase-1',
        title: 'Phase 1: Foundations & Core Principles',
        level: 'Foundations',
        difficulty: 'Beginner',
        estimatedHours: 20,
        description: 'Master core principles, terminology, and essential daily toolsets.',
        skills: fallbackSkills.split(',').slice(0, 2).map(s => s.trim()),
        subModules: [
          {
            id: 'sub-1-1',
            title: 'Core Fundamentals & Standards',
            description: 'Industry mental models, standard operating procedures, and basic workflows.',
            keyConcepts: ['Foundational theory', 'Workflow standards', 'Core tool setup'],
            resources: [
              { ...CURATED_FALLBACK_RESOURCES.VIDEO, title: 'Foundational Overview & Standards' },
              { ...CURATED_FALLBACK_RESOURCES.DOCS, title: 'Industry Best Practices Reference' }
            ]
          }
        ]
      },
      {
        id: 'phase-2',
        title: 'Phase 2: Intermediate Execution & Deliverables',
        level: 'Core Practice',
        difficulty: 'Intermediate',
        estimatedHours: 30,
        description: 'Hands-on practical projects, artifact generation, and cross-functional workflows.',
        skills: fallbackSkills.split(',').slice(2, 4).map(s => s.trim()),
        subModules: [
          {
            id: 'sub-2-1',
            title: 'Hands-On Execution & Project Management',
            description: 'Creating high-impact deliverables and tracking performance.',
            keyConcepts: ['Deliverable structuring', 'Feedback loops', 'Quality assurance'],
            resources: [
              { ...CURATED_FALLBACK_RESOURCES.PRACTICE, title: 'Practical Implementation Guide' }
            ]
          }
        ]
      },
      {
        id: 'phase-3',
        title: 'Phase 3: Production Scale & Interview Readiness',
        level: 'Interview Ready',
        difficulty: 'Advanced',
        estimatedHours: 25,
        description: 'Advanced optimization, portfolio defense, and bar-raiser mock interviews.',
        skills: ['Portfolio Presentation', 'Interview Mastery'],
        subModules: [
          {
            id: 'sub-3-1',
            title: 'Portfolio Showcase & Case Defense',
            description: 'Structuring your achievements with metrics and acing competency rounds.',
            keyConcepts: ['STAR methodology', 'Portfolio review', 'Negotiation strategy'],
            resources: [
              { ...CURATED_FALLBACK_RESOURCES.INTERVIEW, title: 'Top Interview Questions & STAR Framework' }
            ]
          }
        ]
      }
    ]
  };

  saveCustomRoadmapDb(fallbackId, targetRole || 'Career', 'Professional Track', JSON.stringify(fallbackRoadmap), '2 Months', '2 Hours/Day');

  return {
    success: true,
    profile: {
      desiredTitle: targetRole || 'Specialist',
      techStack: fallbackSkills,
      desiredSalary: '₹12 LPA – ₹26 LPA · $90k – $150k',
      summaryHeadline: `Dedicated ${targetRole || 'Professional'} focused on building high-impact deliverables and scalable outcomes.`,
    },
    roadmap: fallbackRoadmap
  };
}

// ── Dynamic Custom Roadmap Generator ────────────────────────────────────────
export async function generateCustomRoadmap(
  params: CustomRoadmapParams
): Promise<{ success: boolean; roadmap?: AiJson }> {
  const { roleTitle, customTitle, targetHorizon, dailyCommitment } = params;
  const preferredTitle = (customTitle && customTitle.trim()) || `${roleTitle} Acceleration Roadmap`;
  log(`[Roadmap] Building roadmap "${preferredTitle}" (role: ${roleTitle})...`);

  // Not an ai-proxy task: roadmaps are built deterministically (decision 25); the model only
  // explains them through explainRoadmap / the `roadmap_explanation` task.
  // Fallback roadmap
  const fallbackId = `custom-${Date.now()}`;
  const fallbackRoadmap = {
    id: fallbackId,
    title: preferredTitle,
    domain: 'Professional Track',
    targetRoles: [roleTitle],
    targetHorizon: targetHorizon || '2 Months',
    dailyCommitment: dailyCommitment || '2 Hours/Day',
    milestones: [
      {
        id: 'phase-1',
        title: 'Phase 1: Foundations & Core Principles',
        level: 'Foundations',
        difficulty: 'Beginner',
        estimatedHours: 20,
        description: 'Master core principles and essential toolsets.',
        skills: ['Core Fundamentals', 'Tooling'],
        subModules: [
          {
            id: 'sub-1-1',
            title: 'Core Fundamentals & Standards',
            description: 'Essential terminology and operating workflows.',
            keyConcepts: ['Foundational concepts', 'Daily tools', 'Quality control'],
            resources: [
              { ...CURATED_FALLBACK_RESOURCES.VIDEO, title: 'Foundational Video Guide' },
              { ...CURATED_FALLBACK_RESOURCES.DOCS, title: 'Industry Best Practices' }
            ]
          }
        ]
      },
      {
        id: 'phase-2',
        title: 'Phase 2: Execution & Deliverables',
        level: 'Core Practice',
        difficulty: 'Intermediate',
        estimatedHours: 30,
        description: 'Practical projects, artifact generation, and case studies.',
        skills: ['Execution', 'Strategy'],
        subModules: [
          {
            id: 'sub-2-1',
            title: 'Practical Execution',
            description: 'Hands-on workflow execution and deliverables.',
            keyConcepts: ['Deliverable production', 'Workflow management', 'Feedback integration'],
            resources: [
              { ...CURATED_FALLBACK_RESOURCES.PRACTICE, title: 'Practical Tutorial' }
            ]
          }
        ]
      },
      {
        id: 'phase-3',
        title: 'Phase 3: Portfolio & Interview Readiness',
        level: 'Interview Ready',
        difficulty: 'Advanced',
        estimatedHours: 25,
        description: 'Portfolio defense, STAR framework responses, and interview mastery.',
        skills: ['Interview Mastery', 'Communication'],
        subModules: [
          {
            id: 'sub-3-1',
            title: 'Portfolio Showcase & Behavioral Drills',
            description: 'Structuring your work to ace competency and case interviews.',
            keyConcepts: ['STAR storytelling', 'Impact defense', 'Negotiation'],
            resources: [
              { ...CURATED_FALLBACK_RESOURCES.INTERVIEW, title: 'Interview Masterclass' }
            ]
          }
        ]
      }
    ]
  };
  saveCustomRoadmapDb(fallbackId, roleTitle, 'Professional Track', JSON.stringify(fallbackRoadmap), targetHorizon, dailyCommitment);
  return { success: true, roadmap: fallbackRoadmap };
}

// ── Roadmap explanation (ai-proxy task `roadmap_explanation`) ───────────────
/** Explains an existing roadmap's milestones. The model never adds milestones, resources or links. */
export async function explainRoadmap(input: RoadmapExplanationInput): Promise<RoadmapExplanationResult> {
  const res = await aiProxy.explainRoadmap(input);
  if (!res.ok) return { success: false, error: res.error, code: res.code };
  return { success: true, explanation: res.data };
}
