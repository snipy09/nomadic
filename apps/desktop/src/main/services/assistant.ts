import { callGeminiFlash } from '@job-automator/automation';
import type { AssistantReply, AssistantRequest } from '../../shared/ipc.js';
import { getDb } from '../db.js';
import { log } from './app-context.js';
import { getVerifiedServerUserTier } from './auth.js';
import { getCandidateEmail } from './profile.js';

// ── Max-Exclusive Nomadic Assistant on Steroids ─────────────────────────────
export async function askNomadicAssistant(data: AssistantRequest): Promise<AssistantReply> {
  const { message } = data;
  log(`[Nomadic Assistant] Query: "${message.slice(0, 60)}..."`);

  // 1. Anti-Exploitation Assignment Check
  const EXPLOITATION_KEYWORDS = [
    /do\s+(my|this|the)?.*(assignment|homework|coursework|lab\s*report)/i,
    /solve\s+(my|this|the)?.*(exam|quiz|test|homework|assignment\s*question)/i,
    /take\s+(my|this|the)?.*(exam|quiz|test|proctored)/i,
    /write\s+(my|this|the)?.*(college|university|school|class)?.*(essay|paper|assignment|homework)/i,
    /cheat\s+on/i,
    /submit\s+for\s+my\s+(grade|grading|class|school|college)/i,
    /for\s+my\s+(school|college|university)\s+(class|grade|course|homework|assignment)/i
  ];

  if (EXPLOITATION_KEYWORDS.some(rgx => rgx.test(message))) {
    return {
      success: true,
      reply: `⚠️ **Academic Integrity Policy**\n\nNomadic Assistant cannot complete school or university assignments, homework, or exams on your behalf.\n\nHowever, I can explain the underlying **system architecture**, algorithm trade-offs, or point you to textbooks in your **CS Vault**! What technical concept would you like to explore?`,
      action: { type: 'NAVIGATE', target: 'learner-resources' }
    };
  }

  // 1b. Server-Verified Max Plan Gate
  const db = getDb();
  const candidateEmail = getCandidateEmail();

  const serverTier = await getVerifiedServerUserTier(candidateEmail);
  if (serverTier !== 'max') {
    return {
      success: false,
      reply: '⚠️ **Exclusive Max Plan Feature**\n\nThe Autonomous AI Assistant on Steroids is exclusively unlocked for Nomadic Max members. Upgrade your subscription to access app-wide autonomous execution, real-time query resolution, and live interview calibration.',
      action: { type: 'NONE' }
    };
  }
  let candidateName = 'Candidate';
  let targetRole = 'Software Engineer';
  let skills = 'TypeScript, React, Node.js';
  try {
    const prof = db.exec('SELECT first_name, last_name, desired_title, tech_stack FROM master_profile WHERE id = 1');
    if (prof.length && prof[0].values.length) {
      candidateName = [prof[0].values[0][0], prof[0].values[0][1]].filter(Boolean).join(' ') || candidateName;
      targetRole = String(prof[0].values[0][2] || targetRole);
      skills = String(prof[0].values[0][3] || skills);
    }
  } catch {}

  const fullPrompt = `Candidate Context:
- Name: ${candidateName}
- Target Role: ${targetRole}
- Skills: ${skills}

User Request: "${message}"

You are the Nomadic Assistant on Steroids. Execute tasks or provide bar-raiser career coaching.
Available Actions:
- { "type": "NAVIGATE", "target": "feed" | "learner-roadmaps" | "learner-resources" | "outreach" | "settings" | "applications" }
- { "type": "TRIGGER_APPLY", "target": "top_jobs" }
- { "type": "NONE" }

Return strictly JSON:
{
  "reply": "Clear, direct, insightful markdown response.",
  "action": { "type": "...", "target": "..." }
}`;

  try {
    const raw = await callGeminiFlash(fullPrompt, 'You are an autonomous career and platform assistant on steroids.');
    const cleanJson = raw.replace(/```json\s*|\s*```/gi, '').trim();
    const parsed = JSON.parse(cleanJson);
    if (parsed.reply) {
      return { success: true, reply: parsed.reply, action: parsed.action };
    }
  } catch {}

  return {
    success: true,
    reply: `I have processed your request for **${targetRole}**. You can ask me to navigate the app, trigger 1-click auto-applies, or coach you on technical interviews!`,
    action: { type: 'NONE' }
  };
}
