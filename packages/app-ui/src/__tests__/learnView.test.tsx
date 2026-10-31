// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UIProvider } from '@nomadic/ui';
import { normaliseCapstone, normaliseRoleRoadmap, type RoleRoadmap } from '@job-automator/learning';
import './radixShims';
import { LearnView } from '../features/learn/LearnView';

afterEach(() => { cleanup(); delete (window as any).api; });

const TREE = {
  summary: 'What a quant trader needs.',
  subjects: [
    { title: 'Mathematics', why: 'Pricing and risk are applied probability.', modules: [
      { title: 'Probability', summary: 'Reason about uncertainty', topics: [
        { title: 'Basic probability', covers: 'Sample spaces, events, counting', search: 'basic probability counting' },
        { title: 'Conditional probability', covers: 'Bayes rule', search: 'conditional probability bayes theorem' },
      ] },
      { title: 'Calculus', summary: 'Rates of change', topics: [{ title: 'Derivatives', covers: 'Slopes', search: 'derivatives calculus' }] },
    ] },
    { title: 'Programming', why: 'Ideas are tested in code.', modules: [{ title: 'Python', summary: '', topics: [{ title: 'NumPy', covers: 'Arrays', search: 'numpy tutorial' }] }] },
  ],
  projects: [
    { title: 'Backtest a moving-average strategy', brief: 'Test a crossover on index data', deliverable: 'A notebook and a report', level: 'starter', hours: 12, uses: ['Python', 'Probability'] },
    { title: 'Option pricer', brief: 'Price calls and puts', deliverable: 'A Python module', level: 'intermediate', hours: 16, uses: ['Calculus'] },
  ],
};
const ROADMAP = normaliseRoleRoadmap(TREE, { role: 'Quant trader', level: 'beginner', note: '' }, { id: '00000000-0000-4000-8000-0000000000aa', now: new Date() })!;
const CAPSTONE = normaliseCapstone(
  { milestones: [{ title: 'Get the data', steps: [{ title: 'Download index prices', detail: 'Use a free source', done_when: 'You have a table of prices', search: 'download nifty prices python' }] }] },
  ROADMAP.projects[0].id,
  new Date()
)!;

function mockApi(state: Partial<{ roleRoadmap: RoleRoadmap | null; roadmap: unknown; events: any[] }> = {}, over: Record<string, unknown> = {}) {
  const api = {
    learningGetState: vi.fn().mockResolvedValue({
      events: state.events ?? [], pendingSync: 0, roadmap: state.roadmap ?? null, schedule: null, projects: [], notes: [], draft: null,
      roleRoadmap: state.roleRoadmap ?? null,
    }),
    learningRecordEvents: vi.fn(async (events: any[]) => ({ success: true, events: events.map((e) => ({ ...e, user_id: 'u1' })) })),
    learningSync: vi.fn().mockResolvedValue({ success: false, pushed: 0, pulled: 0, rejected: 0 }),
    learnRoleRoadmapGenerate: vi.fn(async (req: any) => ({ success: true, roadmap: { ...ROADMAP, role: req.role }, notice: null })),
    learnRoleRoadmapSave: vi.fn(async (roadmap: RoleRoadmap) => ({ success: true, roadmap, notice: null })),
    learnCapstoneGenerate: vi.fn(async () => ({ success: true, roadmap: { ...ROADMAP, capstone: CAPSTONE }, notice: null })),
    learnCapstoneHelp: vi.fn(async () => ({ success: true, answer: 'Start with a free daily price file.', nextSteps: ['Load it with pandas'], code: null, quota: null })),
    openExternalUrl: vi.fn().mockResolvedValue({ success: true }),
    ...over,
  };
  (window as any).api = api;
  return api;
}

const renderLearn = (props: Partial<React.ComponentProps<typeof LearnView>> = {}) =>
  render(<UIProvider><LearnView currentUser={{ tier: 'free' }} onOpenUpgrade={vi.fn()} {...props} /></UIProvider>);

