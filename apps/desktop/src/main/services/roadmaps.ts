import { generateStructuredAIContent } from '@job-automator/automation';
import type { AiJson, CustomRoadmapParams, OnboardingProfileParams } from '../../shared/ipc.js';
import { saveCustomRoadmapDb } from '../db.js';
import { log } from './app-context.js';

/**
 * AI generation for the Learner hub: onboarding profile synthesis and custom
 * career roadmaps. Both fall back to deterministic templates when the AI call
 * fails, and persist the resulting roadmap to `custom_roadmaps`.
 */

// ── AI Onboarding Profile Generator ─────────────────────────────────────────
export async function generateAiOnboardingProfile(
  params: OnboardingProfileParams
): Promise<{ success: boolean; profile?: AiJson; roadmap?: AiJson }> {
  const { targetRole, experienceLevel, bioOrResumeText, customSkills, targetHorizon, dailyCommitment, geminiKey, groqKey } = params;
  const horizon = targetHorizon || '3 Months';
  const commitment = dailyCommitment || '2 Hours/Day';
  log(`[AI Onboarding] Synthesizing candidate profile & roadmap for: "${targetRole}" (${horizon}, ${commitment})...`);

  const prompt = `Candidate Input:
- Target Role / Career Goal: ${targetRole || 'Professional Specialist'}
- Seniority/Level: ${experienceLevel || 'fresher'}
- Target Timeline: ${horizon}
- Daily Commitment: ${commitment}
- Skills / Background: ${(customSkills || []).join(', ')}
- Bio / Resume Summary: ${bioOrResumeText || 'Passionate professional looking to build modern, production-grade industry capabilities.'}

Note: Nomadic is a universal career accelerator for ANY profession (Engineering, Product, UI/UX Design, Data Analysis, Marketing, Sales, Operations, Finance, HR, etc.).

Analyze the candidate details and generate a JSON response matching this schema:
{
  "firstName": "...",
  "lastName": "...",
  "desiredTitle": "${targetRole || 'Professional'}",
  "techStack": "comma-separated list of 6-8 core tools, skills, or frameworks relevant to this profession",
  "desiredSalary": "estimated market salary range e.g. ₹12 LPA - ₹26 LPA · $90k - $150k",
  "summaryHeadline": "one crisp executive summary sentence",
  "recommendedRoadmap": {
    "id": "roadmap-${Date.now()}",
    "title": "${targetRole} Acceleration Roadmap",
    "domain": "Domain Name (e.g. Product Management, UI/UX Design, Software Engineering, Marketing & Growth, Financial Analysis, Sales)",
    "targetRoles": ["${targetRole}"],
    "targetHorizon": "${horizon}",
    "dailyCommitment": "${commitment}",
    "milestones": [
      {
        "id": "phase-1",
        "title": "Phase 1: Foundations & Core Principles",
        "level": "Foundations",
        "difficulty": "Beginner",
        "estimatedHours": 20,
        "description": "Establish core principles, essential tooling, and mental models.",
        "skills": ["Skill 1", "Skill 2"],
        "subModules": [
          {
            "id": "sub-1-1",
            "title": "Core Fundamentals & Industry Workflows",
            "description": "Overview of foundational standards and best practices.",
            "keyConcepts": ["Key Concept 1", "Key Concept 2", "Key Concept 3", "Key Concept 4"],
            "resources": [
              { "title": "${targetRole} Core Concepts Masterclass", "url": "https://www.youtube.com/results?search_query=${encodeURIComponent(targetRole + ' fundamentals masterclass')}", "type": "video", "duration": "35 mins" },
              { "title": "Comprehensive Reference & Docs", "url": "https://google.com/search?q=${encodeURIComponent(targetRole + ' fundamentals documentation guide')}", "type": "doc" }
            ]
          },
          {
            "id": "sub-1-2",
            "title": "Essential Tooling & Environment Setup",
            "description": "Mastering the primary software and toolkits for daily execution.",
            "keyConcepts": ["Tool configurations", "Workflow automations", "Quality control", "Standard operating procedures"],
            "resources": [
              { "title": "Tooling Setup & Workflow Video", "url": "https://www.youtube.com/results?search_query=${encodeURIComponent(targetRole + ' tools workflow tutorial')}", "type": "video", "duration": "25 mins" },
              { "title": "Tooling Reference Playbook", "url": "https://google.com/search?q=${encodeURIComponent(targetRole + ' essential tools cheat sheet')}", "type": "guide" }
            ]
          }
        ]
      },
      {
        "id": "phase-2",
        "title": "Phase 2: Intermediate Execution & Practical Deliverables",
        "level": "Core Practice",
        "difficulty": "Intermediate",
        "estimatedHours": 30,
        "description": "Building real-world artifacts, managing lifecycles, and executing complex workflows.",
        "skills": ["Skill 3", "Skill 4"],
        "subModules": [
          {
            "id": "sub-2-1",
            "title": "Practical Execution & Strategy",
            "description": "Hands-on implementation of core role responsibilities and deliverables.",
            "keyConcepts": ["Execution frameworks", "Data-informed decision making", "Cross-functional collaboration", "Case study artifact building"],
            "resources": [
              { "title": "Practical Project Case Study Breakdown", "url": "https://www.youtube.com/results?search_query=${encodeURIComponent(targetRole + ' real world case study')}", "type": "video", "duration": "45 mins" },
              { "title": "Industry Implementation Guide", "url": "https://google.com/search?q=${encodeURIComponent(targetRole + ' practical implementation case study')}", "type": "doc" }
            ]
          }
        ]
      },
      {
        "id": "phase-3",
        "title": "Phase 3: Advanced Optimization & Scaling",
        "level": "Advanced",
        "difficulty": "Advanced",
        "estimatedHours": 25,
        "description": "Metrics tracking, leadership, efficiency optimization, and enterprise scaling.",
        "skills": ["Skill 5", "Skill 6"],
        "subModules": [
          {
            "id": "sub-3-1",
            "title": "Advanced Metrics & Strategic Growth",
            "description": "Optimizing deliverables for maximum measurable ROI.",
            "keyConcepts": ["Key Performance Indicators", "Systemic bottlenecks", "Scale methodologies", "Leadership principles"],
            "resources": [
              { "title": "Advanced Strategy & Scaling Video", "url": "https://www.youtube.com/results?search_query=${encodeURIComponent(targetRole + ' advanced strategy tutorial')}", "type": "video", "duration": "40 mins" },
              { "title": "Advanced Strategy Playbook", "url": "https://google.com/search?q=${encodeURIComponent(targetRole + ' advanced strategic frameworks')}", "type": "doc" }
            ]
          }
        ]
      },
      {
        "id": "phase-4",
        "title": "Phase 4: Capstone Portfolio & Bar-Raiser Interview Readiness",
        "level": "Interview Ready",
        "difficulty": "Advanced",
        "estimatedHours": 20,
        "description": "Portfolio presentation, behavioral drills, and technical/case interview preparation.",
        "skills": ["Interview Strategy", "Communication"],
        "subModules": [
          {
            "id": "sub-4-1",
            "title": "Portfolio Defense & Behavioral Interviews",
            "description": "Structuring impact with the STAR framework and answering high-stakes interview questions.",
            "keyConcepts": ["STAR storytelling framework", "Portfolio case defense", "Salary & offer negotiation", "Hiring manager objection handling"],
            "resources": [
              { "title": "Top Interview Questions & Mock Interview", "url": "https://www.youtube.com/results?search_query=${encodeURIComponent(targetRole + ' interview questions and answers mock interview')}", "type": "video", "duration": "40 mins" },
              { "title": "Executive Interview Preparation Guide", "url": "https://google.com/search?q=${encodeURIComponent(targetRole + ' interview preparation guide star method')}", "type": "doc" }
            ]
          }
        ]
      }
    ]
  }
}`;

  try {
    const res = await generateStructuredAIContent<any>(
      prompt,
      'You are an executive career architect and industry expert across tech, design, product, marketing, finance, and business. Synthesize the candidate information into an authentic, structured profile and learning roadmap. Return ONLY raw JSON matching the schema.',
      { geminiKey, groqKey }
    );

    if (res && res.techStack && res.recommendedRoadmap) {
      log(`[AI Onboarding] Successfully synthesized profile for "${targetRole}" ✓`);
      const roadmapId = res.recommendedRoadmap.id || `roadmap-${Date.now()}`;
      res.recommendedRoadmap.id = roadmapId;
      res.recommendedRoadmap.targetHorizon = horizon;
      res.recommendedRoadmap.dailyCommitment = commitment;
      saveCustomRoadmapDb(
        roadmapId,
        res.desiredTitle || targetRole,
        res.recommendedRoadmap.domain || 'Professional Career',
        JSON.stringify(res.recommendedRoadmap),
        horizon,
        commitment
      );
      return { success: true, profile: res, roadmap: res.recommendedRoadmap };
    }
  } catch (err: any) {
    log(`[AI Onboarding] AI synthesis note: ${err?.message}`);
  }

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
              { title: 'Foundational Overview & Standards', url: `https://www.youtube.com/results?search_query=${encodeURIComponent((targetRole || 'career') + ' fundamentals')}`, type: 'video', duration: '30 mins' },
              { title: 'Industry Best Practices Reference', url: `https://google.com/search?q=${encodeURIComponent((targetRole || 'career') + ' best practices guide')}`, type: 'doc' }
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
              { title: 'Practical Implementation Guide', url: `https://www.youtube.com/results?search_query=${encodeURIComponent((targetRole || 'career') + ' practical skills')}`, type: 'video', duration: '40 mins' }
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
              { title: 'Top Interview Questions & STAR Framework', url: `https://www.youtube.com/results?search_query=${encodeURIComponent((targetRole || 'career') + ' interview preparation')}`, type: 'video', duration: '35 mins' }
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
  const { roleTitle, customTitle, currentSkills, targetHorizon, dailyCommitment, geminiKey, groqKey } = params;
  const preferredTitle = (customTitle && customTitle.trim()) || `${roleTitle} Acceleration Roadmap`;
  log(`[AI Roadmap] Generating custom curriculum for: "${preferredTitle}" (role: ${roleTitle})...`);

  const prompt = `Role / Profession: ${roleTitle}
Roadmap Custom Name: ${preferredTitle}
Candidate Current Skills: ${currentSkills || 'Fundamental industry foundations'}
Timeline: ${targetHorizon || '2 Months'} (${dailyCommitment || '2 Hours/Day'})

Note: This applies to ANY career path (Engineering, Product Management, UI/UX Design, Data Analytics, Growth Marketing, Sales, Operations, Finance, Human Resources, etc.).

Generate a comprehensive 4-phase career & learning roadmap formatted strictly in JSON:
{
  "id": "roadmap-${Date.now()}",
  "title": "${preferredTitle}",
  "domain": "Domain Name (e.g. Design, Product, Engineering, Marketing, Finance, Sales)",
  "targetRoles": ["${roleTitle}"],
  "targetHorizon": "${targetHorizon || '2 Months'}",
  "dailyCommitment": "${dailyCommitment || '2 Hours/Day'}",
  "milestones": [
    {
      "id": "m1",
      "title": "Phase 1: Foundations & Core Principles",
      "level": "Foundations",
      "difficulty": "Beginner",
      "estimatedHours": 20,
      "description": "Establish core theory, terminology, and foundational workflows.",
      "skills": ["Skill 1", "Skill 2"],
      "subModules": [
        {
          "id": "sub-1-1",
          "title": "Core Standards & Mental Models",
          "description": "Detailed explanation of basic concepts and workflows.",
          "keyConcepts": ["Concept 1", "Concept 2", "Concept 3"],
          "resources": [
            { "title": "Comprehensive Reference Guide", "url": "https://www.youtube.com/results?search_query=${encodeURIComponent(roleTitle + ' basics')}", "type": "video", "duration": "30 mins" },
            { "title": "Official Standards & Documentation", "url": "https://google.com/search?q=${encodeURIComponent(roleTitle + ' fundamentals guide')}", "type": "doc" }
          ]
        },
        {
          "id": "sub-1-2",
          "title": "Primary Toolkits & Productivity Setup",
          "description": "Configuring essential software and daily toolkits.",
          "keyConcepts": ["Software configuration", "Automation shortcuts", "Best practices"],
          "resources": [
            { "title": "Tooling Walkthrough", "url": "https://www.youtube.com/results?search_query=${encodeURIComponent(roleTitle + ' tools')}", "type": "video", "duration": "25 mins" }
          ]
        }
      ]
    },
    {
      "id": "m2",
      "title": "Phase 2: Intermediate Execution & Deliverables",
      "level": "Core Practice",
      "difficulty": "Intermediate",
      "estimatedHours": 30,
      "description": "Practical workflows, problem solving, and artifact generation.",
      "skills": ["Skill 3", "Skill 4"],
      "subModules": [
        {
          "id": "sub-2-1",
          "title": "Artifact Generation & Project Execution",
          "description": "Building production-ready deliverables and case studies.",
          "keyConcepts": ["Execution framework", "Quality metrics", "Cross-functional collaboration"],
          "resources": [
            { "title": "Execution Case Study", "url": "https://www.youtube.com/results?search_query=${encodeURIComponent(roleTitle + ' case study')}", "type": "video", "duration": "40 mins" }
          ]
        }
      ]
    },
    {
      "id": "m3",
      "title": "Phase 3: Advanced Optimization & Scaling",
      "level": "Advanced",
      "difficulty": "Advanced",
      "estimatedHours": 25,
      "description": "Strategic scaling, metric optimization, and advanced patterns.",
      "skills": ["Skill 5", "Skill 6"],
      "subModules": [
        {
          "id": "sub-3-1",
          "title": "Optimization & Systemic Strategy",
          "description": "Measuring performance impact and strategic scaling.",
          "keyConcepts": ["ROI measurement", "Process optimization", "Leadership insights"],
          "resources": [
            { "title": "Advanced Strategy Masterclass", "url": "https://www.youtube.com/results?search_query=${encodeURIComponent(roleTitle + ' advanced strategy')}", "type": "video", "duration": "45 mins" }
          ]
        }
      ]
    },
    {
      "id": "m4",
      "title": "Phase 4: Capstone Portfolio & Interview Mastery",
      "level": "Interview Ready",
      "difficulty": "Advanced",
      "estimatedHours": 20,
      "description": "Bar-raiser mock interviews, portfolio defense, and STAR framework drills.",
      "skills": ["Interview Strategy", "Communication"],
      "subModules": [
        {
          "id": "sub-4-1",
          "title": "Portfolio Defense & Case Interviews",
          "description": "Demonstrating business impact and acing behavioral & technical rounds.",
          "keyConcepts": ["STAR framework stories", "Portfolio presentation", "Salary negotiation"],
          "resources": [
            { "title": "Top Interview Questions & Scenarios", "url": "https://www.youtube.com/results?search_query=${encodeURIComponent(roleTitle + ' interview guide')}", "type": "video", "duration": "30 mins" }
          ]
        }
      ]
    }
  ]
}`;

  try {
    const res = await generateStructuredAIContent<any>(
      prompt,
      'You are an executive curriculum architect. Return ONLY valid raw JSON representing the roadmap.',
      { geminiKey, groqKey }
    );
    if (res && Array.isArray(res.milestones) && res.milestones.length > 0) {
      log(`[AI Roadmap] Generated roadmap for "${roleTitle}" ✓`);
      const roadmapId = res.id || `custom-${Date.now()}`;
      res.id = roadmapId;
      if (customTitle && customTitle.trim()) {
        res.title = customTitle.trim();
      }
      saveCustomRoadmapDb(roadmapId, roleTitle, res.domain || 'Career Path', JSON.stringify(res), targetHorizon, dailyCommitment);
      return { success: true, roadmap: res };
    }
  } catch (err: any) {
    log(`[AI Roadmap] Note: ${err?.message}`);
  }

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
              { title: 'Foundational Video Guide', url: `https://www.youtube.com/results?search_query=${encodeURIComponent(roleTitle + ' basics')}`, type: 'video', duration: '30 mins' },
              { title: 'Industry Best Practices', url: `https://google.com/search?q=${encodeURIComponent(roleTitle + ' best practices')}`, type: 'doc' }
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
              { title: 'Practical Tutorial', url: `https://www.youtube.com/results?search_query=${encodeURIComponent(roleTitle + ' practical tutorial')}`, type: 'video', duration: '35 mins' }
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
              { title: 'Interview Masterclass', url: `https://www.youtube.com/results?search_query=${encodeURIComponent(roleTitle + ' interview questions')}`, type: 'video', duration: '30 mins' }
            ]
          }
        ]
      }
    ]
  };
  saveCustomRoadmapDb(fallbackId, roleTitle, 'Professional Track', JSON.stringify(fallbackRoadmap), targetHorizon, dailyCommitment);
  return { success: true, roadmap: fallbackRoadmap };
}
