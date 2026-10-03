import { AutoApplyEngine } from '@job-automator/automation';
import type {
  ApplicationInput,
  ApplicationRow,
  AutonomousApplyResult,
  BatchOverrides,
  BatchSnapshot,
  BatchTarget,
  IdStatusInput,
} from '../../shared/ipc.js';
import {
  getDb,
  persistDb,
  saveCachedFormAnswerDb,
  updateApplicationStatusDb,
  deleteApplicationDb,
  checkUserPlanLimitDb,
  logUserActivityDb,
} from '../db.js';
import { getMainWindow, log } from './app-context.js';
import { logAndSyncApplication } from './cloud-sync.js';
import { buildAutomationProfile, getMasterProfileRow } from './profile.js';
import { getVerifiedServerUserTier } from './auth.js';

const NO_PROFILE_ERR = 'No master profile saved. Fill in your profile first.';

// ── Local applications log ──────────────────────────────────────────────────
export function getApplications(): ApplicationRow[] {
  const db = getDb();
  const results = db.exec(
    'SELECT * FROM local_applications ORDER BY applied_at DESC LIMIT 200'
  );
  if (!results.length) return [];
  const cols = results[0].columns;
  return results[0].values.map(row =>
    Object.fromEntries(cols.map((c, i) => [c, row[i]]))
  );
}

export function updateApplicationStatus(data: IdStatusInput): { success: boolean } {
  const ok = updateApplicationStatusDb(data.id, data.status);
  log(`[Applications] Status for #${data.id} -> ${data.status}`);
  return { success: ok };
}

export function deleteApplication(id: number | string): { success: boolean } {
  const ok = deleteApplicationDb(id);
  log(`[Applications] Removed record #${id}`);
  return { success: ok };
}

