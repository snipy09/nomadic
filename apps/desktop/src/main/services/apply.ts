import { AutoApplyEngine, outcomeKey, type ReviewHandle } from '@job-automator/automation';
import type {
  AutoApplyProgressEvent,
  AutoApplyStatusEvent,
  AutonomousApplyResult,
  BatchOverrides,
  BatchSnapshot,
  BatchStartOptions,
  BatchSubmitItemResult,
  BatchSubmitResult,
  BatchTarget,
} from '../../shared/ipc.js';
import { toSnapshot } from './batch-review.js';
import { getDb, persistDb, saveCachedFormAnswerDb } from '../db.js';
import { getMainWindow, log } from './app-context.js';
import { logAndSyncApplication } from './cloud-sync.js';
import { buildAutomationProfile, getMasterProfileRow } from './profile.js';
import { consumeApplyQuota, getEntitlements } from './entitlements.js';

const NO_PROFILE_ERR = 'No master profile saved. Fill in your profile first.';

/** Company/title from the saved job; otherwise the posting's host and a neutral label (never a made-up company or role). */
export function lookupSavedJob(url: string): { company: string; title: string } {
  let jobCompany = (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'Unknown company'; } })();
  let jobTitle = 'Role not recorded';
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
        status: 'prefilled',
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
/** Aborts the form being filled right now (its tab is closed); replaced at the start of every run. */
let fillAbort: AbortController | null = null;

function newFillSignal(): AbortSignal {
  fillAbort?.abort();
  fillAbort = new AbortController();
  return fillAbort.signal;
}

export function cancelAutonomousApply(): { success: boolean } {
  log('[Autonomous Auto-Apply] Cancellation requested by user.');
  isAutoApplyCanceled = true;
  batchRunSeq++;
  fillAbort?.abort();
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
  const signal = newFillSignal();
  log(`[Autonomous Auto-Apply] Starting automated submission for ${jobUrls.length} positions in external Chrome...`);
  try {
    const profile = buildAutomationProfile({ logCachedAnswers: true });
    if (!profile) {
      return { success: false, error: NO_PROFILE_ERR };
    }

    // 1. Plan check on the server (fail closed): autonomous apply is a Max entitlement.
    // Each submission below is also counted by consume_apply_quota before it starts.
    const ent = await getEntitlements({ fresh: true });
    if (!ent.success) {
      return { success: false, error: `${ent.error} Nothing was submitted.` };
    }
    if (ent.entitlements.accountStatus === 'suspended') {
      return { success: false, error: 'This account is suspended. Contact support.' };
    }
    if (!ent.entitlements.limits.autonomousApply) {
      return {
        success: false,
        error: 'Autonomous apply is part of the Max plan. Use "Apply with review" from the job board, or upgrade.',
        limitReached: true,
        currentUsage: ent.entitlements.usage.appliesToday,
        maxAllowed: ent.entitlements.limits.appliesPerDay ?? undefined,
      };
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

        const quota = await consumeApplyQuota(1);
        if (!quota.ok) {
          log(`[Plan Rules] Submission halted: ${quota.error}`);
          persistDb();
          return {
            success: applied > 0,
            applied,
            skipped,
            totalBatches: batches.length,
            error: quota.error,
            limitReached: quota.limitReached,
            currentUsage: quota.appliesUsed,
            maxAllowed: quota.appliesPerDay ?? undefined,
          };
        }

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
          }, { signal });
          if (result.cancelled) {
            log(`[Auto-Apply] Stopped while filling ${jobCompany}; nothing was submitted.`);
            break;
          }
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

// ── Batch pre-fill for review, then submit what the candidate reviewed ────────
// Each form is filled in the external browser with autoSubmit off and held open.
// Submission writes the reviewed values into that same tab and only then submits.
interface HeldApplication {
  target: BatchTarget;
  handle: ReviewHandle | null;
}
const heldApplications = new Map<string, HeldApplication>();
let batchRunSeq = 0;
let snapshotSeq = 0;

function sendBatchProgress(url: string, statusEvent: AutoApplyStatusEvent, snapshot?: BatchSnapshot): void {
  const mainWindow = getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) return;
  // The fill report travels in the snapshot; keep progress events small.
  const { report: _report, ...event } = statusEvent as AutoApplyStatusEvent & { report?: unknown };
  const payload: AutoApplyProgressEvent = { log: `[Apply] ${statusEvent.message}`, progress: statusEvent.progress, statusEvent: event, url, snapshot };
  mainWindow.webContents.send('auto-apply-progress', payload);
}