describe('LearnView (a roadmap for any role)', () => {
  it('builds a roadmap for any typed role, starting from the profile\'s target role', async () => {
    const api = mockApi();
    renderLearn({ suggestedRole: 'Quant trader' });
    expect(await screen.findByRole('heading', { name: /which role do you want to prepare for/i })).toBeTruthy();
    const role = screen.getByRole('textbox', { name: /^role$/i }) as HTMLInputElement;
    expect(role.value).toBe('Quant trader');
    await userEvent.click(screen.getByRole('radio', { name: /some basics/i }));
    await userEvent.type(screen.getByLabelText(/anything to focus on/i), 'More on options');
    await userEvent.click(screen.getByRole('button', { name: /build my roadmap/i }));
    await waitFor(() => expect(api.learnRoleRoadmapGenerate).toHaveBeenCalledWith({ role: 'Quant trader', level: 'intermediate', note: 'More on options' }));
    expect(await screen.findByRole('heading', { name: 'Quant trader', level: 1 })).toBeTruthy();
    expect(screen.getByText(/start here/i)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Basic probability' })).toBeTruthy();
  });

  it('suggests roles without limiting the choice, and asks for a role before building', async () => {
    const api = mockApi();
    renderLearn();
    await screen.findByRole('heading', { name: /which role do you want to prepare for/i });
    await userEvent.click(screen.getByRole('button', { name: /build my roadmap/i }));
    expect(await screen.findByText('Type the role you want to prepare for.')).toBeTruthy();
    expect(api.learnRoleRoadmapGenerate).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Chartered accountant' }));
    expect((screen.getByRole('textbox', { name: /^role$/i }) as HTMLInputElement).value).toBe('Chartered accountant');
    await userEvent.clear(screen.getByRole('textbox', { name: /^role$/i }));
    await userEvent.type(screen.getByRole('textbox', { name: /^role$/i }), 'Supply chain analyst at an FMCG company');
    await userEvent.click(screen.getByRole('button', { name: /build my roadmap/i }));
    await waitFor(() => expect(api.learnRoleRoadmapGenerate.mock.calls[0][0].role).toBe('Supply chain analyst at an FMCG company'));
  });

  it('shows why building failed and keeps the setup', async () => {
    mockApi({}, { learnRoleRoadmapGenerate: vi.fn().mockResolvedValue({ success: false, error: 'Sign in to use AI roadmaps.' }) });
    renderLearn({ suggestedRole: 'Quant trader' });
    await userEvent.click(await screen.findByRole('button', { name: /build my roadmap/i }));
    expect(await screen.findByText('Sign in to use AI roadmaps.')).toBeTruthy();
    expect((screen.getByRole('textbox', { name: /^role$/i }) as HTMLInputElement).value).toBe('Quant trader');
  });

  it('gives every topic its own YouTube search and ChatGPT prompt', async () => {
    const api = mockApi({ roleRoadmap: ROADMAP });
    renderLearn();
    const row = (await screen.findAllByRole('listitem')).find((li) => li.textContent?.startsWith('Conditional probability'))!;
    await userEvent.click(within(row).getByRole('button', { name: /learn conditional probability on youtube/i }));
    expect(api.openExternalUrl).toHaveBeenLastCalledWith('https://www.youtube.com/results?search_query=conditional%20probability%20bayes%20theorem');
    await userEvent.click(within(row).getByRole('button', { name: /learn conditional probability with chatgpt/i }));
    await waitFor(() => expect(api.openExternalUrl).toHaveBeenLastCalledWith(expect.stringMatching(/^https:\/\/chatgpt\.com\/\?q=/)));
    const prompt = decodeURIComponent(api.openExternalUrl.mock.calls.at(-1)![0].split('?q=')[1]);
    expect(prompt).toContain('Teach me "Conditional probability" (part of Probability, in Mathematics)');
    expect(prompt).not.toContain('Basic probability');
  });

  it('marks topics done from the Continue card and from their row, and moves on to the next one', async () => {
    const api = mockApi({ roleRoadmap: ROADMAP });
    renderLearn();
    await screen.findByText(/start here/i);
    await userEvent.click(screen.getByRole('button', { name: /^mark done$/i }));
    await waitFor(() => expect(api.learningRecordEvents).toHaveBeenCalledTimes(1));
    expect(api.learningRecordEvents.mock.calls[0][0][0]).toMatchObject({ type: 'task_done', item_id: 'topic:probability/basic-probability' });
    expect(await screen.findByRole('heading', { name: 'Conditional probability' })).toBeTruthy();
    expect(screen.getByText(/1 of 4 topics done/)).toBeTruthy();
    await userEvent.click(screen.getByRole('checkbox', { name: /mark as not done: basic probability/i }));
    await waitFor(() => expect(api.learningRecordEvents).toHaveBeenCalledTimes(2));
    expect(api.learningRecordEvents.mock.calls[1][0][0].payload).toMatchObject({ undone: true });
  });

  it('switches subjects and opens modules', async () => {
    mockApi({ roleRoadmap: ROADMAP });
    renderLearn();
    await userEvent.click(await screen.findByRole('tab', { name: /programming/i }));
    expect(screen.getByText('Ideas are tested in code.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /python/i }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('NumPy')).toBeTruthy();
  });

  it('lets the student remove a topic and add their own', async () => {
    const api = mockApi({ roleRoadmap: ROADMAP });
    renderLearn();
    await userEvent.click(await screen.findByRole('button', { name: /edit roadmap/i }));
    await userEvent.click(screen.getByRole('button', { name: /^remove conditional probability$/i }));
    await waitFor(() => expect(api.learnRoleRoadmapSave).toHaveBeenCalledTimes(1));
    expect(api.learnRoleRoadmapSave.mock.calls[0][0].subjects[0].modules[0].topics[1]).toMatchObject({ title: 'Conditional probability', removed: true });
    await userEvent.type(screen.getByLabelText(/new topic in probability/i), 'Expected value puzzles');
    await userEvent.click(screen.getByRole('button', { name: /add topic/i }));
    await waitFor(() => expect(api.learnRoleRoadmapSave).toHaveBeenCalledTimes(2));
    expect(api.learnRoleRoadmapSave.mock.calls[1][0].subjects[0].modules[0].topics.at(-1)).toMatchObject({ title: 'Expected value puzzles', custom: true });
  });

  it('ends with projects; one becomes a guided capstone with help on every step', async () => {
    const api = mockApi({ roleRoadmap: ROADMAP });
    renderLearn();
    await userEvent.click(await screen.findByRole('tab', { name: /projects/i }));
    expect(screen.getByRole('heading', { name: 'Backtest a moving-average strategy' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Option pricer' })).toBeTruthy();
    await userEvent.click(screen.getAllByRole('button', { name: /make this my capstone/i })[0]);
    await waitFor(() => expect(api.learnCapstoneGenerate).toHaveBeenCalledWith(ROADMAP.projects[0].id));
    expect(await screen.findByRole('heading', { name: 'Get the data' })).toBeTruthy();
    expect(screen.getByText(/done when: you have a table of prices/i)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /learn download index prices on youtube/i }));
    expect(api.openExternalUrl).toHaveBeenLastCalledWith('https://www.youtube.com/results?search_query=download%20nifty%20prices%20python');
    await userEvent.click(screen.getByRole('checkbox', { name: /mark as done: download index prices/i }));
    await waitFor(() => expect(api.learningRecordEvents).toHaveBeenCalled());
    expect(api.learningRecordEvents.mock.calls[0][0][0].item_id).toBe(`capstone:${ROADMAP.projects[0].id}/download-index-prices`);
    await userEvent.click(screen.getByRole('button', { name: /ask nomadic ai/i }));
    await userEvent.type(screen.getByLabelText(/your question about this step/i), 'Where do I get free prices?');
    await userEvent.click(screen.getByRole('button', { name: /^ask$/i }));
    await waitFor(() => expect(api.learnCapstoneHelp).toHaveBeenCalledWith({ stepId: 'download-index-prices', question: 'Where do I get free prices?', code: undefined }));
    expect(await screen.findByText('Start with a free daily price file.')).toBeTruthy();
  });

  it('opens on the Projects tab when asked', async () => {
    mockApi({ roleRoadmap: ROADMAP });
    renderLearn({ initialTab: 'projects' });
    expect((await screen.findByRole('tab', { name: /projects/i })).getAttribute('aria-selected')).toBe('true');
  });

  it('asks a student with an old roadmap to build it again in the new layout', async () => {
    mockApi({ roadmap: { track_id: 'frontend' } });
    renderLearn();
    expect(await screen.findByText(/learn has a new layout/i)).toBeTruthy();
    expect((screen.getByRole('textbox', { name: /^role$/i }) as HTMLInputElement).value).toBe('Frontend Engineer');
  });

  it('changes the role from the roadmap and can cancel back', async () => {
    mockApi({ roleRoadmap: ROADMAP });
    renderLearn();
    await userEvent.click(await screen.findByRole('button', { name: /change role/i }));
    expect(screen.getByText(/this replaces your quant trader roadmap/i)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(await screen.findByRole('heading', { name: 'Quant trader', level: 1 })).toBeTruthy();
  });

  it('shows an error with a working retry when progress cannot be loaded', async () => {
    const api = mockApi();
    api.learningGetState.mockRejectedValueOnce(new Error('Database is locked.'));
    renderLearn();
    expect(await screen.findByText('Database is locked.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByRole('heading', { name: /which role do you want to prepare for/i })).toBeTruthy();
  });
});