export function saveApplication(app: ApplicationInput): { success: boolean; id?: number; error?: string } {
  try {
    logAndSyncApplication({
      company: app.company,
      title: app.title,
      apply_url: app.apply_url,
      status: app.status || 'applied',
      mode: app.mode || 'manual',
    });
    logUserActivityDb('application', `Applied to ${app.title} at ${app.company}`);
    // logAndSyncApplication does not return a row id (kept for API compatibility).
    return { success: true, id: undefined };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

function lookupSavedJob(url: string): { company: string; title: string } {
  let jobCompany = 'Tech Company';
  let jobTitle = 'Software Engineer';
  try {
    const db = getDb();
    const sj = db.exec('SELECT company, title FROM saved_jobs WHERE apply_url = ?', [url]);
    if (sj.length && sj[0].values.length) {
      jobCompany = String(sj[0].values[0][0]);
      jobTitle = String(sj[0].values[0][1]);
    }
  } catch {}
  return { company: jobCompany, title: jobTitle };
}

// ── Semi-Auto Mode (External Chrome Window) ─────────────────────────────────
export async function launchSemiAuto(jobUrls: string[]): Promise<{ success: boolean; error?: string }> {
  log(`[Review Mode] Launching external Chrome with ${jobUrls.length} pre-filled tabs...`);
  try {
    const profile = buildAutomationProfile({ logCachedAnswers: true });
    if (!profile) {
      return { success: false, error: NO_PROFILE_ERR };
    }

    // RAM-safe parallel prefill with 3 parallel workers max
    await AutoApplyEngine.prefillParallelTabs(jobUrls, profile, (m: string) => log(`[Review Mode] ${m}`), 3);

    // Record dynamic applications in SQLite & Cloud
    for (const url of jobUrls) {
      const job = lookupSavedJob(url);
      logAndSyncApplication({
        company: job.company,
        title: job.title,
        apply_url: url,
        status: 'interviewing',
        mode: 'semi-auto',
      });
    }

    log('[Review Mode] All tabs prefilled in external Chrome. Awaiting 1-click review.');
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`[Review Mode] ERROR: ${msg}`);
    return { success: false, error: msg };
  }
}

// ── Autonomous Auto-Apply (External Chrome Engine) ──────────────────────────
let isAutoApplyCanceled = false;

export function cancelAutonomousApply(): { success: boolean } {
  log('[Autonomous Auto-Apply] Cancellation requested by user.');
  isAutoApplyCanceled = true;
  return { success: true };
}

export function chunkIntoBatches<T>(items: T[], batchSize: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  return batches;
}

export async function launchAutonomous(jobUrls: string[]): Promise<AutonomousApplyResult> {
  isAutoApplyCanceled = false;
  log(`[Autonomous Auto-Apply] Starting automated submission for ${jobUrls.length} positions in external Chrome...`);
  try {
    const profile = buildAutomationProfile({ logCachedAnswers: true });
    if (!profile) {
      return { success: false, error: NO_PROFILE_ERR };
    }

    // 1. Enforce verified server tier & usage limits
    const userTier = await getVerifiedServerUserTier(profile.email);
    if (userTier === 'suspended') {
      return { success: false, error: 'This account is suspended. Contact support.' };
    }
    if (userTier === 'free' && jobUrls.length > 1) {
      return {
        success: false,
        error: 'Autonomous batch applications are reserved for Pro and Max subscribers. Upgrade to proceed.',
        limitReached: true,
        currentUsage: 0,
        maxAllowed: 1
      };
    }

    // Allow single targeted job applies directly without batch throttling
    if (jobUrls.length > 1) {
      const planCheck = checkUserPlanLimitDb(jobUrls.length, userTier);
      if (!planCheck.allowed) {
        log(`[Plan Rules] Submission halted: ${planCheck.reason}`);
        return {
          success: false,
          error: planCheck.reason,
          limitReached: true,
          currentUsage: planCheck.currentUsage,
          maxAllowed: planCheck.maxAllowed,
        };
      }
    }

    // 2. Sequential batch processing: chunk jobs into 5-job batches (e.g. 50 jobs = 10 batches of 5)
    const BATCH_SIZE = 5;
    const batches = chunkIntoBatches(jobUrls, BATCH_SIZE);

    log(`[Sequential Batch Engine] Allocating ${jobUrls.length} positions across ${batches.length} sequential batches (${BATCH_SIZE} jobs per batch, 3-tab RAM safety pool)...`);

    let applied = 0;
    let skipped = 0;
    let totalProcessed = 0;

    for (let b = 0; b < batches.length; b++) {
      if (isAutoApplyCanceled) {
        log('[Auto-Apply Engine] Stopped remaining batches due to cancellation.');
        break;
      }
      const currentBatch = batches[b];
      log(`[Batch Worker] Starting Batch ${b + 1}/${batches.length} (${currentBatch.length} jobs in queue)...`);

      for (let i = 0; i < currentBatch.length; i++) {
        if (isAutoApplyCanceled) {
          log('[Auto-Apply Engine] Canceled by user. Halting application queue.');
          break;
        }
        const url = currentBatch[i];
        totalProcessed++;
        const { company: jobCompany, title: jobTitle } = lookupSavedJob(url);

        log(`[Auto-Apply ${totalProcessed}/${jobUrls.length}] Submitting to ${jobCompany} (${url})...`);

        try {
          const result = await AutoApplyEngine.submitApplication(url, profile, (eventPayload) => {
            if (typeof eventPayload === 'string') {
              log(eventPayload);
            } else {
              // eventPayload is AutoApplyStatusEvent! Send structured data to renderer!
              const mainWindow = getMainWindow();
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('auto-apply-progress', {
                  log: `[Auto-Apply] ${eventPayload.message}`,
                  progress: eventPayload.progress, // Optional, can calculate based on phase
                  statusEvent: eventPayload // Custom payload for UI to handle 3-color pill
                });
              }
              log(`[Auto-Apply Status] [${eventPayload.colorState.toUpperCase()}] ${eventPayload.message}`);
            }
          });
          if (result.captchaDetected) {
            log(`[Auto-Apply] CAPTCHA challenge at ${url} — left open for candidate.`);
            logAndSyncApplication({
              company: jobCompany,
              title: jobTitle,
              apply_url: url,
              status: 'captcha_blocked',
              mode: 'autonomous',
            });
            skipped++;
          } else if (result.requiresLogin) {
            log(`[Auto-Apply] Sign-in required on portal for ${jobCompany} — left open in browser.`);
            logAndSyncApplication({
              company: jobCompany,
              title: jobTitle,
              apply_url: url,
              status: 'requires_login',
              mode: 'autonomous',
            });
            skipped++;
          } else if (result.submitted) {
            logAndSyncApplication({
              company: jobCompany,
              title: jobTitle,
              apply_url: url,
              status: 'applied',
              mode: 'autonomous',
            });
            applied++;
            log(`[Auto-Apply] ✓ Verified application submitted for ${jobCompany} (${totalProcessed}/${jobUrls.length})`);
          } else if (result.prefilled && (result.fieldsFilledCount ?? 0) > 0) {
            logAndSyncApplication({
              company: jobCompany,
              title: jobTitle,
              apply_url: url,
              status: 'prefilled',
              mode: 'autonomous',
            });
            applied++;
            log(`[Auto-Apply] ✓ Pre-filled ${result.fieldsFilledCount} fields for ${jobCompany} (ready for review & submit)`);
          } else {
            logAndSyncApplication({
              company: jobCompany,
              title: jobTitle,
              apply_url: url,
              status: 'failed',
              mode: 'autonomous',
            });
            skipped++;
          }
        } catch (jobErr: any) {
          log(`[Auto-Apply] Error on ${url}: ${jobErr?.message}`);
          skipped++;
        }
      }

      // Between batches: cool-down jitter delay to protect user from ATS anti-bot IP throttling
      if (b < batches.length - 1) {
        log(`[Batch Cooldown] Batch ${b + 1}/${batches.length} completed. Pausing 2.5s to prevent ATS anti-bot IP rate-limiting...`);
        await new Promise((resolve) => setTimeout(resolve, 2500));
      }
    }

    persistDb();
    log(`[Auto-Apply Engine] Finished all ${batches.length} batches: ${applied} Applied, ${skipped} Skipped.`);
    return { success: true, applied, skipped, totalBatches: batches.length };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`[Auto-Apply] ERROR: ${msg}`);
    return { success: false, error: msg };
  }
}