export async function startBatchCopilot(
  targets: BatchTarget[],
  options: BatchStartOptions = {}
): Promise<{ success: boolean; snapshots?: BatchSnapshot[]; cancelled?: boolean; error?: string }> {
  const seq = ++batchRunSeq;
  isAutoApplyCanceled = false;
  const signal = newFillSignal();
  const unique = [...new Map((targets || []).map((t) => [t.url, t])).values()];
  if (!options.keep) heldApplications.clear();
  for (const [id, held] of heldApplications) {
    if (unique.some((t) => t.url === held.target.url)) heldApplications.delete(id);
  }
  log(`[Apply] Pre-filling ${unique.length} application(s) for review (nothing is submitted)...`);

  const profile = buildAutomationProfile({ logCachedAnswers: true });
  if (!profile) return { success: false, error: NO_PROFILE_ERR };

  const snapshots: BatchSnapshot[] = [];
  for (const target of unique) {
    if (isAutoApplyCanceled || seq !== batchRunSeq) {
      log('[Apply] Pre-fill cancelled; remaining applications were not opened.');
      return { success: true, snapshots, cancelled: true };
    }
    const id = `app_${Date.now()}_${++snapshotSeq}`;
    let handle: ReviewHandle | null = null;
    let snapshot: BatchSnapshot;
    try {
      const result = await AutoApplyEngine.submitApplication(
        target.url,
        profile,
        (ev) => {
          if (typeof ev === 'string') log(ev);
          // Events carrying the final report are end-of-fill summaries; the snapshot below replaces them.
          else if (!ev.report) sendBatchProgress(target.url, ev);
          else log(`[Apply] ${ev.message}`);
        },
        { autoSubmit: false, jobTitle: target.title, company: target.company, onReadyForReview: (h) => { handle = h; }, signal }
      );
      if (result.cancelled || signal.aborted) {
        log(`[Apply] Stopped while filling ${target.company}; its tab was closed and nothing was submitted.`);
        return { success: true, snapshots, cancelled: true };
      }
      snapshot = toSnapshot(id, target, result, Boolean(handle), outcomeKey);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      snapshot = toSnapshot(id, target, null, false, outcomeKey, msg);
    }
    heldApplications.set(id, { target, handle });
    snapshots.push(snapshot);
    log(`[Apply] ${snapshot.company}: ${snapshot.status} (${snapshot.fields.filter((f) => f.status === 'filled').length} fields filled)`);
    sendBatchProgress(target.url, { phase: 'user_input_required', message: `Ready for your review: ${snapshot.company}`, colorState: snapshot.status === 'ready' ? 'green' : 'red' }, snapshot);
  }
  return { success: true, snapshots };
}

export async function submitAllBatchCopilot(
  overrides?: BatchOverrides,
  ids?: string[]
): Promise<BatchSubmitResult> {
  isAutoApplyCanceled = false;
  const seq = ++batchRunSeq;
  const chosen = ids ?? [...heldApplications.keys()];
  log(`[Apply] Submitting ${chosen.length} reviewed application(s)...`);
  try {
    getDb();
    if (overrides) {
      // Remember what the candidate wrote, keyed by question fingerprint, for future forms.
      for (const id of chosen) {
        for (const [k, v] of Object.entries(overrides[id] || {})) {
          if (v && v.trim().length > 0) saveCachedFormAnswerDb(k, v);
        }
      }
      persistDb();
    }

    const results: BatchSubmitItemResult[] = [];
    // Set once the server refuses the quota; every later application is left unsent.
    let refusal: string | null = null;
    let limitReached = false;
    let appliesRemaining: number | null | undefined;
    for (const id of chosen) {
      if (isAutoApplyCanceled || seq !== batchRunSeq) {
        results.push({ id, submitted: false, confirmed: false, error: 'Cancelled before submitting.' });
        continue;
      }
      if (refusal) {
        results.push({ id, submitted: false, confirmed: false, error: refusal });
        continue;
      }
      const held = heldApplications.get(id);
      if (!held?.handle) {
        results.push({ id, submitted: false, confirmed: false, error: 'This form is no longer open. Retry it to fill it again.' });
        continue;
      }
      // Server-side daily limit: counted right before this application is sent, never after.
      const quota = await consumeApplyQuota(1);
      if (!quota.ok) {
        refusal = quota.error ?? 'Your apply limit could not be checked. Nothing further was submitted.';
        limitReached = Boolean(quota.limitReached);
        if (quota.limitReached) appliesRemaining = 0;
        log(`[Apply] Not submitting: ${refusal}`);
        results.push({ id, submitted: false, confirmed: false, error: refusal });
        continue;
      }
      appliesRemaining = quota.appliesRemaining;
      const { target, handle } = held;
      try {
        const res = await AutoApplyEngine.submitReviewed(handle, overrides?.[id] ?? {}, (ev) => {
          if (typeof ev === 'string') log(ev);
          else sendBatchProgress(target.url, ev);
        });
        const confirmed = res.submitted && !res.error;
        results.push({ id, submitted: res.submitted, confirmed, error: res.error });
        if (res.submitted) heldApplications.delete(id);
        logAndSyncApplication({
          company: target.company || 'Direct ATS Posting',
          title: target.title || profileTitle(),
          apply_url: target.url,
          status: res.submitted ? 'submitted' : res.captchaDetected ? 'captcha_blocked' : res.requiresLogin ? 'requires_login' : 'failed',
          mode: 'batch_copilot',
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        log(`[Apply] Error submitting ${target.url}: ${msg}`);
        results.push({ id, submitted: false, confirmed: false, error: msg });
      }
    }

    const applied = results.filter((r) => r.submitted).length;
    return {
      success: true,
      applied,
      failed: results.length - applied,
      total: results.length,
      results,
      ...(refusal ? { error: refusal, limitReached } : {}),
      ...(appliesRemaining !== undefined ? { appliesRemaining } : {}),
    };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function profileTitle(): string {
  const row = getMasterProfileRow();
  return String(row?.['desired_title'] ?? '') || 'Application';
}
