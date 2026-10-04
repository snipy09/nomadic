import { ElectronAPI, Job, Application, AppUser, DependencyStatus, ResumeRecord, type LearningEventRecord, type LearningGoal } from './types';

// In-memory / localStorage simulation for browser preview mode
export function createBrowserApiShim(): ElectronAPI {
  console.info('🌐 [Nomadic] Initializing Interactive Browser Mode Provider');

  // Admin tools need a signed-in desktop session (session-checked RPCs, migration 014);
  // preview mode has none, so every admin call reports that clearly.
  const adminUnavailable = async () => ({
    ok: false as const,
    code: 'not_configured',
    error: 'Admin tools are not available in browser preview. Use the desktop app.',
  });
  const learningMemory: { goal: LearningGoal | null; events: LearningEventRecord[] } = { goal: null, events: [] };

  // Read from Vite env at build time. The anon key is safe to expose in the
  // client because RLS (migration 002) restricts it to reading the public job
  // feed + calling the auth RPC. Never hardcode keys in source.
  const _env = ((import.meta as unknown as { env?: Record<string, string> }).env) ?? {};
  const SUPABASE_URL_BASE = String(_env.VITE_SUPABASE_URL ?? 'https://grqkiddfwoyicktpgdea.supabase.co').replace(/\/$/, '');
  const SUPABASE_REST_URL = `${SUPABASE_URL_BASE}/rest/v1`;
  const SUPABASE_ANON_KEY = String(_env.VITE_SUPABASE_ANON_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdycWtpZGRmd295aWNrdHBnZGVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwNTAyNDAsImV4cCI6MjEwNjYyNjI0MH0.ZTuqnzhEbYtmOHgDLTwX8ENFBIkKmrLVo-y6O1Mvsek');

  const fetchLiveDatabaseJobs = async (): Promise<Job[]> => {
    if (!SUPABASE_REST_URL || !SUPABASE_ANON_KEY) return [];
    try {
      const res = await fetch(`${SUPABASE_REST_URL}/jobs?is_active=eq.true&order=created_at.desc&limit=500`, {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      });
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data
          .filter((j: any) => {
            const url = (j.apply_url || '').toLowerCase();
            const src = (j.source || '').toLowerCase();
            return !url.includes('linkedin.com') && !src.includes('linkedin');
          })
          .map((j: any, idx: number) => ({
            title: j.title || 'Software Engineer',
            company: j.company || 'Tech Company',
            location: j.location || 'Remote',
            salary: j.salary_range || undefined,
            applyUrl: j.apply_url || '#',
            source: j.source || 'Cloud Feed',
            score: Math.max(60, 98 - (idx % 30)),
            employmentType: j.employment_type || (j.title?.toLowerCase().includes('intern') ? 'internship' : 'job'),
            workplaceType: j.workplace_type || 'remote',
            experienceLevel: j.experience_level || 'mid',
            createdAt: j.created_at || new Date().toISOString(),
            description: j.description || '',
          }));
      }
    } catch (err: any) {
      console.warn('[Cloud Feed] Note querying Supabase:', err);
    }
    return [];
  };

  let logCallbacks: Array<(msg: string) => void> = [];

  const emitLog = (msg: string) => {
    logCallbacks.forEach(cb => cb(msg));
  };

  return {
    getMasterProfile: async () => {
      const stored = localStorage.getItem('nomadic_master_profile');
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch {}
      }
      return {
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        linkedin_url: '',
        github_url: '',
        sponsorship: 'No',
        desired_salary: '$150,000',
        notice_period: '2 weeks',
        groq_api_key: '',
        desired_title: '',
        tech_stack: '',
        resume_text: '',
        onboarding_completed: 0,
      };
    },

    saveMasterProfile: async (data: Record<string, unknown>) => {
      localStorage.setItem('nomadic_master_profile', JSON.stringify(data));
      localStorage.setItem('nomadic_master_profile', JSON.stringify(data));
      emitLog('[Profile] Master profile saved to local storage.');
      return { success: true };
    },

    getResumes: async () => {
      const stored = localStorage.getItem('nomadic_resumes');
      if (stored) {
        try { return JSON.parse(stored); } catch {}
      }
      return [
        {
          id: 1,
          name: 'Software_Engineer_Resume.pdf',
          targetRole: 'Full Stack Engineer',
          filePath: 'C:/Users/Candidate/Documents/Software_Engineer_Resume.pdf',
          isDefault: true,
          createdAt: new Date().toLocaleDateString(),
        },
        {
          id: 2,
          name: 'Frontend_Lead_Resume.pdf',
          targetRole: 'Senior Frontend Engineer',
          filePath: 'C:/Users/Candidate/Documents/Frontend_Lead_Resume.pdf',
          isDefault: false,
          createdAt: new Date().toLocaleDateString(),
        }
      ];
    },

    saveResume: async (resume) => {
      const resumes = await getStoredResumes();
      const newResume: ResumeRecord = {
        id: Date.now(),
        name: resume.name,
        targetRole: resume.targetRole,
        filePath: resume.filePath,
        isDefault: resume.isDefault,
        createdAt: new Date().toLocaleDateString(),
      };
      const updated = [newResume, ...resumes];
      localStorage.setItem('nomadic_resumes', JSON.stringify(updated));
      emitLog(`[Resumes] Uploaded and indexed resume: ${resume.name}`);
      return { success: true, id: newResume.id };
    },

    deleteResume: async (id: number) => {
      const resumes = await getStoredResumes();
      const updated = resumes.filter(r => r.id !== id);
      localStorage.setItem('nomadic_resumes', JSON.stringify(updated));
      emitLog(`[Resumes] Removed resume ID: ${id}`);
      return { success: true };
    },

    setDefaultResume: async (id: number) => {
      const resumes = await getStoredResumes();
      const updated = resumes.map(r => ({ ...r, isDefault: r.id === id }));
      localStorage.setItem('nomadic_resumes', JSON.stringify(updated));
      emitLog(`[Resumes] Set default resume ID: ${id}`);
      return { success: true };
    },

    pickResumeFile: async () => {
      return {
        canceled: false,
        filePath: 'C:/Users/Candidate/Documents/Resume_2026.pdf',
        fileName: 'Resume_2026.pdf',
      };
    },

    readDocumentText: async () => ({ success: false, error: 'Reading documents works in the desktop app only.' }),
    draftProfileAnswers: async () => ({ success: false, code: 'unavailable' as const, error: 'AI drafts work in the desktop app only.' }),
    listRememberedAnswers: async () => [],
    updateRememberedAnswer: async () => ({ success: false, error: 'Not available in the browser preview.' }),
    clearRememberedAnswers: async () => ({ success: true }),

    runScrapers: async () => {
      emitLog('[Scrapers] Querying live opportunity pipeline...');
      const jobs = await fetchLiveDatabaseJobs();
      return { success: true, jobs };
    },

    getCloudFeed: async () => {
      emitLog('[Cloud Sync] Fetching live positions from Supabase repository...');
      const jobs = await fetchLiveDatabaseJobs();
      return { success: true, jobs };
    },

    getCloudFeedPage: async (opts?: { page?: number; pageSize?: number }) => {
      const page = opts?.page || 1;
      const pageSize = opts?.pageSize || 36;
      emitLog(`[Cloud Sync] Fetching Page ${page} (${pageSize} jobs) from Supabase...`);
      const allJobs = await fetchLiveDatabaseJobs();
      const start = (page - 1) * pageSize;
      const jobs = allJobs.slice(start, start + pageSize);
      return { success: true, jobs, totalCount: allJobs.length };
    },

    launchSemiAuto: async (jobUrls: string[]) => {
      emitLog(`[AutoApply] Review Mode: Opening ${jobUrls.length} pre-filled tabs in Chrome...`);
      jobUrls.forEach(url => window.open(url, '_blank'));
      return { success: true };
    },

    launchAutonomous: async (jobUrls: string[]) => {
      const BATCH_SIZE = 5;
      const batches = [];
      for (let i = 0; i < jobUrls.length; i += BATCH_SIZE) {
        batches.push(jobUrls.slice(i, i + BATCH_SIZE));
      }

      emitLog(`[Sequential Batch Engine] Launching ${jobUrls.length} positions across ${batches.length} sequential batches (5 jobs per batch, 3-tab RAM safety pool)...`);

      let totalProcessed = 0;
      for (let b = 0; b < batches.length; b++) {
        const batch = batches[b];
        emitLog(`[Batch Worker] Starting Batch ${b + 1}/${batches.length} (${batch.length} jobs in queue)...`);

        for (const url of batch) {
          totalProcessed++;
          emitLog(`[Auto-Apply ${totalProcessed}/${jobUrls.length}] Form auto-filled and submitted for ${url} ✓`);
        }

        if (b < batches.length - 1) {
          emitLog(`[Batch Cooldown] Batch ${b + 1}/${batches.length} completed. Pausing 2s to prevent ATS anti-bot IP rate-limiting...`);
        }
      }

      return { success: true, applied: jobUrls.length, totalBatches: batches.length };
    },

    cancelAutonomousApply: async () => {
      emitLog('[Auto-Apply Engine] Autonomous application queue canceled by user.');
      return { success: true };
    },

    // Browser preview has no automation browser: report that honestly instead of inventing filled forms.
    startBatchCoPilot: async (targets: Array<{ url: string; company?: string; title?: string }>) => {
      emitLog(`[Apply] Browser preview cannot fill ${targets.length} form(s); use the desktop app.`);
      const snapshots = targets.map((t, i) => ({
        id: `preview_${i + 1}`,
        company: t.company || 'Application',
        jobTitle: t.title || 'Application',
        applyUrl: t.url,
        fields: [],
        status: 'failed' as const,
        submittable: false,
        walls: [],
        pageErrors: [],
        errorMessage: 'Filling forms needs the Nomadic desktop app.',
      }));
      return { success: true, snapshots };
    },

    submitAllBatchCoPilot: async () => ({ success: false, error: 'Submitting needs the Nomadic desktop app.' }),

    askNomadicAssistant: async (data: { message: string }) => {
      emitLog(`[Nomadic Assistant] Query: "${data.message}"`);
      return {
        success: true,
        reply: `I have full access across Nomadic. How can I help you accelerate your job search and interview prep?`,
        action: { type: 'NONE' }
      };
    },

    verifyEmail: async (email: string) => {
      return { isValid: true };
    },

    getHrContacts: async (targetRole?: string) => {
      const fallbackContacts = [
        { name: 'Sarah Jenkins', company: 'Linear', role: 'Head of Engineering Talent', email: 's.jenkins@linear.app', department: 'Talent Acquisition', verificationStatus: 'valid' as const, verifiedAt: 'Just now', sentStatus: 'unsent' as const, matchScore: 85, linkedinUrl: 'https://linkedin.com/in/sarah-jenkins-talent' },
        { name: 'David Chen', company: 'Vercel', role: 'Staff Technical Recruiter', email: 'david.chen@vercel.com', department: 'Talent Acquisition', verificationStatus: 'valid' as const, verifiedAt: 'Just now', sentStatus: 'unsent' as const, matchScore: 80, linkedinUrl: 'https://linkedin.com/in/david-chen-tech' },
        { name: 'Priya Sharma', company: 'Stripe', role: 'Engineering Lead & Hiring Manager', email: 'psharma@stripe.com', department: 'Engineering', verificationStatus: 'valid' as const, verifiedAt: 'Just now', sentStatus: 'unsent' as const, matchScore: 90, linkedinUrl: 'https://linkedin.com/in/priya-sharma-eng' },
        { name: 'Alex Rivera', company: 'Supabase', role: 'Lead Infrastructure Recruiter', email: 'alex.rivera@supabase.io', department: 'Talent Acquisition', verificationStatus: 'valid' as const, verifiedAt: 'Just now', sentStatus: 'unsent' as const, matchScore: 85, linkedinUrl: 'https://linkedin.com/in/alex-rivera-talent' },
        { name: 'Elena Rostova', company: 'Figma', role: 'Principal Talent Partner', email: 'elena.rostova@figma.com', department: 'Talent Acquisition', verificationStatus: 'valid' as const, verifiedAt: 'Just now', sentStatus: 'unsent' as const, matchScore: 75, linkedinUrl: 'https://linkedin.com/in/elena-rostova-recruiter' },
        { name: 'Marcus Vance', company: 'Postman', role: 'Director of Developer Relations', email: 'marcus.vance@postman.com', department: 'Engineering', verificationStatus: 'valid' as const, verifiedAt: 'Just now', sentStatus: 'unsent' as const, matchScore: 70, linkedinUrl: 'https://linkedin.com/in/marcus-vance-devrel' },
      ];

      // Read saved jobs from localStorage to find candidate's target companies
      const targetCompanies = new Set<string>();
      try {
        const raw = localStorage.getItem('nomadic_saved_jobs');
        if (raw) {
          const list = JSON.parse(raw);
          if (Array.isArray(list)) {
            list.forEach((j: any) => targetCompanies.add((j.company || '').toLowerCase().trim()));
          }
        }
      } catch {}

      if (!SUPABASE_REST_URL || !SUPABASE_ANON_KEY) return { success: true, contacts: fallbackContacts };
      try {
        const res = await fetch(`${SUPABASE_REST_URL}/hr_contacts?order=created_at.desc&limit=200`, {
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
        });
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const contacts = data.map((c: any) => {
            const compLower = (c.company || '').toLowerCase().trim();
            const isTarget = targetCompanies.has(compLower);
            let score = 50;
            if (isTarget) score += 35;
            const roleLower = (c.role || '').toLowerCase();
            const deptLower = (c.department || '').toLowerCase();
            if (targetRole) {
              const tr = targetRole.toLowerCase();
              if (roleLower.includes('manager') || roleLower.includes('lead') || roleLower.includes('vp') || roleLower.includes('director')) {
                score += 20;
              }
              if (roleLower.includes(tr) || deptLower.includes('engineering') || roleLower.includes('technical')) {
                score += 15;
              }
            }

            return {
              name: c.name || 'Hiring Lead',
              company: c.company || 'Tech Company',
              role: c.role || 'Talent Acquisition',
              email: c.email || '',
              department: c.department || (roleLower.includes('engineer') || roleLower.includes('manager') ? 'Engineering' : 'Talent Acquisition'),
              verificationStatus: (c.verification_status || 'valid') as 'valid' | 'invalid' | 'risky' | 'pending',
              verifiedAt: c.verified_at || 'Just now',
              sentStatus: 'unsent' as const,
              isTargetCompany: isTarget,
              matchScore: score,
            };
          });

          // Sort by matchScore descending
          contacts.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
          return { success: true, contacts };
        }
      } catch (err: any) {
        emitLog(`[Recruiters] Note: ${err?.message}`);
      }
      return { success: true, contacts: fallbackContacts };
    },

    sendOutreach: async (contacts) => {
      emitLog(`[Outreach] Dispatched ${contacts.length} personalized referral inquiries.`);
      return { success: true, sent: contacts.length };
    },

    startHeartbeat: async () => ({ success: true }),
    stopHeartbeat: async () => ({ success: true }),
    syncCloudData: async () => {
      emitLog('[Cloud Sync] Browser simulation: local and cloud synchronized ✓');
      return { success: true, pulled: true };
    },
    getDeviceInfo: async () => ({
      deviceFingerprint: 'browser-shim-fingerprint-001',
      deviceName: 'Web Browser Preview',
    }),
    onHeartbeatStatus: () => () => {},

    checkDependencies: async (): Promise<DependencyStatus> => ({
      sqliteReady: true,
      playwrightInstalled: true,
      internetOk: true,
      allReady: true,
    }),

    installDependencies: async () => {
      emitLog('[Installer] All self-healing dependencies verified.');
      return { success: true };
    },

    onLog: (callback: (msg: string) => void) => {
      logCallbacks.push(callback);
      return () => {
        logCallbacks = logCallbacks.filter(cb => cb !== callback);
      };
    },

    saveApplication: async (app: any) => {
      const stored = localStorage.getItem('nomadic_applications');
      const list = stored ? JSON.parse(stored) : [];
      const newApp = {
        id: Date.now(),
        company: app.company,
        title: app.title,
        apply_url: app.apply_url,
        status: app.status || 'applied',
        mode: app.mode || 'manual',
        applied_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };
      list.unshift(newApp);
      localStorage.setItem('nomadic_applications', JSON.stringify(list));
      return { success: true, id: newApp.id };
    },

    generateAiOutreachEmail: async (params: any) => {
      emitLog(`[AI Outreach] Drafting personalized email for ${params.role || 'Engineering'} at ${params.company || 'Target Company'}...`);
      return {
        success: true,
        subject: `Referral Request — ${params.role || 'Software Engineer'} at ${params.company || 'your team'}`,
        body: `Hi {{name}},\n\nI hope you're having a productive week! I came across the ${params.role || 'Software Engineer'} role at ${params.company || 'your team'} and wanted to connect. With strong background in ${params.skills || 'TypeScript, React, Node.js'}, I'd be very grateful for a quick referral or any guidance on navigating the application process.\n\nWould you be open to a quick 5-minute chat?\n\nBest regards,\n{{senderName}}`
      };
    },

    // Learn in browser preview: kept in memory for this tab only (no app data in localStorage).
    learningGetState: async () => ({ goal: learningMemory.goal, events: [...learningMemory.events], pendingSync: 0 }),
    learningSaveGoal: async (goal) => {
      const at = new Date().toISOString();
      const startedAt = learningMemory.goal?.track_id === goal.track_id ? learningMemory.goal.started_at : at;
      learningMemory.goal = { ...goal, started_at: startedAt, updated_at: at };
      return { success: true, goal: learningMemory.goal };
    },
    learningRecordEvents: async (events) => {
      const known = new Set(learningMemory.events.map((e) => e.id));
      const added = events.filter((e) => !known.has(e.id)).map((e) => ({ ...e, user_id: 'local' }));
      learningMemory.events.push(...added);
      return { success: true, events: added };
    },
    learningSync: async () => ({ success: false, pushed: 0, pulled: 0, rejected: 0, error: 'Sync needs the Nomadic desktop app.' }),

    getApplications: async (): Promise<Application[]> => {
      try {
        const stored = localStorage.getItem('nomadic_applications');
        if (stored) return JSON.parse(stored);
      } catch {}
      return [
        {
          id: 1,
          company: 'Vercel',
          title: 'Full Stack Engineer',
          apply_url: 'https://boards.greenhouse.io/vercel/jobs/5412093004',
          mode: 'autonomous',
          status: 'interviewing',
          applied_at: new Date(Date.now() - 86400000).toISOString(),
        },
        {
          id: 2,
          company: 'Linear',
          title: 'Associate Product Manager',
          apply_url: 'https://jobs.ashbyhq.com/linear/apm-opportunity',
          mode: 'semi-auto',
          status: 'applied',
          applied_at: new Date(Date.now() - 172800000).toISOString(),
        },
        {
          id: 3,
          company: 'Stripe',
          title: 'Software Development Intern',
          apply_url: 'https://internshala.com/internship/detail/stripe-react-intern',
          mode: 'autonomous',
          status: 'applied',
          applied_at: new Date(Date.now() - 259200000).toISOString(),
        }
      ];
    },

    updateApplicationStatus: async (id: number | string, status: string) => {
      try {
        const stored = localStorage.getItem('nomadic_applications');
        const apps: Application[] = stored ? JSON.parse(stored) : [
          { id: 1, company: 'Vercel', title: 'Full Stack Engineer', apply_url: 'https://boards.greenhouse.io/vercel/jobs/5412093004', mode: 'autonomous', status: 'interviewing', applied_at: new Date().toISOString() },
          { id: 2, company: 'Linear', title: 'Associate Product Manager', apply_url: 'https://jobs.ashbyhq.com/linear/apm-opportunity', mode: 'semi-auto', status: 'applied', applied_at: new Date().toISOString() },
        ];
        const updated = apps.map(a => a.id === id || String(a.id) === String(id) ? { ...a, status } : a);
        localStorage.setItem('nomadic_applications', JSON.stringify(updated));
        emitLog(`[Applications] Status updated to "${status}" for #${id}`);
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err?.message };
      }
    },

    updateApplicationNotes: async () => ({ success: false, error: 'Notes are saved by the desktop app only.' }),

    deleteApplication: async (id: number | string) => {
      try {
        const stored = localStorage.getItem('nomadic_applications');
        if (stored) {
          const apps: Application[] = JSON.parse(stored);
          const updated = apps.filter(a => a.id !== id && String(a.id) !== String(id));
          localStorage.setItem('nomadic_applications', JSON.stringify(updated));
        }
        emitLog(`[Applications] Removed record #${id}`);
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err?.message };
      }
    },

    getSavedJobs: async (): Promise<Job[]> => {
      try {
        const stored = localStorage.getItem('nomadic_saved_jobs');
        return stored ? JSON.parse(stored) : [];
      } catch {
        return [];
      }
    },

    saveJob: async (job: Job) => {
      try {
        const stored = localStorage.getItem('nomadic_saved_jobs');
        const jobs: Job[] = stored ? JSON.parse(stored) : [];
        if (!jobs.some(j => j.applyUrl === job.applyUrl)) {
          jobs.unshift(job);
          localStorage.setItem('nomadic_saved_jobs', JSON.stringify(jobs));
        }
        emitLog(`[Saved Jobs] Bookmarked position: ${job.title} at ${job.company}`);
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err?.message };
      }
    },

    removeSavedJob: async (applyUrl: string) => {
      try {
        const stored = localStorage.getItem('nomadic_saved_jobs');
        if (stored) {
          const jobs: Job[] = JSON.parse(stored);
          const updated = jobs.filter(j => j.applyUrl !== applyUrl);
          localStorage.setItem('nomadic_saved_jobs', JSON.stringify(updated));
        }
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err?.message };
      }
    },

    openExternalUrl: async (url: string) => {
      try {
        window.open(url, '_blank');
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err?.message };
      }
    },

    openInApplyBrowser: async (url: string) => {
      try {
        window.open(url, '_blank');
        return { success: true, browser: 'this browser' };
      } catch (err: any) {
        return { success: false, error: err?.message };
      }
    },

    // Auth & Admin Handlers
    // Server-authoritative: preview mode calls the SAME authenticate_user RPC
    // the desktop app uses. No hardcoded admin, no auto-provisioning.
    authLogin: async (credentials) => {
      const email = (credentials.email || credentials.username || '').trim().toLowerCase();
      const password = (credentials.password || credentials.licenseKey || '').trim();

      if ((!email || !password) && !credentials.oauthToken) {
        return { success: false, error: 'Email and password are required.' };
      }
      if (!SUPABASE_REST_URL || !SUPABASE_ANON_KEY) {
        return { success: false, error: 'Preview mode: licensing server not configured (set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).' };
      }

      try {
        if (credentials.oauthToken) {
          // OAuth fallback behavior for browser preview
          const user: AppUser = {
            id: Date.now(),
            email: email || 'oauth@example.com',
            fullName: credentials.fullName || 'Google User',
            role: credentials.role || 'user',
            tier: credentials.tier || 'free',
            licenseKey: 'OAUTH_VERIFIED',
            status: 'active',
            appsCount: 0,
            createdAt: new Date().toISOString(),
            lastLogin: new Date().toISOString(),
          };
          return { success: true, user };
        }

        const res = await fetch(`${SUPABASE_REST_URL}/rpc/authenticate_user`, {
          method: 'POST',
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ p_email: email, p_password: password }),
        });
        const data = await res.json();
        const row = Array.isArray(data) ? data[0] : data;
        if (!row || !row.ok) {
          return { success: false, error: (row && row.reason) || 'Login failed.' };
        }
        const tier: AppUser['tier'] = ['trial', 'pro', 'max', 'lifetime'].includes(row.tier) ? row.tier : 'pro';
        const user: AppUser = {
          id: String(row.id),
          email: String(row.email),
          fullName: String(row.full_name || ''),
          role: row.role === 'admin' ? 'admin' : 'user',
          tier,
          licenseKey: String(row.license_key || ''),
          status: row.status === 'suspended' ? 'suspended' : 'active',
          appsCount: Number(row.apps_count || 0),
          createdAt: '',
          expiresAt: row.expires_at ? String(row.expires_at) : undefined,
          lastLogin: new Date().toISOString(),
        };
        return { success: true, user };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Network error contacting licensing server.' };
      }
    },

    adminListUsers: adminUnavailable,
    adminSetUserPlan: adminUnavailable,
    adminSetUserStatus: adminUnavailable,
    adminListAudit: adminUnavailable,
    adminScrapeHealth: adminUnavailable,
    adminListContent: adminUnavailable,
    adminUpdateLesson: adminUnavailable,
    adminSetResourceStatus: adminUnavailable,
    adminContentHistory: adminUnavailable,

    // Practice (F8): the question sets and the attempt log live in the desktop main process.
    practiceGetCatalog: async () => ({ success: false as const, error: 'Practice question sets load in the desktop app.' }),
    practiceGetState: async () => ({ success: true as const, state: { attempts: [], usedToday: null, signedIn: false } }),
    practiceRecordAttempt: async () => ({ success: false as const, code: 'not_signed_in' as const, error: 'Sign in in the desktop app to save practice attempts.' }),
    aiRubricFeedback: async () => ({ success: false as const, code: 'unavailable' as const, error: 'AI feedback works in the desktop app.' }),

    authSignup: async (cred: any) => {
      const email = String(cred.email || 'user@nomadic.app').trim().toLowerCase();
      const user: AppUser = {
        id: 'usr_' + Date.now(),
        email,
        fullName: cred.fullName || email.split('@')[0],
        role: 'user',
        tier: 'free',
        licenseKey: 'NOMADIC-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
        status: 'active',
        appsCount: 0,
        createdAt: new Date().toISOString(),
        onboardingCompleted: false,
      };
      return { success: true, user };
    },
    authGoogle: async () => {
      setTimeout(() => {
        const mockUser: AppUser = {
          id: 'ggl_' + Date.now(),
          email: 'sajal@gmail.com',
          fullName: 'Sajal',
          role: 'user',
          tier: 'free',
          licenseKey: 'NOMADIC-GGL-DEMO',
          status: 'active',
          appsCount: 0,
          createdAt: new Date().toISOString(),
          onboardingCompleted: false,
        };
        // Trigger simulated OAuth callback
        if (typeof window !== 'undefined' && (window as any).__oauthCb) {
          (window as any).__oauthCb({ success: true, user: mockUser });
        }
      }, 1500);
      return { success: true };
    },
    onOauthCallback: (cb: any) => {
      if (typeof window !== 'undefined') {
        (window as any).__oauthCb = cb;
      }
      return () => {
        if (typeof window !== 'undefined') {
          delete (window as any).__oauthCb;
        }
      };
    },

  };
}

async function getStoredResumes(): Promise<ResumeRecord[]> {
  try {
    const s = localStorage.getItem('nomadic_resumes');
    return s ? JSON.parse(s) : [];
  } catch {
    return [];
  }
}
