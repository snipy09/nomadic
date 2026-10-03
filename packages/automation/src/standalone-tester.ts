import { chromium, type BrowserContext } from 'playwright';
import { runPortalAdapter, adapterFor } from './bots/portal-adapter.js';
import type { MasterProfile } from './auto-apply-engine.js';
import fs from 'fs';
import path from 'path';

// Generate a dummy resume PDF for testing
const pdfPath = 'C:\\Users\\sajal\\Downloads\\Sajal_Mishra_AutoApply_Test.pdf';
if (!fs.existsSync(pdfPath)) {
  fs.writeFileSync(pdfPath, '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n4 0 obj\n<< /Length 20 >>\nstream\nBT\n/F1 18 Tf\n50 720 Td\n(Test Candidate Resume) Tj\nET\nendstream\nendobj\n5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\nxref\n0 6\n0000000000 65535 f\n0000000010 00000 n\n0000000060 00000 n\n0000000117 00000 n\n0000000234 00000 n\n0000000300 00000 n\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n400\n%%EOF', 'utf8');
}

const TEST_PROFILE: MasterProfile = {
  firstName: 'Sajal',
  lastName: 'Mishra',
  fullName: 'Sajal Mishra',
  email: 'sajalmishra0906@gmail.com',
  phone: '+919493833632',
  linkedin: 'https://linkedin.com/in/sajalm',
  github: 'https://github.com/snipy09',
  portfolio: 'https://jobmaxxer.com',
  location: 'San Francisco, CA, USA',
  desiredTitle: 'Software Engineer',
  techStack: 'TypeScript, React, Node.js, Python, PostgreSQL, AWS',
  desiredSalary: '30 LPA / $140,000',
  noticePeriod: 'Immediately (0 days)',
  currentCompany: 'Nomadic Labs',
  university: 'VIT Bhopal',
  gpa: '8.5',
  graduationYear: '2024',
  degree: 'Bachelor of Technology in Computer Science',
  resumeFilePath: pdfPath,
  summaryText: 'Result-oriented Software Engineer with a passion for building high-scale automated systems, web scraping architectures, and AI-powered workflow applications. Hands-on experience optimizing React and Electron applications.',
};

async function runStandaloneTest(jobUrl: string) {
  console.log(`\n======================================================`);
  console.log(`🚀 NOMADIC STANDALONE BOT TESTER`);
  console.log(`🌐 Target: ${jobUrl}`);
  console.log(`======================================================\n`);

  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled'],
  });

  const context: BrowserContext = await browser.newContext({ viewport: null });
  const page = await context.newPage();
  
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });
  });

  console.log(`[Navigating] Loading job portal...`);
  await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
  await page.waitForTimeout(2000);

  console.log(`\n⚡ [FormEngine] Filling (never submits)...`);
  try {
    const { report } = await runPortalAdapter(page, TEST_PROFILE, adapterFor(page.url()), {
      onEvent: (e) => console.log(`   [${e.type}] ${'label' in e && e.label ? e.label + ': ' : ''}${'message' in e ? e.message : 'reason' in e ? e.reason : 'value' in e ? e.value : ''}`),
    });

    console.log(`\n======================================================`);
    console.log(`✅ [FORM ENGINE COMPLETED]`);
    console.log(`   - Filled: ${report.filled}`);
    console.log(`   - Needs you: ${report.needsUser}`);
    console.log(`   - Failed: ${report.failed}`);
    console.log(`   - Required unresolved: ${report.unresolvedRequired.map((o) => o.field.label).join('; ') || 'none'}`);
    console.log(`   - Walls: ${report.walls.join(', ') || 'none'}`);
    console.log(`   - Ready to submit: ${report.readyToSubmit}`);
    console.log(`======================================================`);

    console.log(`\n👀 Review the open Chrome window. Close it when finished.`);

    await new Promise(() => {});
  } catch (err: any) {
    console.error(`\n❌ [TEST ENGINE ERROR]: ${err.message}`);
  }
}

const testUrl = process.argv[2];
if (!testUrl) {
  console.error('Please provide a target job URL! Example: npx tsx src/standalone-tester.ts "https://jobs.ashbyhq.com/..."');
  process.exit(1);
}

runStandaloneTest(testUrl);