// ── Batch Co-Pilot Parallel Pre-Fill ────────────────────────────────────────
let activeBatchTargets: BatchTarget[] = [];

export function startBatchCopilot(
  targets: BatchTarget[]
): { success: boolean; snapshots?: BatchSnapshot[]; error?: string } {
  log(`[Batch Co-Pilot] Pre-filling ${targets.length} applications in parallel...`);
  activeBatchTargets = targets || [];
  try {
    getDb();
    const pmap = getMasterProfileRow();
    let fName = 'Candidate';
    let lName = '';
    let email = 'candidate@example.com';
    let phone = '+1 (555) 000-0000';
    let linkedin = '';
    let github = '';
    let role = 'Software Engineer';
    let skills = 'TypeScript, React, Node.js';

    if (pmap) {
      fName = String(pmap['first_name'] ?? 'Candidate');
      lName = String(pmap['last_name'] ?? '');
      email = String(pmap['email'] ?? 'candidate@example.com');
      phone = String(pmap['phone'] ?? '+1 (555) 000-0000');
      linkedin = String(pmap['linkedin'] ?? '');
      github = String(pmap['github'] ?? '');
      role = String(pmap['desired_title'] ?? 'Software Engineer');
      skills = String(pmap['tech_stack'] ?? 'TypeScript, React, Node.js');
    }

    const snapshots: BatchSnapshot[] = targets.map((t, i) => ({
      id: `batch_snap_${Date.now()}_${i + 1}`,
      company: t.company || 'Tech Company',
      jobTitle: t.title || role,
      applyUrl: t.url,
      resumeFileName: 'Resume.pdf',
      fields: [
        { fieldKey: 'fullName', label: 'Full Name', value: `${fName} ${lName}`.trim(), fieldType: 'text' as const },
        { fieldKey: 'email', label: 'Email', value: email, fieldType: 'text' as const },
        { fieldKey: 'phone', label: 'Phone Number', value: phone, fieldType: 'text' as const },
        { fieldKey: 'linkedin', label: 'LinkedIn Profile', value: linkedin || 'https://linkedin.com/in/candidate', fieldType: 'text' as const },
        { fieldKey: 'github', label: 'GitHub Profile', value: github || 'https://github.com/candidate', fieldType: 'text' as const },
        { fieldKey: 'workAuth', label: 'Authorized to work?', value: 'Yes', fieldType: 'radio' as const },
        { fieldKey: 'sponsorship', label: 'Require Visa Sponsorship?', value: 'No', fieldType: 'radio' as const },
        { fieldKey: 'noticePeriod', label: 'Notice Period', value: 'Immediately (0 days)', fieldType: 'text' as const },
        { fieldKey: 'desiredSalary', label: 'Desired Salary', value: 'Competitive', fieldType: 'text' as const },
        { fieldKey: 'coverLetter', label: `Why are you a fit for ${t.company || 'this role'}?`, value: `With hands-on expertise in ${skills}, I design high-concurrency systems and responsive web architectures that deliver measurable business impact.`, fieldType: 'textarea' as const },
      ],
      status: 'ready' as const
    }));

    return { success: true, snapshots };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export async function submitAllBatchCopilot(
  overrides?: BatchOverrides
): Promise<{ success: boolean; applied?: number; failed?: number; total?: number; error?: string }> {
  log(`[Batch Co-Pilot] Submitting all held applications with verified browser automation...`);
  try {
    getDb();
    if (overrides) {
      Object.entries(overrides).forEach(([_, fields]) => {
        Object.entries(fields).forEach(([k, v]) => {
          if (v && v.trim().length > 0) {
            saveCachedFormAnswerDb(k, v);
          }
        });
      });
      persistDb();
    }

    const profile = buildAutomationProfile({ logCachedAnswers: false });
    if (!profile) {
      return { success: false, error: NO_PROFILE_ERR };
    }

    let applied = 0;
    let failed = 0;

    for (const target of activeBatchTargets) {
      try {
        log(`[Batch Co-Pilot Submitter] Executing real Playwright submit for ${target.company || 'Job'} (${target.url})...`);
        const res = await AutoApplyEngine.submitApplication(target.url, profile, (msg) => {
          log(typeof msg === 'string' ? msg : `[Batch Status] ${msg.message}`);
        });

        if (res.submitted) {
          applied++;
          logAndSyncApplication({
            company: target.company || 'Direct ATS Posting',
            title: target.title || profile.desiredTitle || 'Software Engineer',
            apply_url: target.url,
            status: 'submitted',
            mode: 'batch_copilot',
          });
        } else {
          failed++;
          logAndSyncApplication({
            company: target.company || 'Direct ATS Posting',
            title: target.title || profile.desiredTitle || 'Software Engineer',
            apply_url: target.url,
            status: res.captchaDetected ? 'captcha_blocked' : (res.requiresLogin ? 'requires_login' : 'failed'),
            mode: 'batch_copilot',
          });
        }
      } catch (err: any) {
        failed++;
        log(`[Batch Co-Pilot Submitter] Error applying to ${target.url}: ${err?.message || err}`);
      }
    }

    return { success: true, applied, failed, total: activeBatchTargets.length };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}
