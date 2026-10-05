/** Dev syllabus: product management and design. AI-drafted, status draft. */
import type { DevSyllabus } from '../defs';

export const PRODUCT_DESIGN_SYLLABUS: DevSyllabus = {
  // ── dev.product-discovery ───────────────────────────────────────────────
  'product-sense': [
    {
      key: 'product-sense',
      title: 'Answering product design questions',
      min: 30,
      sum: 'Product sense is the ability to pick the right user problem and shape a solution with clear trade-offs. Interviewers test it with prompts such as "design a product for…" or "improve this app". Use a repeatable structure: clarify the goal, choose a **user segment**, rank **pain points**, brainstorm solutions, pick one with explicit trade-offs, then define **success metrics** and risks.',
      pts: [
        'Clarify the goal and constraints before proposing anything.',
        'Go deep on one user segment instead of designing for everyone.',
        'Rank pains by frequency and severity, then solve the top one.',
        'Close with metrics, risks and what you would build first.',
      ],
      learn: [
        'Clarify: ask about the goal (growth, engagement, revenue), platform, market and constraints before answering',
        'Users: list 3–4 segments (e.g. first-time vs daily users) and pick one, saying why it matters most',
        'Jobs to be done: state what the user is trying to get done in their context, not which feature they want',
        'Pain points: list 3–5 pains for the chosen segment and rank them by frequency × severity',
        'Solutions: brainstorm at least three, from simple to bold, then compare them on impact, effort and risk',
        'Trade-offs: name what your chosen solution gives up and why that is acceptable for this goal',
        'Metrics: give one success metric, one or two input metrics and a guardrail that must not get worse',
        'Teardown: for any app, note who it serves, its core loop, what works, what frustrates and one improvement',
      ],
      tasks: [
        { key: 'practice-design-question', kind: 'practice', title: 'Answer "design a product to help first-time UPI users in small towns" aloud in 20 minutes, then write it up', minutes: 40 },
        { key: 'practice-teardown', kind: 'practice', title: 'Write a one-page teardown of a food delivery app: users, core loop, three pains and one improvement', minutes: 30, optional: true },
      ],
      quiz: [
        {
          q: 'In a product design question, what should you do right after clarifying the goal?',
          options: ['Brainstorm as many features as possible', 'Choose a user segment to focus on', 'Set the launch date', 'Pick the technology stack'],
          answer: 1,
          why: 'Solutions only make sense for a specific user; picking a segment first keeps pains and metrics focused.',
        },
        {
          q: 'How should you rank pain points for the chosen segment?',
          options: ['By how easy they are to build', 'Alphabetically', 'By frequency and severity for that user', 'By what competitors have built'],
          answer: 2,
          why: 'A pain that happens often and hurts a lot is the most valuable to solve; build effort matters later, when comparing solutions.',
        },
      ],
    },
    {
      key: 'product-sense-metrics',
      title: 'Success metrics and diagnosing metric changes',
      depth: 'standard',
      min: 30,
      sum: 'The second half of most product sense interviews is about metrics: how to measure success and why a number moved. Pick a **North Star metric** that captures value delivered, break it into input metrics the team can move, and protect it with guardrails. When a metric drops, rule out data problems first, then segment the change before guessing causes.',
      pts: [
        'A good North Star reflects value delivered to users, not just activity.',
        'Pair every success metric with a guardrail metric.',
        'For a metric drop: check the data, then timing, segments, internal and external causes.',
      ],
      learn: [
        'North Star metric: one number reflecting user value, e.g. orders delivered per week, not app opens',
        'Input metrics: the 3–4 levers that drive the North Star, such as new users, frequency and conversion',
        'Guardrail metrics: numbers that must not worsen while you optimise, such as cancellations or support tickets',
        'Funnels: define each step (visit, add to cart, pay, success) and measure conversion between steps',
        'Retention: read a cohort table; know D1, D7 and D30 retention and why retention beats sign-ups',
        'HEART framework: Happiness, Engagement, Adoption, Retention, Task success, each with goals and signals',
        'Metric drop diagnosis: check tracking bugs, sudden vs gradual, segment by platform, region and version',
        'External causes: seasonality, festivals and holidays, competitor launches, outages and policy changes',
      ],
      tasks: [
        { key: 'practice-metric-drop', kind: 'practice', title: 'Write a step-by-step diagnosis for "weekly orders on a food delivery app fell 15% this week"', minutes: 30 },
        { key: 'practice-north-star', kind: 'practice', title: 'Define a North Star, three input metrics and two guardrails for a ride-hailing app', minutes: 25 },
      ],
      quiz: [
        {
          q: 'Daily active users fell sharply overnight. What should you check first?',
          options: ['Whether tracking or the data pipeline broke', 'Whether a competitor cut prices', 'Whether users dislike the new logo', 'Whether the market is shrinking'],
          answer: 0,
          why: 'Sudden overnight drops are often logging or pipeline bugs; rule those out before looking for product or market causes.',
        },
        {
          q: 'Which is the best guardrail metric when optimising checkout conversion?',
          options: ['Number of app installs', 'Payment failure and refund rate', 'Time spent on the home screen', 'Number of push notifications sent'],
          answer: 1,
          why: 'A guardrail catches harm caused by the change; pushing conversion should not raise failed payments or refunds.',
        },
      ],
    },
  ],

  'product-discovery': [
    {
      key: 'product-discovery',
      title: 'User interviews that reveal real problems',
      min: 35,
      sum: 'Discovery reduces the risk of building something nobody needs. The core skill is the **user interview**: ask about specific past behaviour rather than opinions or hypothetical futures, because people are poor at predicting what they would do. Listen far more than you talk, dig into the last real instance of the problem, and keep your solution out of the conversation.',
      pts: [
        'Ask "tell me about the last time…", never "would you use…".',
        'Compliments and promises are not evidence; past actions and money spent are.',
        'Talk to 5–8 people per segment before drawing conclusions.',
        'Keep your idea out of the interview until the end, if at all.',
      ],
      learn: [
        'Research goal: write the decision the interviews must inform and 3–5 questions you need answered',
        'Recruiting: screen for people who had the problem recently; 5–8 per segment usually shows clear patterns',
        'Past behaviour: "Tell me about the last time you…" and "What did you do next?" beat opinion questions',
        'Leading questions: not "Wouldn\'t it help if…?" but "How do you handle this today?"',
        'Follow-ups: ask why, ask for an example, and use silence to let people keep talking',
        'Workarounds: spreadsheets, WhatsApp groups and paid fixes show that a pain is real and costly',
        'Notes: capture verbatim quotes and observed actions separately from your interpretation',
        'Ethics: get consent to record, explain how notes are used and never pressure people',
      ],
      tasks: [
        { key: 'practice-interview-guide', kind: 'practice', title: 'Write a 10-question guide on how college students split shared expenses, using only past-behaviour questions', minutes: 30 },
        { key: 'practice-interviews', kind: 'practice', title: 'Interview two classmates with your guide and write up quotes, workarounds and surprises', minutes: 60, optional: true },
      ],
      quiz: [
        {
          q: 'Which interview question gives the most reliable evidence?',
          options: ['Would you pay for an app that does this?', 'Do you think this idea is useful?', 'How much would you like this feature?', 'Tell me about the last time you split a bill with friends.'],
          answer: 3,
          why: 'Questions about a specific past event reveal real behaviour; opinion and hypothetical questions invite polite guesses.',
        },
        {
          q: 'A user says your idea is "amazing" and they would definitely use it. How should you treat this?',
          options: ['As weak evidence until backed by past behaviour or commitment', 'As proof of demand', 'As a reason to stop interviewing', 'As a request to add more features'],
          answer: 0,
          why: 'Compliments cost nothing; evidence comes from what people have done, spent or will commit to.',
        },
      ],
    },
    {
      key: 'product-discovery-synthesis',
      title: 'Synthesis: affinity maps, jobs to be done and personas',
      min: 30,
      sum: 'Raw interview notes become useful only after synthesis. Cluster observations into themes on an **affinity map**, turn the strongest themes into **jobs to be done** and problem statements, and summarise distinct behaviour patterns as personas. Every insight should trace back to quotes or observations, not to what the team already believed.',
      pts: [
        'One observation per note; cluster bottom-up, then name the clusters.',
        'Job statement: When [situation], I want to [motivation], so I can [outcome].',
        'Personas describe behaviour and goals, not invented demographics.',
      ],
      learn: [
        'Affinity mapping: one quote or observation per note, group similar notes, then name each group as an insight',
        'Insight vs observation: an observation is what happened; an insight explains why it matters',
        'Job statement: "When [situation], I want to [motivation], so I can [expected outcome]"',
        'Kinds of jobs: functional (get a task done), emotional (feel a certain way) and social (be seen a certain way)',
        'Personas: 2–3 based on behaviour patterns from research; include goals, frustrations and context',
        'Problem statement: user, need and insight in one sentence, with no solution inside it',
        'How might we: reframe a problem as "How might we…?" to open several solution directions',
        'Opportunity solution tree: outcome at the top, opportunities below, solutions and tests under each',
      ],
      tasks: [
        { key: 'practice-affinity-map', kind: 'practice', title: 'Affinity-map 30 interview notes (yours or a sample) into themes and write three job statements', minutes: 45 },
      ],
      quiz: [
        {
          q: 'Which is a well-formed job statement?',
          options: ['Users want a dark mode button', 'When my monthly stipend arrives, I want to set money aside for fees, so I can avoid borrowing', 'Our app needs better onboarding', 'Students aged 18–22 in metro cities'],
          answer: 1,
          why: 'A job statement describes situation, motivation and outcome without naming a feature or a demographic.',
        },
        {
          q: 'What should a persona be based on?',
          options: ['Stock photos and a catchy name', 'The founders\' assumptions', 'Behaviour patterns observed in research', 'The largest age group in the census'],
          answer: 2,
          why: 'Useful personas summarise real goals and behaviours seen in research; invented details mislead the team.',
        },
      ],
    },
    {
      key: 'product-discovery-experiments',
      title: 'Testing assumptions with cheap experiments',
      depth: 'standard',
      min: 30,
      sum: 'Interviews show problems; experiments test whether your solution will work before you build it fully. List the assumptions behind an idea, find the **riskiest** ones (desirability, viability, feasibility, usability) and test each with the cheapest experiment that gives real evidence. Decide the success threshold before running the test so results cannot be explained away.',
      pts: [
        'Test first the assumption that would kill the idea if it were wrong.',
        'Set a pass or fail threshold before the experiment starts.',
        'Prefer behaviour (sign-ups, payments) over stated intent in surveys.',
      ],
      learn: [
        'Assumption mapping: plot assumptions by importance and evidence; test important ones with little evidence',
        'Four risks: desirability (want it), viability (works for the business), feasibility (can build), usability',
        'Fake door test: show a button or page for a feature that does not exist yet and measure clicks honestly',
        'Concierge MVP: deliver the service by hand to a few users to learn what they value before automating',
        'Wizard of Oz: users see a working product interface while people do the work behind it',
        'Surveys: use them to measure how common a known problem is, not to discover new problems',
        'Success criteria: write "we will build it if at least X of Y users do Z" before the test',
        'A/B tests: need enough traffic and one primary metric; low-traffic products should use qualitative tests',
      ],
      tasks: [
        { key: 'practice-assumption-map', kind: 'practice', title: 'List ten assumptions behind a hostel food subscription idea and design tests for the riskiest two', minutes: 40 },
      ],
      quiz: [
        {
          q: 'In a concierge MVP, how is the service delivered?',
          options: ['Fully automated from day one', 'Only as a landing page', 'Manually by the team for a few users', 'Through a paid ad campaign'],
          answer: 2,
          why: 'A concierge MVP has the team do the work by hand, so you learn what users value before writing software.',
        },
        {
          q: 'Why set the success threshold before running an experiment?',
          options: ['So results cannot be reinterpreted to fit what you hoped', 'Because testing tools require it', 'To make the experiment run faster', 'So you can skip analysing the data'],
          answer: 0,
          why: 'Committing to a threshold in advance stops the team from moving the goalposts once results arrive.',
        },
      ],
    },
  ],

  'market-research': [
    {
      key: 'market-research',
      title: 'Market sizing: TAM, SAM, SOM and guesstimates',
      min: 30,
      sum: 'Market sizing estimates how big an opportunity is. **TAM** is total demand for the category, **SAM** the part your product can actually serve, and **SOM** the share you can realistically win in the next few years. Build estimates **bottom-up** (customers × usage × price) and state every assumption; interviewers care more about structure than about the final number.',
      pts: [
        'TAM ⊃ SAM ⊃ SOM: each is a narrower, more realistic slice.',
        'Bottom-up beats quoting a report: customers × frequency × price.',
        'Say assumptions aloud, round numbers and sanity-check the answer.',
      ],
      learn: [
        'TAM, SAM, SOM: total market, the part you can serve (segment, region, channel), and the share you can win',
        'Top-down: start from a large figure and narrow by percentages; quick but easy to get wrong',
        'Bottom-up: target customers × purchases per year × average price; preferred for product decisions',
        'Guesstimate steps: clarify, choose a formula, segment the population, estimate each part, multiply, check',
        'Segmenting: split by urban vs rural, age group or income band when behaviour differs a lot between them',
        'Sanity check: compare the result with a known anchor and ask whether the order of magnitude is plausible',
        'Rounding: use round numbers (India has roughly 1.4 billion people) and say they are approximations',
      ],
      tasks: [
        { key: 'practice-guesstimate', kind: 'practice', title: 'Estimate the yearly market for second-hand engineering textbooks in India bottom-up, writing every assumption', minutes: 40 },
      ],
      quiz: [
        {
          q: 'A bottom-up market size for a tiffin service is best built as:',
          options: ['Total food market × 1%', 'Target customers × meals per year × price per meal', 'Competitor revenue × 2', 'Number of restaurants in the city'],
          answer: 1,
          why: 'Bottom-up sizing multiplies real customer counts by usage and price, so every assumption can be checked.',
        },
        {
          q: 'Which describes SOM?',
          options: ['Everyone who could ever use the category', 'The segment your product and channels can serve', 'Your competitor\'s market share', 'The share of the served market you can realistically win soon'],
          answer: 3,
          why: 'SOM is the obtainable slice of SAM, limited by competition, distribution and time.',
        },
      ],
    },
    {
      key: 'market-research-competition',
      title: 'Competitive analysis and positioning',
      depth: 'standard',
      min: 30,
      sum: 'Competitive analysis shows where a product can win. Map **direct** competitors, **indirect** ones and substitutes (including doing nothing or using WhatsApp and spreadsheets), compare them on what customers actually value, and find a position that is both different and defensible. Public signals such as app store reviews, pricing pages and job posts show what rivals do well and badly.',
      pts: [
        'Include substitutes and the status quo, not just look-alike apps.',
        'Compare on attributes customers value, not on feature counts.',
        'A position is useful only if it is different and hard to copy.',
      ],
      learn: [
        'Competitor types: direct (same product), indirect (same job, different product), substitutes, doing nothing',
        'Feature matrix: competitors as rows, customer-valued attributes as columns; mark strengths and gaps honestly',
        'Positioning map: plot competitors on two axes customers care about, e.g. price vs speed, to find open space',
        'SWOT: strengths and weaknesses are internal; opportunities and threats are external',
        'Five forces: rivalry, new entrants, substitutes, buyer power and supplier power shape industry profit',
        'Moats: network effects, switching costs, scale, brand and proprietary data make a position defensible',
        'Public signals: app reviews, pricing pages, release notes and job posts reveal priorities and weaknesses',
      ],
      tasks: [
        { key: 'practice-competitor-matrix', kind: 'practice', title: 'Build a feature matrix and a two-axis positioning map for three quick-commerce grocery apps', minutes: 45 },
      ],
      quiz: [
        {
          q: 'In a SWOT analysis, which item is a threat?',
          options: ['Your team ships quickly', 'Your app has a weak onboarding flow', 'Your brand is trusted by students', 'A large rival plans to enter your market'],
          answer: 3,
          why: 'Threats are external factors outside your control; the other options are internal strengths or weaknesses.',
        },
        {
          q: 'For a budgeting app, which counts as a substitute rather than a direct competitor?',
          options: ['A spreadsheet the user keeps', 'Another budgeting app', 'A budgeting app with a lower price', 'A budgeting app with more features'],
          answer: 0,
          why: 'Substitutes do the same job differently; a spreadsheet meets the same need without being a similar app.',
        },
      ],
    },
  ],

  'prd-writing': [
    {
      key: 'prd-writing',
      title: 'Structure of a PRD: problem, goals and scope',
      min: 30,
      sum: 'A product requirements document (PRD) aligns the team on **why** and **what** while leaving **how** to engineering and design. A good PRD opens with the problem and its evidence, states goals with measurable success metrics, defines scope and explicit **non-goals**, and lists risks and open questions. Keep it short, cite evidence and update it as decisions change.',
      pts: [
        'Start with the problem and evidence, not the solution.',
        'Non-goals prevent scope creep as much as goals guide the work.',
        'A PRD is a living document: record decisions and open questions.',
      ],
      learn: [
        'Problem statement: who has the problem, how often, the impact, and the evidence (interviews, data, tickets)',
        'Goals and metrics: one primary success metric with a target, plus guardrail metrics',
        'Scope and non-goals: what is in this release and what is deliberately left out',
        'Users and use cases: the target segment and the main scenarios the feature must support',
        'Requirements: functional needs as user stories; non-functional needs such as speed, security, accessibility',
        'Risks, dependencies and open questions: what could fail, who you depend on, what is still undecided',
        'Rollout: phased release, feature flags, and how you will measure and decide whether to expand',
        'One-pager: for small features, a single page with problem, goal, scope and metric is enough',
      ],
      tasks: [
        { key: 'build-prd', kind: 'build', title: 'Write a two-page PRD for "split bill" in a UPI payments app: problem, goals, metrics, scope, non-goals, risks', minutes: 60 },
      ],
      quiz: [
        {
          q: 'What is the main purpose of a non-goals section?',
          options: ['To list features competitors lack', 'To record people who are not involved', 'To make clear what this release will not do, preventing scope creep', 'To list bugs that will not be fixed'],
          answer: 2,
          why: 'Stating what is out of scope stops new requests from quietly expanding the work and sets expectations.',
        },
        {
          q: 'Which belongs in a PRD rather than in a technical design document?',
          options: ['The user problem and success metrics', 'The database schema', 'The class hierarchy', 'The caching strategy'],
          answer: 0,
          why: 'The PRD covers why and what; engineers decide how in their own design documents.',
        },
      ],
    },
    {
      key: 'prd-writing-stories',
      title: 'User stories, acceptance criteria and edge cases',
      depth: 'standard',
      min: 30,
      sum: 'User stories turn requirements into small, testable pieces of value: "As a [user], I want [action], so that [benefit]". Each story needs **acceptance criteria**, often written as Given/When/Then, that tell engineers and testers exactly when it is done. Good PMs also list edge cases (empty, error, slow network, permissions), because that is where most bugs and confused users come from.',
      pts: [
        'Story format: As a [user], I want [action], so that [benefit].',
        'Acceptance criteria make "done" testable: Given, When, Then.',
        'Split big stories by workflow step or rule, not by technical layer.',
        'Always cover empty, error, loading and offline cases.',
      ],
      learn: [
        'User story: "As a [user], I want [action], so that [benefit]"; the benefit explains why it matters',
        'INVEST: stories are Independent, Negotiable, Valuable, Estimable, Small and Testable',
        'Acceptance criteria: Given [context], When [action], Then [outcome]; one scenario per rule',
        'Splitting: split by workflow step, business rule, data type or happy path vs edge cases',
        'Edge cases: empty states, invalid input, network failure, timeouts, duplicates and permission denied',
        'Epic, story, task: an epic groups stories; tasks are the technical steps inside a story',
        'Definition of done: a shared checklist such as tested, reviewed, accessible, tracked and documented',
      ],
      tasks: [
        { key: 'practice-stories', kind: 'practice', title: 'Write six user stories with Given/When/Then criteria for booking a seat in a college library app', minutes: 40 },
        { key: 'practice-edge-cases', kind: 'practice', title: 'List every edge case for a UPI payment that times out after the user enters their PIN', minutes: 20, optional: true },
      ],
      quiz: [
        {
          q: 'Which acceptance criterion is testable?',
          options: ['The page should be fast', 'Given items in the cart, when payment fails, then the cart is kept and a retry button appears', 'Users should love the checkout', 'Checkout should be intuitive'],
          answer: 1,
          why: 'It states a context, an action and an observable outcome a tester can check; the others are vague.',
        },
        {
          q: 'What does the "S" in INVEST stand for?',
          options: ['Secure', 'Specific', 'Scalable', 'Small'],
          answer: 3,
          why: 'Stories should be small enough to finish within a sprint, ideally in a few days.',
        },
      ],
    },
  ],

  // ── dev.product-delivery ────────────────────────────────────────────────
  prioritization: [
    {
      key: 'prioritization',
      title: 'Scoring work with RICE, ICE and value vs effort',
      min: 30,
      sum: 'Prioritisation frameworks make trade-offs explicit so a team can compare ideas on the same scale. **RICE** scores reach × impact × confidence ÷ effort, **ICE** is a lighter version, and a **value vs effort** grid gives a quick visual sort. **Cost of delay** asks what you lose for each week an item waits. Scores inform judgement; they do not replace it.',
      pts: [
        'RICE = reach × impact × confidence ÷ effort.',
        'Use the same time window and units for every item you score.',
        'Quick wins (high value, low effort) first; question big low-value work.',
        'Revisit scores when new evidence arrives.',
      ],
      learn: [
        'RICE: reach (users per period) × impact (e.g. 0.25–3) × confidence (%) ÷ effort (person-months)',
        'ICE: impact × confidence × ease, each scored 1–10; fast for early ideas, but more subjective',
        'Value vs effort 2×2: quick wins, big bets, fill-ins and money pits; drop the money pits',
        'Cost of delay: value lost per unit of time an item waits; urgent items have a steep cost of delay',
        'WSJF: cost of delay ÷ job duration; do short work with a high cost of delay first',
        'Confidence: lower it when an estimate rests on opinion, raise it when backed by data or research',
        'Pitfalls: inflated impact, ignored dependencies, and treating a score as more precise than its inputs',
      ],
      tasks: [
        { key: 'practice-rice', kind: 'practice', title: 'Score eight feature ideas for a campus marketplace app with RICE in a table and explain the top three', minutes: 40 },
      ],
      quiz: [
        {
          q: 'Feature A: reach 1,000, impact 2, confidence 50%, effort 2. What is its RICE score?',
          options: ['500', '1,000', '2,000', '250'],
          answer: 0,
          why: '1,000 × 2 × 0.5 ÷ 2 = 500.',
        },
        {
          q: 'In a value vs effort grid, what should you usually do with low-value, high-effort items?',
          options: ['Do them first', 'Split them across all sprints', 'Drop or deprioritise them', 'Give them to new joiners'],
          answer: 2,
          why: 'They cost a lot and return little; they are often called money pits or time sinks.',
        },
      ],
    },
    {
      key: 'prioritization-scope',
      title: 'Scoping releases with MoSCoW, Kano and MVPs',
      depth: 'standard',
      min: 30,
      sum: 'Once you know what matters, you must decide how much of it ships. **MoSCoW** sorts scope into Must, Should, Could and Won\'t for a given release; the **Kano model** separates basic expectations from performance features and delighters; and an **MVP** is the smallest release that tests your riskiest assumption. Saying no clearly, with reasons, is part of the job.',
      pts: [
        'Must-haves are only what the release cannot launch without.',
        'Missing basics cause anger; having them causes little delight.',
        'An MVP tests learning, not a cut-down version of everything.',
      ],
      learn: [
        'MoSCoW: Must (launch blocker), Should (important, not vital), Could (nice to have), Won\'t (not this time)',
        'Must test: ask "would we delay the launch without this?"; if not, it is not a Must',
        'Kano basic needs: expected features (e.g. payment receipts) that anger users when missing',
        'Kano performance and delighters: more is better (faster delivery); delighters are unexpected and pleasing',
        'Kano drift: delighters become expected over time, so today\'s delighter is tomorrow\'s basic need',
        'MVP: the smallest product that tests the riskiest assumption with real users',
        'Saying no: explain the trade-off, point to the goal, and say when it could be reconsidered',
        'Opportunity cost: every yes delays something else; name what gets pushed out',
      ],
      tasks: [
        { key: 'practice-moscow', kind: 'practice', title: 'Sort 15 requested features for the first release of a hostel mess feedback app into MoSCoW and justify each Must', minutes: 35 },
      ],
      quiz: [
        {
          q: 'In the Kano model, a payment receipt in a payments app is best classed as:',
          options: ['A delighter', 'A basic expectation', 'An indifferent feature', 'A reverse feature'],
          answer: 1,
          why: 'Users expect a receipt; its absence angers them, but having it does not create delight.',
        },
        {
          q: 'Which question best decides whether an item is a Must in MoSCoW?',
          options: ['Did a senior leader ask for it?', 'Is it easy to build?', 'Do competitors have it?', 'Would we delay the launch without it?'],
          answer: 3,
          why: 'Musts are launch blockers; anything the release can ship without belongs in Should or Could.',
        },
      ],
    },
  ],

  'agile-delivery': [
    {
      key: 'agile-delivery',
      title: 'Scrum: roles, events and artefacts',
      min: 30,
      sum: 'Agile teams deliver in small increments and adjust from feedback. **Scrum** runs fixed sprints of up to a month (often two weeks) with three accountabilities (Product Owner, Scrum Master, Developers), five events and three artefacts. As a PM or product owner you own the **product backlog**, its order and the value of each sprint goal.',
      pts: [
        'A sprint has one goal; scope can be renegotiated, the goal should not be.',
        'The daily scrum is a 15-minute plan for the next day, not a status report.',
        'The review shows working product; the retrospective improves how the team works.',
      ],
      learn: [
        'Accountabilities: Product Owner orders the backlog, Scrum Master coaches the process, Developers build',
        'Events: the Sprint, Sprint Planning, Daily Scrum (15 min), Sprint Review and Sprint Retrospective',
        'Artefacts: Product Backlog (with a Product Goal), Sprint Backlog (with a Sprint Goal) and the Increment',
        'Definition of Done: the shared quality bar every increment must meet before it counts as done',
        'Backlog refinement: break down, clarify and estimate upcoming items so planning stays quick',
        'Story points: relative estimates of effort and uncertainty, often on a Fibonacci-like scale',
        'Planning poker: everyone reveals an estimate at once, then the highest and lowest explain their reasoning',
        'Velocity: points finished per sprint; useful for a team\'s own forecasting, never for comparing teams',
      ],
      tasks: [
        { key: 'practice-sprint-plan', kind: 'practice', title: 'Plan a two-week sprint for a college fest ticketing app: sprint goal, ten backlog items, estimates, Definition of Done', minutes: 45 },
      ],
      quiz: [
        {
          q: 'Who is accountable for ordering the product backlog in Scrum?',
          options: ['The Scrum Master', 'The Product Owner', 'The most senior developer', 'The client'],
          answer: 1,
          why: 'The Product Owner maximises value by ordering the backlog; the Scrum Master coaches the process.',
        },
        {
          q: 'What is the main purpose of the sprint retrospective?',
          options: ['To demo features to stakeholders', 'To estimate the next sprint', 'To improve how the team works', 'To assign blame for missed work'],
          answer: 2,
          why: 'The retrospective inspects people, process and tools and picks improvements; work is shown in the review.',
        },
      ],
    },
    {
      key: 'agile-delivery-kanban',
      title: 'Kanban, flow metrics and shipping safely',
      depth: 'standard',
      min: 30,
      sum: '**Kanban** manages continuous flow instead of fixed sprints: visualise work on a board, limit **work in progress** (WIP) and measure how long items take. It suits support, operations and teams with unpredictable work. Whatever the method, ship small: feature flags, staged rollouts and clear release notes let teams release often while keeping risk low.',
      pts: [
        'Lower WIP usually means shorter cycle times: stop starting, start finishing.',
        'Measure cycle time and throughput, not hours worked.',
        'Feature flags separate deploying code from releasing a feature.',
      ],
      learn: [
        'Kanban board: a column per workflow stage (to do, in progress, review, done) with explicit entry rules',
        'WIP limits: cap items per column; when a column is full, help finish work instead of starting more',
        'Cycle time vs lead time: cycle time starts when work begins; lead time starts when the request is made',
        'Throughput: items finished per week; forecast from throughput history rather than from estimates',
        'Little\'s law: average WIP = throughput × average cycle time, so less WIP means faster delivery',
        'Scrum vs Kanban: sprints and set roles vs continuous flow; many teams mix the two',
        'Feature flags and staged rollout: release to a small share of users, watch metrics, expand or roll back',
        'Release notes: say what changed for users in plain words and what they need to do, if anything',
      ],
      tasks: [
        { key: 'practice-kanban-board', kind: 'practice', title: 'Design a Kanban board with WIP limits for a three-person team supporting a student app, and explain each limit', minutes: 30 },
      ],
      quiz: [
        {
          q: 'A team has an average WIP of 10 items and finishes 5 items per week. What is the average cycle time?',
          options: ['2 weeks', '0.5 weeks', '5 weeks', '50 weeks'],
          answer: 0,
          why: 'By Little\'s law, cycle time = WIP ÷ throughput = 10 ÷ 5 = 2 weeks.',
        },
        {
          q: 'What does a feature flag let a team do?',
          options: ['Skip testing', 'Remove the need for code review', 'Increase story points', 'Deploy code without exposing the feature to all users'],
          answer: 3,
          why: 'Flags decouple deploying from releasing, which enables staged rollouts and quick switch-offs.',
        },
      ],
    },
  ],

  'product-strategy': [
    {
      key: 'product-strategy',
      title: 'Vision, strategy and where to play',
      min: 35,
      sum: 'Strategy is a small set of choices about **where to play** (which users, problems and markets) and **how to win** there. A vision describes the future you want; a strategy explains why your approach will get there despite competitors and constraints. Good strategy is as clear about what the team will not do as about what it will.',
      pts: [
        'Vision is where you are going; strategy is the choice of path.',
        'A strategy must say what you will not do.',
        'Diagnose the key challenge before choosing actions.',
      ],
      learn: [
        'Vision: an inspiring picture of the future for users, stable for years, e.g. "every graduate finds work"',
        'Strategy kernel: a diagnosis of the challenge, a guiding policy, and coherent actions that follow from it',
        'Where to play: target segments, use cases, regions and channels; narrower choices are easier to win',
        'How to win: the advantage, such as lower cost, better experience, network effects or distribution',
        'Bad strategy signs: fluffy goals, a list of everything, no hard choices and no diagnosis',
        'Strategy vs plan: a plan lists activities; a strategy explains why those activities will win',
        'Trade-offs: write down the segments and features you are explicitly not pursuing, and why',
      ],
      tasks: [
        { key: 'practice-strategy-memo', kind: 'practice', title: 'Write a one-page strategy for a job app for tier-2 city graduates: diagnosis, where to play, how to win, what not to do', minutes: 50 },
      ],
      quiz: [
        {
          q: 'Which is the best sign of a real strategy?',
          options: ['It lists every feature the team wants', 'It repeats the company values', 'It names target users and what the team will not do', 'It sets a revenue target only'],
          answer: 2,
          why: 'Strategy is about choices; naming the focus and the exclusions shows real trade-offs were made.',
        },
        {
          q: 'What comes first in a strategy kernel?',
          options: ['A diagnosis of the key challenge', 'A list of OKRs', 'A product roadmap', 'A budget'],
          answer: 0,
          why: 'The diagnosis defines the problem; the guiding policy and the actions respond to it.',
        },
      ],
    },
    {
      key: 'product-strategy-roadmaps',
      title: 'OKRs and outcome-based roadmaps',
      min: 30,
      sum: 'Strategy becomes actionable through goals and a roadmap. **OKRs** pair a qualitative objective with 2–5 measurable key results that describe outcomes, not tasks. An **outcome-based roadmap** groups work by the problems to solve, often as **Now, Next, Later**, so teams commit to results while staying free to change the solutions as they learn.',
      pts: [
        'Key results measure outcomes ("activation from 30% to 40%"), not outputs ("ship onboarding").',
        'Now, Next, Later avoids fake precision about dates far in the future.',
        'Roadmaps communicate priorities; they are not promises of features on dates.',
      ],
      learn: [
        'Objective: a qualitative, inspiring goal for a quarter, e.g. "Make first payments effortless"',
        'Key results: 2–5 measurable outcomes with a baseline and a target; if it is a task, it is not a key result',
        'Outputs vs outcomes: outputs are things shipped; outcomes are changes in user behaviour or business results',
        'Now, Next, Later: detailed and committed now, problems to solve next, broad themes later',
        'Themes: group roadmap items under the problem or goal they serve, not under teams or features',
        'Dates: commit to dates only for near-term or externally fixed items, such as a festival sale',
        'Audiences: leadership wants goals and trade-offs, engineering wants sequence, sales wants timing',
      ],
      tasks: [
        { key: 'practice-okrs', kind: 'practice', title: 'Write one quarter\'s OKRs and a Now, Next, Later roadmap for a college placement-prep app', minutes: 45 },
      ],
      quiz: [
        {
          q: 'Which is a well-written key result?',
          options: ['Launch the referral feature', 'Hold weekly growth meetings', 'Redesign the home screen', 'Increase week-4 retention of new users from 20% to 28%'],
          answer: 3,
          why: 'It measures an outcome with a baseline and a target; the others are tasks or outputs.',
        },
        {
          q: 'Why do many teams use a Now, Next, Later roadmap instead of a dated feature list?',
          options: ['It hides priorities from stakeholders', 'It removes the need for goals', 'It avoids false precision about solutions and dates further out', 'It guarantees faster delivery'],
          answer: 2,
          why: 'Later work is uncertain; framing it as problems rather than dated features keeps the team free to learn.',
        },
      ],
    },
    {
      key: 'product-strategy-business',
      title: 'Business models, pricing and unit economics',
      depth: 'optional',
      min: 35,
      sum: 'Products succeed only if the business works. Know the common **business models** (subscription, transaction fee, marketplace take rate, advertising, freemium), how **pricing** is set, and the **unit economics** that show whether each customer is profitable. In price-sensitive markets such as India, pricing, packaging and payment method (UPI, small low-priced plans) often matter as much as features.',
      pts: [
        'Lifetime value (LTV) must comfortably exceed acquisition cost (CAC).',
        'Price on value to the customer, not only on your cost.',
        'Freemium works when free users are cheap to serve and some upgrade.',
      ],
      learn: [
        'Business models: subscription, transaction fee, marketplace take rate, advertising, licensing, freemium',
        'CAC: total sales and marketing spend ÷ new customers acquired in the same period',
        'LTV: average revenue per user × gross margin × expected lifetime (or ÷ churn rate)',
        'Contribution margin: revenue per order minus variable costs such as delivery, discounts and payment fees',
        'Pricing approaches: cost-plus, competitor-based and value-based; value-based captures most when value is clear',
        'Packaging: tiers (free, pro, premium), usage limits and small plans for price-sensitive users',
        'Payback period: months of margin needed to recover CAC; shorter payback means less cash needed to grow',
      ],
      tasks: [
        { key: 'practice-unit-economics', kind: 'practice', title: 'Build a unit economics sheet for one grocery delivery order: revenue, costs, contribution margin, CAC, payback', minutes: 45 },
      ],
      quiz: [
        {
          q: 'CAC is ₹500, monthly margin per customer is ₹100 and customers stay 12 months. What is the payback period?',
          options: ['12 months', '6 months', '5 months', '2 months'],
          answer: 2,
          why: '₹500 ÷ ₹100 per month = 5 months to recover the acquisition cost.',
        },
        {
          q: 'Which business model earns a percentage of each transaction between buyers and sellers?',
          options: ['Advertising', 'Licensing', 'Subscription', 'Marketplace take rate'],
          answer: 3,
          why: 'A marketplace takes a cut (the take rate) of each order or booking it facilitates.',
        },
      ],
    },
  ],

  'stakeholder-management': [
    {
      key: 'stakeholder-management',
      title: 'Mapping stakeholders and communicating decisions',
      min: 30,
      sum: 'PMs lead without formal authority, so influence comes from trust and clarity. Map who is affected by your work and how much influence they have, agree who decides what using RACI or DACI, and keep people informed with short, regular written updates. Share bad news early: surprises damage trust far more than problems do.',
      pts: [
        'Manage closely those with high power and high interest.',
        'Name one decision owner for every decision.',
        'Write decisions down with context, options and rationale.',
      ],
      learn: [
        'Stakeholder list: everyone affected, such as engineering, design, sales, support, legal and leadership',
        'Power-interest grid: manage closely, keep satisfied, keep informed, monitor',
        'RACI: Responsible does the work, Accountable owns the outcome (only one), then Consulted and Informed',
        'DACI: Driver runs the decision, Approver decides, Contributors advise, Informed are told the result',
        'Written updates: a weekly note with progress against goals, risks, decisions needed and next steps',
        'Decision log: date, decision, options considered, rationale and owner, so debates are not repeated',
        'Pre-wiring: talk to key people one-on-one before a big meeting so there are no surprises in the room',
      ],
      tasks: [
        { key: 'practice-stakeholder-map', kind: 'practice', title: 'Map stakeholders on a power-interest grid for launching cash on delivery in a food app, and write a RACI', minutes: 35 },
        { key: 'practice-weekly-update', kind: 'practice', title: 'Write a 200-word weekly update for a delayed feature that states the risk, its cause and the decision needed', minutes: 20, optional: true },
      ],
      quiz: [
        {
          q: 'In RACI, how many people should be Accountable for a task?',
          options: ['Everyone involved', 'At least three', 'Exactly one', 'None; accountability is shared'],
          answer: 2,
          why: 'A single accountable owner avoids confusion about who makes the final call.',
        },
        {
          q: 'A stakeholder has high power but low interest in your project. How should you manage them?',
          options: ['Ignore them', 'Keep them satisfied with concise updates', 'Involve them in every daily meeting', 'Ask them to approve each story'],
          answer: 1,
          why: 'High-power, low-interest stakeholders need enough information to stay satisfied without heavy involvement.',
        },
      ],
    },
    {
      key: 'stakeholder-management-conflict',
      title: 'Handling disagreement, pushback and saying no',
      depth: 'standard',
      min: 30,
      sum: 'Conflict is normal when goals compete. Separate the people from the problem, uncover the interest behind each position, and anchor discussions on shared goals and data. Once a decision is made, **disagree and commit**; when you must say no, explain the trade-off and the goal it protects. Escalate only after trying to resolve things directly, and escalate together.',
      pts: [
        'Positions are what people ask for; interests are why they ask.',
        'Say no to the request, not to the person, and give the reason.',
        'Once decided, commit fully even if you argued against it.',
      ],
      learn: [
        'Positions vs interests: ask "what problem would this solve for you?" to find the need behind a request',
        'Shared goals: frame trade-offs against the agreed goal or metric, not personal preference',
        'Data over opinion: bring evidence, and agree in advance what evidence would change minds',
        'Saying no: acknowledge the need, explain the trade-off, offer an alternative or a time to revisit',
        'Disagree and commit: argue your view, then fully support the decision once it is made',
        'Escalation: try direct resolution first, then escalate jointly with both views written fairly',
        'Engineers and designers: bring problems and constraints, and let them shape the solutions',
      ],
      tasks: [
        { key: 'practice-say-no', kind: 'practice', title: 'Script saying no to a sales lead who wants a custom feature for one large client this sprint, then role-play it', minutes: 30 },
      ],
      quiz: [
        {
          q: 'Sales demands a feature "by Friday". What is the best first step?',
          options: ['Refuse immediately', 'Ask what customer problem it solves and what happens if it waits', 'Agree to avoid conflict', 'Escalate to the CEO'],
          answer: 1,
          why: 'Understanding the interest behind the request lets you find options and judge urgency fairly.',
        },
        {
          q: 'What does "disagree and commit" mean?',
          options: ['Keep arguing until you win', 'Commit only if you agree', 'Escalate every disagreement', 'Support a decision fully after voicing disagreement'],
          answer: 3,
          why: 'You argue your case openly, then back the decision so the team can move fast together.',
        },
      ],
    },
  ],

  // ── dev.design-foundations ──────────────────────────────────────────────
  'design-principles': [
    {
      key: 'design-principles',
      title: 'Visual hierarchy and Gestalt grouping',
      min: 30,
      sum: 'Good interfaces guide the eye to what matters first. Build **visual hierarchy** with size, weight, colour, contrast and position so the most important element clearly wins. **Gestalt principles** explain how people group what they see: items close together, similar in look or inside a shared region are read as related. Use them to make structure obvious without extra lines and boxes.',
      pts: [
        'One primary action per screen should stand out clearly.',
        'Proximity is the cheapest way to show that things belong together.',
        'Use fewer borders: spacing and alignment can do the grouping.',
      ],
      learn: [
        'Hierarchy levers: size, weight, colour, contrast, position and whitespace; combine two or three at once',
        'Squint test: blur or squint at the screen; the most important element should still stand out',
        'Proximity: related items sit close together, unrelated items farther apart',
        'Similarity: elements that look alike (colour, shape) are read as having the same function',
        'Common region: a shared background or card groups content without extra dividers',
        'Figure-ground: modals and menus need clear separation from what is behind them',
        'Continuity and closure: eyes follow lines and complete partial shapes, e.g. a cut-off card hints at scrolling',
        'De-emphasis: make secondary text lighter or smaller instead of making primary text louder',
      ],
      tasks: [
        { key: 'practice-hierarchy-redesign', kind: 'practice', title: 'Redesign a cluttered product card from a shopping app using only size, weight, colour and spacing', minutes: 40 },
      ],
      quiz: [
        {
          q: 'Which Gestalt principle explains why a label should sit close to its input field?',
          options: ['Closure', 'Figure-ground', 'Proximity', 'Common fate'],
          answer: 2,
          why: 'Items placed close together are perceived as related, so the label reads as belonging to its field.',
        },
        {
          q: 'What does the squint test check?',
          options: ['Whether colours pass contrast rules', 'Whether the visual hierarchy is clear', 'Whether text is spelled correctly', 'Whether the grid has 12 columns'],
          answer: 1,
          why: 'Blurring removes detail, so only hierarchy remains; the key element should still be the most visible.',
        },
      ],
    },
    {
      key: 'design-principles-consistency',
      title: 'Alignment, whitespace, contrast and consistency',
      depth: 'standard',
      min: 30,
      sum: 'Polished screens follow a few habits. **Align** every element to a shared edge or grid line, use **whitespace** generously and on purpose, create **contrast** only where meaning differs, and keep patterns **consistent** so users can predict how things work. Familiar conventions beat novelty, because users spend most of their time in other apps.',
      pts: [
        'Fewer alignment lines make a layout look calmer.',
        'Whitespace is not wasted space; it groups and separates.',
        'If two things look different, they should behave differently.',
      ],
      learn: [
        'Alignment: snap elements to a few shared edges; avoid centred text in long blocks',
        'Whitespace: more space around groups than inside them; try adding space before cutting content',
        'Contrast: make differences big enough to notice; small differences look like mistakes',
        'Repetition: reuse the same styles for the same roles, so all secondary buttons look alike',
        'Consistency: internal (within your product) and external (platform conventions such as back gestures)',
        'Jakob\'s law: users expect your app to work like the apps they already use; follow common conventions',
        'Balance: distribute visual weight so screens do not feel lopsided; symmetry is optional',
        'Critique: describe what you see, link it to a user goal, then suggest a specific change',
      ],
      tasks: [
        { key: 'practice-design-critique', kind: 'practice', title: 'Critique two screens of a banking app for alignment, whitespace, contrast and consistency, with three fixes each', minutes: 35 },
      ],
      quiz: [
        {
          q: 'Two buttons look different but do exactly the same thing. Which principle is broken?',
          options: ['Consistency', 'Closure', 'Figure-ground', 'Continuity'],
          answer: 0,
          why: 'Different looks signal different behaviour; matching roles should share one style.',
        },
        {
          q: 'Which spacing choice best shows grouping?',
          options: ['Equal spacing everywhere', 'More space inside a group than between groups', 'Less space inside a group than between groups', 'No spacing, only borders'],
          answer: 2,
          why: 'Tighter spacing within a group and wider spacing between groups makes the structure visible.',
        },
      ],
    },
  ],

  typography: [
    {
      key: 'typography',
      title: 'Type scales, hierarchy and readable text',
      min: 30,
      sum: 'Most interface content is text, so typography carries much of the design. Choose sizes from a **type scale** (each step multiplied by a ratio such as 1.25), keep body text around 16px with a line height near 1.5, and limit line length to roughly 45–75 characters. Create hierarchy with size and weight before reaching for colour.',
      pts: [
        'Use a type scale: a handful of sizes, not dozens.',
        'Body: about 16px, line height about 1.5, 45–75 characters per line.',
        'Headings need tighter line height than body text.',
      ],
      learn: [
        'Type scale: sizes from a base × ratio, e.g. 16, 20, 25, 31 with ratio 1.25; limit to 5–7 sizes',
        'Ratios: 1.125 or 1.2 for dense apps, 1.25 or 1.333 for more contrast on marketing pages',
        'Body text: 16px or larger on screens; smaller only for captions and secondary labels',
        'Line height: about 1.4–1.6 for body text, 1.1–1.3 for large headings',
        'Line length: 45–75 characters per line; set a maximum width on text containers',
        'Weights: two or three (regular, medium or semibold, bold) are usually enough',
        'Letter spacing: tighten large headings slightly; add tracking to small all-caps labels',
        'Units: use rem in code so text respects the user\'s browser font size setting',
      ],
      tasks: [
        { key: 'practice-type-scale', kind: 'practice', title: 'Build a 1.25 type scale and use it to set an article page and a settings screen in Figma', minutes: 40 },
      ],
      quiz: [
        {
          q: 'With a base of 16px and a ratio of 1.25, what is the next size up?',
          options: ['18px', '24px', '20px', '32px'],
          answer: 2,
          why: '16 × 1.25 = 20px.',
        },
        {
          q: 'What is a comfortable line length for body text?',
          options: ['About 45–75 characters', 'About 10–20 characters', 'About 120–150 characters', 'Line length does not matter'],
          answer: 0,
          why: 'Very long lines make it hard to find the next line; very short ones break the reading rhythm.',
        },
      ],
    },
    {
      key: 'typography-typefaces',
      title: 'Choosing and pairing typefaces for interfaces',
      depth: 'standard',
      min: 30,
      sum: 'Typeface choice affects readability and personality. For interfaces, prefer typefaces with a large **x-height**, open letter shapes and a full range of weights; many teams use the system font stack or one well-made sans serif. Pair at most two families with clear contrast, and for Indian products check support for scripts such as Devanagari, Tamil or Bengali early.',
      pts: [
        'One family with several weights is often enough.',
        'Pair families that contrast clearly, e.g. a serif heading with a sans serif body.',
        'Use tabular figures for numbers in tables and prices.',
      ],
      learn: [
        'Classification: serif, sans serif, monospace and display; keep display faces for large headings only',
        'X-height: taller lowercase letters read better at small sizes on screens',
        'Pairing: contrast in structure (serif with sans) and similar proportions; never two near-identical sans serifs',
        'System font stack: fast, native feel and no download; a good default for product interfaces',
        'Variable fonts: one file holds a range of weights and widths, reducing downloads',
        'Indic scripts: confirm the family covers every script you need; test conjuncts, matras and line height',
        'Numbers: tabular figures align digits in tables; format amounts as ₹1,00,000 where users expect it',
        'Licensing: check that the font licence allows app embedding and web use before shipping',
      ],
      tasks: [
        { key: 'practice-type-pairing', kind: 'practice', title: 'Create three heading and body font pairings for a news app with English and Hindi text, and pick one with reasons', minutes: 40 },
      ],
      quiz: [
        {
          q: 'Why are tabular figures useful in a transaction list?',
          options: ['They look more decorative', 'Every digit has the same width, so columns of numbers line up', 'They make numbers bold', 'They reduce file size'],
          answer: 1,
          why: 'Equal-width digits keep amounts aligned, which makes them easier to compare.',
        },
        {
          q: 'Which pairing usually works best for an app?',
          options: ['Two decorative script fonts', 'Two almost identical sans serifs', 'Four different families for variety', 'A serif for headings and a sans serif for body text'],
          answer: 3,
          why: 'Clear structural contrast between two families creates hierarchy; near-identical faces just look like a mistake.',
        },
      ],
    },
  ],

  'color-theory': [
    {
      key: 'color-theory',
      title: 'Colour models, palettes and semantic roles',
      min: 30,
      sum: 'Build colour systems by **role**, not by picking hues screen by screen. Start with a brand or primary colour, add neutrals for text and surfaces, and semantic colours for success, warning, danger and information, each with a range of shades. Models such as HSL and **OKLCH** make it easier than raw hex codes to create even steps of lightness.',
      pts: [
        'Most of an interface is neutral; colour is for emphasis and meaning.',
        'Name colours by role (primary, surface, danger), not by hue.',
        'Generate shades with even lightness steps, e.g. a 50–900 scale.',
      ],
      learn: [
        'HSL: hue (0–360°), saturation and lightness; easy to reason about, but lightness is not perceptually even',
        'OKLCH: lightness, chroma and hue tuned to human perception, so equal steps look equally different',
        'Shade scale: 9–11 steps from light to dark (50 to 900) for each colour, used consistently',
        'Neutrals: greys (often slightly tinted) for text, borders and surfaces make up most of the UI',
        'Semantic roles: primary, surface, text, border, success, warning, danger and info',
        '60-30-10: a dominant neutral, a secondary colour and a small accent; a rough guide, not a rule',
        'Meaning: red can signal error or loss; check cultural and domain context, e.g. in finance apps',
        'Brand vs UI: a bright brand colour may fail contrast as text; use a darker shade for text and links',
      ],
      tasks: [
        { key: 'practice-palette', kind: 'practice', title: 'Create a palette for a student finance app: primary, neutral and four semantic colours, each with five shades', minutes: 40 },
      ],
      quiz: [
        {
          q: 'Why do many designers prefer OKLCH over HSL for building shade scales?',
          options: ['It has more hues', 'Its lightness steps look perceptually even', 'It only works in Figma', 'It removes the need for contrast checks'],
          answer: 1,
          why: 'OKLCH is designed around human perception, so equal lightness steps look evenly spaced.',
        },
        {
          q: 'Which colour name follows a semantic, role-based approach?',
          options: ['blue-500', 'ocean', 'bright-red', 'danger'],
          answer: 3,
          why: 'Role names such as danger describe purpose, so the hue can change without renaming everything.',
        },
      ],
    },
    {
      key: 'color-theory-contrast',
      title: 'Contrast, accessibility and dark mode',
      depth: 'standard',
      min: 30,
      sum: 'Colour must work for everyone and in every theme. WCAG AA requires a **4.5:1** contrast ratio for normal text and **3:1** for large text and for essential parts of controls and icons. Never use colour as the only signal, since many people cannot tell red from green. Design dark mode from the same semantic roles, with dark grey surfaces and slightly softened colours rather than inverted ones.',
      pts: [
        'Text 4.5:1; large text and UI parts 3:1 (WCAG AA).',
        'Pair colour with an icon, text or pattern.',
        'Dark mode is a separate set of values for the same roles, not an inversion.',
      ],
      learn: [
        'Contrast ratio: ranges from 1:1 to 21:1; AA needs 4.5:1 for normal text and 3:1 for large text',
        'Large text: at least 24px regular or about 18.7px bold; AAA raises normal text to 7:1',
        'Non-text contrast: input borders, focus rings and meaningful icons need 3:1 against what is next to them',
        'Colour blindness: red-green confusion is the most common type; add icons, labels or patterns',
        'Checking: run a contrast checker plugin and a colour-blindness simulator on every key screen',
        'Dark surfaces: use dark greys, show elevation with lighter surfaces, and soften pure white text',
        'Dark mode colours: reduce the saturation of bright colours so they do not glow or vibrate',
        'Tokens: map each role (text, surface, primary) to a light and a dark value so themes switch together',
      ],
      tasks: [
        { key: 'practice-contrast-audit', kind: 'practice', title: 'Audit a sign-up screen for contrast and colour-only signals, then make a dark mode version from the same roles', minutes: 45 },
      ],
      quiz: [
        {
          q: 'What is the minimum WCAG AA contrast ratio for normal body text?',
          options: ['3:1', '7:1', '4.5:1', '2:1'],
          answer: 2,
          why: 'AA requires 4.5:1 for normal text; 3:1 applies to large text and 7:1 is the AAA level.',
        },
        {
          q: 'An error state uses only a red border. What is the best fix?',
          options: ['Make the red brighter', 'Add an error icon and a text message', 'Make the border thicker', 'Use orange instead of red'],
          answer: 1,
          why: 'Colour alone fails people who cannot see the difference; an icon and text carry the meaning for everyone.',
        },
      ],
    },
  ],

  'grid-systems': [
    {
      key: 'grid-systems',
      title: 'Spacing scales and the 8-point system',
      min: 25,
      sum: 'Consistent spacing makes a screen feel designed. Pick a **spacing scale** based on 8 (4, 8, 12, 16, 24, 32, 48, 64) and take every margin, padding and gap from it. Use smaller values inside components and larger ones between sections, so spacing itself shows how content is grouped.',
      pts: [
        'Every gap comes from the scale; no random 13px values.',
        'Spacing inside a group is smaller than spacing between groups.',
        'Use 4 for fine adjustments inside small components.',
      ],
      learn: [
        '8-point system: sizes and spacing in multiples of 8, with 4 for small details such as icon gaps',
        'Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64; name them as tokens (space-1, space-2 and so on)',
        'Internal vs external: padding inside a component is smaller than the margin around it',
        'Grouping by space: tight within related items, wider between groups, widest between sections',
        'Component heights: buttons and inputs at 40 or 48px keep rhythm and comfortable tap targets',
        'Baseline rhythm: set line heights in multiples of 4 so text lines up with the spacing system',
        'Spacing in code: map the scale to CSS variables or utility classes so design and code match',
      ],
      tasks: [
        { key: 'practice-spacing-audit', kind: 'practice', title: 'Re-space a settings screen so every gap comes from an 8-point scale, noting each value you used', minutes: 35 },
      ],
      quiz: [
        {
          q: 'Which set of values fits an 8-point spacing scale?',
          options: ['5, 10, 15, 20', '8, 16, 24, 32', '7, 14, 21, 28', '6, 13, 19, 27'],
          answer: 1,
          why: 'An 8-point scale uses multiples of 8 (with 4 for small details).',
        },
        {
          q: 'Padding inside a card should usually be:',
          options: ['Smaller than or equal to the space between cards', 'Always much larger than the space between cards', 'Different on every card for variety', 'Zero'],
          answer: 0,
          why: 'Content inside a card must read as one group, so inner spacing should not exceed the gap between cards.',
        },
      ],
    },
    {
      key: 'grid-systems-columns',
      title: 'Column grids and responsive layouts',
      depth: 'standard',
      min: 30,
      sum: 'A **column grid** gives layouts a shared structure across screen sizes. Common choices are 4 columns on phones, 8 on tablets and 12 on desktops, with fixed gutters and outer margins. Content spans whole columns, and **breakpoints** decide when the layout changes. Layout grids in Figma map closely to CSS grid and flexbox, which makes handoff easier.',
      pts: [
        '4, 8 and 12 columns for phone, tablet and desktop is a safe default.',
        'Gutters and margins come from the spacing scale.',
        'Design at least a mobile and a desktop layout for key screens.',
      ],
      learn: [
        'Grid anatomy: columns, gutters (gaps between columns) and margins (space at the outer edges)',
        'Defaults: 4 columns with 16px margins on phones, 8 on tablets, 12 on desktop with 24–32px gutters',
        'Fluid vs fixed: fluid grids stretch with the screen; fixed grids cap content at a maximum width',
        'Breakpoints: change the layout where content breaks, often somewhere near 600, 900 and 1200px wide',
        'Spanning: e.g. a card spans 4 of 12 columns on desktop and all 4 on mobile; keep spans consistent',
        'Layout grids in Figma: add column and row grids to frames and snap elements to them',
        'Code mapping: CSS grid-template-columns: repeat(12, 1fr) with a gap matches a 12-column design grid',
      ],
      tasks: [
        { key: 'practice-responsive-grid', kind: 'practice', title: 'Lay out a job listings page on a 12-column desktop grid and a 4-column mobile grid in Figma', minutes: 45 },
      ],
      quiz: [
        {
          q: 'What is a gutter in a column grid?',
          options: ['The outer page margin', 'The header area', 'The baseline height', 'The gap between columns'],
          answer: 3,
          why: 'Gutters separate columns; margins are the space at the outer edges of the layout.',
        },
        {
          q: 'How many columns does a typical mobile layout grid use?',
          options: ['4', '12', '16', '24'],
          answer: 0,
          why: 'Phones are narrow, so 4 columns give usable spans; 12 is common on desktop.',
        },
      ],
    },
  ],

  // ── dev.figma ───────────────────────────────────────────────────────────
  figma: [
    {
      key: 'figma',
      title: 'Figma basics: frames, layers and shapes',
      min: 30,
      sum: 'Figma is the standard interface design tool, used in the browser or the desktop app with real-time collaboration. Everything lives in **frames**, which act as screens or containers; inside them you place shapes, text and images as **layers**. Learn to name and organise layers cleanly, use constraints, and work with keyboard shortcuts from the start.',
      pts: [
        'Use frames, not groups, for screens and containers.',
        'Name layers by purpose; messy layer trees slow everyone down.',
        'Learn the core shortcuts in your first week.',
      ],
      learn: [
        'Workspace: canvas, layers panel (left), properties panel (right), toolbar, and pages to organise work',
        'Frames vs groups: frames have size, fill, clipping, constraints and layout grids; groups only bundle layers',
        'Device frames: start from phone or desktop presets and keep the same size across a flow',
        'Shapes and vectors: rectangle, ellipse and pen tool; boolean operations combine shapes',
        'Text: auto width, auto height or fixed size boxes; set font, size, line height and letter spacing',
        'Constraints: pin layers to edges or the centre so they behave correctly when a frame resizes',
        'Shortcuts: F frame, R rectangle, T text, Ctrl+G group, Ctrl+Alt+G frame selection, Shift+A auto layout',
        'Images and export: place images with fill modes; export as PNG, JPG, SVG or PDF at 1x or 2x',
      ],
      tasks: [
        { key: 'build-figma-screen', kind: 'build', title: 'Recreate the home screen of a food delivery app in Figma with named layers and sensible constraints', minutes: 60 },
      ],
      quiz: [
        {
          q: 'Which is a key advantage of a frame over a group in Figma?',
          options: ['Frames can have constraints, fills and layout grids', 'Groups export faster', 'Frames cannot contain text', 'Only groups support auto layout'],
          answer: 0,
          why: 'Frames are real containers with their own properties; groups only bundle layers together.',
        },
        {
          q: 'Which keyboard shortcut creates a text layer in Figma?',
          options: ['R', 'F', 'P', 'T'],
          answer: 3,
          why: 'T is the text tool; R draws a rectangle, F a frame and P the pen.',
        },
      ],
    },
    {
      key: 'figma-styles',
      title: 'Styles, libraries, collaboration and handoff',
      depth: 'standard',
      min: 30,
      sum: 'Reusable **styles** for colour, text, effects and grids keep a file consistent: change a style once and every use updates. Shared **libraries** publish styles and components across files. Figma is also where teams collaborate through comments, version history and branching, and **Dev Mode** lets developers inspect measurements and export assets.',
      pts: [
        'Never hardcode a colour or text setting that should be a style.',
        'Organise files with clear pages: cover, flows, components, archive.',
        'Mark finished frames ready for development and annotate edge cases.',
      ],
      learn: [
        'Styles: colour, text, effect and layout grid styles; apply them instead of raw values',
        'Variables: store colours, numbers and strings and support modes such as light and dark',
        'Libraries: publish styles and components from one file and enable them in others; review updates',
        'File organisation: pages for cover, work in progress, final flows, components and archive',
        'Collaboration: comments with mentions, observation mode, and version history with named versions',
        'Branching: explore big changes in a branch and merge them after review (available on paid plans)',
        'Dev Mode: developers inspect sizes, spacing, styles and code snippets, compare changes and export assets',
        'Handoff notes: annotate interactions, states and edge cases next to frames marked ready for development',
      ],
      tasks: [
        { key: 'practice-figma-styles', kind: 'practice', title: 'Turn every colour and text setting in your food app screen into styles and add handoff annotations', minutes: 40 },
      ],
      quiz: [
        {
          q: 'What happens when you edit a colour style used across a Figma file?',
          options: ['Only new layers change', 'Every layer using that style updates', 'Nothing changes until you export', 'The style is duplicated'],
          answer: 1,
          why: 'Layers reference the style, so one edit updates every place it is used.',
        },
        {
          q: 'What is Dev Mode in Figma mainly used for?',
          options: ['Writing backend code', 'Hosting websites', 'Developers inspecting designs and exporting assets', 'Running usability tests'],
          answer: 2,
          why: 'Dev Mode gives developers measurements, styles, code snippets and exports for handoff.',
        },
      ],
    },
  ],

  'figma-auto-layout': [
    {
      key: 'figma-auto-layout',
      title: 'Auto layout: direction, gap, padding and resizing',
      min: 30,
      sum: '**Auto layout** makes Figma frames behave much like CSS flexbox: children stack horizontally or vertically, or wrap onto new lines, with set gaps and padding, and the frame resizes as content changes. Each layer can **hug** its contents, **fill** the container or stay **fixed**. Nesting auto layout frames is how you build buttons, cards and whole screens that adapt to real content.',
      pts: [
        'Hug fits the content, fill takes available space, fixed stays put.',
        'Build from the inside out: button, then row, then card, then screen.',
        'Gaps and padding should come from your spacing scale.',
      ],
      learn: [
        'Adding auto layout: Shift+A on a selection; set the direction to horizontal, vertical or wrap',
        'Gap and padding: space between items and inside the frame; "space between" spreads items evenly',
        'Alignment: align children to start, centre or end on both axes, like justify and align in flexbox',
        'Resizing: each layer can hug contents, fill the container, or use a fixed width and height',
        'Min and max width: stop a fill element from becoming too narrow or too wide',
        'Absolute position: lift one child (such as a badge) out of the flow while keeping it in the frame',
        'Nesting: combine vertical and horizontal frames, e.g. a card is a vertical stack holding a horizontal row',
        'Text: set text layers to fill width with auto height so long strings wrap instead of overflowing',
      ],
      tasks: [
        { key: 'build-auto-layout-card', kind: 'build', title: 'Build a job listing card with nested auto layout that copes with long titles, many tags and a missing logo', minutes: 45 },
      ],
      quiz: [
        {
          q: 'A button should grow when its label gets longer. Which resizing setting should the button frame use?',
          options: ['Fixed width', 'Fill container', 'Hug contents', 'Scale'],
          answer: 2,
          why: 'Hug contents sizes the frame to its children, so the button grows with its label.',
        },
        {
          q: 'Which CSS layout model is Figma auto layout most similar to?',
          options: ['Flexbox', 'Floats', 'Tables', 'Absolute positioning'],
          answer: 0,
          why: 'Direction, gap, padding, alignment and grow or shrink behaviour map closely to flexbox.',
        },
      ],
    },
    {
      key: 'figma-auto-layout-components',
      title: 'Components, variants and component properties',
      depth: 'standard',
      min: 35,
      sum: 'A **component** is a reusable main element; each copy is an **instance** that updates when the main component changes. **Variants** group related versions (size, state, type) into one component set, and **component properties** (boolean, text, instance swap, variant) let designers change an instance from the properties panel without detaching it. Combined with auto layout, this gives flexible and consistent building blocks.',
      pts: [
        'Edit the main component; instances follow while keeping their overrides.',
        'Avoid detaching instances: it breaks the link to future updates.',
        'Name variant properties like code: size=sm|md|lg, state=default|hover.',
      ],
      learn: [
        'Main component and instances: Ctrl+Alt+K creates a component; instances inherit changes, keep overrides',
        'Variants: combine versions into a component set with properties such as type, size and state',
        'Boolean property: show or hide a layer, e.g. the leading icon on a button',
        'Text property: expose label text so it can be edited from the properties panel',
        'Instance swap property: replace a nested instance, e.g. choose which icon a button shows',
        'Nested instances: expose nested properties so people configure children from the parent',
        'Interactive components: link variants with hover or press interactions for realistic prototypes',
        'Naming: slash naming (Button/Primary) and property names that match the names used in code',
      ],
      tasks: [
        { key: 'build-button-component', kind: 'build', title: 'Build a button component with variants for type, size and state, plus icon and label properties', minutes: 50 },
      ],
      quiz: [
        {
          q: 'Which component property lets you choose which icon appears inside a button instance?',
          options: ['Boolean', 'Text', 'Variant', 'Instance swap'],
          answer: 3,
          why: 'Instance swap replaces a nested instance, such as the icon, with another component.',
        },
        {
          q: 'Why should you avoid detaching instances?',
          options: ['Detached layers cannot be exported', 'They stop receiving updates from the main component', 'Detaching deletes the main component', 'Detached layers lose their colours'],
          answer: 1,
          why: 'A detached instance becomes a plain frame, so fixes to the main component no longer reach it.',
        },
      ],
    },
  ],

  'design-systems': [
    {
      key: 'design-systems',
      title: 'Design tokens: primitives, semantics and modes',
      min: 35,
      sum: 'A design system is the shared language of design and engineering, and **tokens** are its smallest pieces: named values for colour, type, spacing, radius and shadow. Keep two layers: **primitive** tokens hold raw values, and **semantic** tokens describe purpose and point to primitives. Modes such as light and dark swap the values behind semantic tokens without touching components.',
      pts: [
        'Components use semantic tokens, never raw primitives.',
        'Name by purpose: color.text.muted, not grey-500.',
        'Modes switch values; names stay the same.',
      ],
      learn: [
        'Token: a named design decision, e.g. space.4 = 16px or color.text.default = gray.900',
        'Primitive tokens: the raw palette and scales (blue.600, size.16) with no meaning attached',
        'Semantic tokens: purpose-based aliases (color.action.primary, color.surface.raised) that reference primitives',
        'Naming pattern: category.property.variant.state, e.g. color.border.input.focus; stay consistent',
        'Figma variables: one collection for primitives, one for semantics; modes for light, dark or brand themes',
        'Scoping: limit each variable to the fields where it belongs (fills, gaps, radius) to prevent misuse',
        'Coverage: colour, typography, spacing, radius, elevation, motion duration and breakpoints',
      ],
      tasks: [
        { key: 'build-token-set', kind: 'build', title: 'Create primitive and semantic colour and spacing variables with light and dark modes for a college events app', minutes: 50 },
      ],
      quiz: [
        {
          q: 'Which is a semantic token name?',
          options: ['blue-600', 'color.text.danger', '#D32F2F', 'red-light'],
          answer: 1,
          why: 'It names the purpose (danger text), not the raw colour, so its value can change per theme.',
        },
        {
          q: 'Why do components reference semantic tokens instead of primitives?',
          options: ['Primitives render more slowly', 'Semantic tokens use less memory', 'Figma does not allow primitives', 'Themes can change values without editing components'],
          answer: 3,
          why: 'Swapping the values behind semantic tokens retheme every component at once.',
        },
      ],
    },
    {
      key: 'design-systems-components',
      title: 'Building and documenting a component library',
      min: 35,
      sum: 'Components turn tokens into reusable UI: buttons, inputs, selects, cards, dialogs and navigation. Each needs every state designed, accessibility built in and clear usage guidelines, so others use it correctly without asking. Start from the components your product repeats most, and document when to use each one and when not to.',
      pts: [
        'Build the most-used components first; do not design for imaginary needs.',
        'Document states, variants, do and don\'t examples, and accessibility for each component.',
        'Prefer composing small parts over one giant configurable component.',
      ],
      learn: [
        'Inventory: screenshot existing screens, group duplicates and pick which components to standardise',
        'Composition: small parts (icons, labels) build components, which build patterns such as forms',
        'States: default, hover, focus, pressed, disabled, loading, error and selected where relevant',
        'Accessibility: visible focus rings, 3:1 non-text contrast, labels for icon buttons, keyboard behaviour',
        'Documentation: purpose, anatomy, variants, states, spacing, do and don\'t examples and content rules',
        'Patterns: document combinations such as forms, empty states and confirmation flows, not just pieces',
        'Flexible content areas: let cards and dialogs hold any content instead of adding endless variants',
      ],
      tasks: [
        { key: 'build-input-component', kind: 'build', title: 'Design a text input component with all its states and write a one-page usage guideline for it', minutes: 55 },
      ],
      quiz: [
        {
          q: 'What is the best first step when creating a design system for an existing product?',
          options: ['Design every possible component from scratch', 'Choose a brand-new font', 'Inventory the UI and group repeated elements', 'Write all the code first'],
          answer: 2,
          why: 'An inventory shows what the product actually repeats and where inconsistencies are worst.',
        },
        {
          q: 'Which component state is most often forgotten but essential for keyboard users?',
          options: ['Focus', 'Hover', 'Default', 'Selected'],
          answer: 0,
          why: 'Keyboard users need a visible focus state to know which element is active.',
        },
      ],
    },
    {
      key: 'design-systems-code',
      title: 'Syncing with code, versioning and governance',
      depth: 'optional',
      min: 35,
      sum: 'A design system only works if design and code match. Teams export tokens as JSON, often in the Design Tokens Community Group format, transform them into CSS variables and platform code with build tools, and version releases with **semantic versioning**. Governance decides who can add or change components, and how teams contribute and hear about updates.',
      pts: [
        'One source of truth for tokens, transformed for each platform.',
        'Semantic versioning: breaking changes bump the major version.',
        'A clear contribution process prevents forks and one-off components.',
      ],
      learn: [
        'Token pipeline: tokens as JSON → build tool → CSS variables plus Android and iOS values from one source',
        'Token format: the Design Tokens Community Group JSON format gives each token a $value and a $type',
        'Parity: the same names in Figma and code; link components to their code with snippets in Dev Mode',
        'Semantic versioning: MAJOR for breaking changes, MINOR for new features, PATCH for fixes',
        'Changelog and deprecation: announce changes and mark old components deprecated before removing them',
        'Governance models: a central team, federated contributors, or a hybrid with a review process',
        'Adoption signals: share of screens built from system components and the number of detached instances',
      ],
      tasks: [
        { key: 'practice-token-json', kind: 'practice', title: 'Write your colour and spacing tokens as JSON and map them by hand to CSS custom properties', minutes: 40 },
        { key: 'practice-contribution-guide', kind: 'practice', title: 'Draft a one-page contribution process for proposing a new component', minutes: 25, optional: true },
      ],
      quiz: [
        {
          q: 'A release renames a token that apps already use. Which part of the version should change?',
          options: ['Patch', 'Minor', 'Major', 'None'],
          answer: 2,
          why: 'Renaming breaks existing references, which is a breaking change and needs a major version.',
        },
        {
          q: 'What does a token pipeline do?',
          options: ['Turns one token source into platform formats such as CSS variables', 'Deletes unused components', 'Runs usability tests', 'Uploads screenshots for review'],
          answer: 0,
          why: 'It transforms a single token source into code for each platform, keeping them in sync.',
        },
      ],
    },
  ],

  // ── dev.ux ──────────────────────────────────────────────────────────────
  wireframing: [
    {
      key: 'wireframing',
      title: 'User flows and low-fidelity wireframes',
      min: 30,
      sum: 'Before visual design, map how users reach a goal and sketch the structure of each screen. A **user flow** shows the steps, decisions and screens between an entry point and a goal; a **wireframe** shows layout, content and hierarchy in greyscale without polish. Staying low-fidelity keeps feedback on structure and makes it cheap to throw ideas away.',
      pts: [
        'Start from the user goal and entry point, then map the steps.',
        'Wireframes use realistic content, not lorem ipsum.',
        'Sketch several options quickly before committing to one.',
      ],
      learn: [
        'User flow: entry point → steps → decisions → success, with error and back paths shown',
        'Flow symbols: rectangles for screens, diamonds for decisions, arrows for user actions',
        'Task flow vs user flow: a task flow is one linear path; a user flow includes branches and user types',
        'Paper sketches: draw 6–8 rough layout ideas in a few minutes (crazy eights) before using software',
        'Wireframe content: real labels and realistic text lengths reveal layout problems early',
        'Fidelity: low (boxes and lines), mid (greyscale with real layout), high (full visual design)',
        'Annotations: note behaviour, rules and data sources next to the wireframe',
      ],
      tasks: [
        { key: 'practice-user-flow', kind: 'practice', title: 'Draw the user flow for booking a doctor\'s appointment in a health app, including payment failure and rescheduling', minutes: 35 },
        { key: 'practice-crazy-eights', kind: 'practice', title: 'Sketch eight layout ideas for the doctor list screen in eight minutes, then wireframe the best one', minutes: 30, optional: true },
      ],
      quiz: [
        {
          q: 'Why are wireframes kept low-fidelity?',
          options: ['They load faster in the browser', 'To keep feedback on structure, not colours and fonts', 'Developers prefer grey screens', 'Low-fidelity designs never need changes'],
          answer: 1,
          why: 'Without visual polish, reviewers comment on layout and flow, and ideas are cheap to discard.',
        },
        {
          q: 'In a user flow diagram, what does a diamond usually represent?',
          options: ['A screen', 'An end point', 'An error message', 'A decision'],
          answer: 3,
          why: 'Diamonds mark decision points, such as "logged in?", where the flow branches.',
        },
      ],
    },
    {
      key: 'wireframing-patterns',
      title: 'Screen patterns for mobile and web wireframes',
      depth: 'standard',
      min: 30,
      sum: 'Most screens reuse a small set of proven patterns: lists and detail views, forms, search and filters, dashboards and onboarding. Knowing these patterns and the platform conventions for mobile and web lets you wireframe quickly and spend your thinking time where your product is actually different. Design for the smallest screen first, then expand.',
      pts: [
        'Reuse proven patterns; innovate only where it matters.',
        'Mobile first: decide what truly fits on a small screen.',
        'Put primary actions within easy thumb reach on phones.',
      ],
      learn: [
        'List and detail: scannable rows with key information, and a detail screen for everything else',
        'Forms: one column, labels above fields, related fields grouped, the primary button at the end',
        'Search and filters: search at the top, filters as chips or a sheet, result counts and a clear-all option',
        'Navigation: a bottom tab bar for 3–5 top destinations on mobile; top navigation or a sidebar on desktop',
        'Thumb zone: put frequent actions in the lower middle of phone screens, not in the top corners',
        'Mobile first: wireframe the phone layout, then add columns and side panels for larger screens',
        'States: wireframe the empty, loading, error and full states of each key screen, not just the happy path',
      ],
      tasks: [
        { key: 'practice-wireframe-set', kind: 'practice', title: 'Wireframe five mobile screens for a second-hand book marketplace: home, search results, detail, chat, sell form', minutes: 60 },
      ],
      quiz: [
        {
          q: 'How many destinations suit a mobile bottom tab bar?',
          options: ['1–2', '8–10', '3–5', 'As many as needed'],
          answer: 2,
          why: 'Three to five tabs stay readable and tappable; more belong in a menu or another pattern.',
        },
        {
          q: 'Which form layout is generally easiest to complete?',
          options: ['A single column with labels above fields', 'Three columns of fields', 'Labels shown only as placeholders inside fields', 'Fields in random order'],
          answer: 0,
          why: 'A single column gives one clear path, and visible labels stay readable while typing.',
        },
      ],
    },
  ],

  prototyping: [
    {
      key: 'prototyping',
      title: 'Clickable prototypes: flows, links and fidelity',
      min: 30,
      sum: 'A prototype lets people experience a design before anyone writes code. In Figma, connect frames with **interactions** (on tap, navigate to), set a starting point for each flow and present it on a device. Build only the paths you need to answer your question, and match fidelity to that question: low for flow and structure, high for visual and interaction details.',
      pts: [
        'Decide which question the prototype must answer first.',
        'Build the happy path plus the one or two branches you will test.',
        'Test on a real phone when the product is mobile.',
      ],
      learn: [
        'Purpose: exploring ideas, testing usability or showing stakeholders; each needs a different fidelity',
        'Flows and starting points: one starting frame per flow so testers begin in the right place',
        'Interactions: a trigger (on tap, on drag, while hovering, after delay) plus an action (navigate, overlay, back)',
        'Overlays: open menus, bottom sheets and dialogs as overlays positioned over the current frame',
        'Scrolling: set overflow scrolling on frames and fix headers or tab bars so they stay in place',
        'Transitions: instant, dissolve, move in, push and slide; keep them short and consistent',
        'Presenting: use present mode with the right device frame, or the Figma mobile app on a real phone',
      ],
      tasks: [
        { key: 'build-clickable-prototype', kind: 'build', title: 'Prototype the doctor booking flow from your wireframes: list, detail, slot choice, payment and confirmation', minutes: 55 },
      ],
      quiz: [
        {
          q: 'What should decide the fidelity of a prototype?',
          options: ['The question the prototype needs to answer', 'How much free time the designer has', 'The number of screens in the app', 'The colour palette'],
          answer: 0,
          why: 'Flow questions need only rough screens; visual or interaction questions need high fidelity.',
        },
        {
          q: 'Which is best for showing a bottom sheet over the current screen in a prototype?',
          options: ['Navigate to a new frame', 'An overlay', 'A new page in the file', 'Exporting a PNG'],
          answer: 1,
          why: 'Overlays appear on top of the current frame, just as a real bottom sheet would.',
        },
      ],
    },
    {
      key: 'prototyping-advanced',
      title: 'Smart animate, variables and realistic prototypes',
      depth: 'standard',
      min: 35,
      sum: 'Realistic prototypes need state and motion. **Smart animate** animates matching layers between frames, **interactive components** let a button or toggle handle its own states, and **variables with conditionals** let a prototype remember values such as a cart count or a signed-in flag. Use them to test detailed interactions, but do not try to build the whole app in Figma.',
      pts: [
        'Smart animate matches layers by name across frames.',
        'Interactive components cut the number of frames you need.',
        'Stop when the prototype answers the question; it is not production code.',
      ],
      learn: [
        'Smart animate: animates position, size, opacity and rotation of same-named layers between two frames',
        'Easing: ease-out for entering elements, ease-in for leaving ones; keep most transitions to 150–300 ms',
        'Interactive components: wire variants (off and on, default and pressed) so every instance works',
        'Variables in prototypes: a "set variable" action on click stores values like quantity or the selected tab',
        'Conditionals: if/else on variable values shows different outcomes, such as an empty cart',
        'Device testing: try gestures (drag, swipe) on a phone, because mouse clicks hide touch problems',
        'Prototype hygiene: name flows, delete unused links and click through every path before a session',
      ],
      tasks: [
        { key: 'build-cart-prototype', kind: 'build', title: 'Prototype an add-to-cart flow with a quantity stepper and a cart badge using variables and smart animate', minutes: 55 },
      ],
      quiz: [
        {
          q: 'How does smart animate decide which layers to animate between two frames?',
          options: ['By layer colour', 'By layer size', 'By matching layer names', 'At random'],
          answer: 2,
          why: 'Layers with the same name (and hierarchy) in both frames are matched and animated.',
        },
        {
          q: 'What lets a prototype remember that a user added three items to the cart?',
          options: ['Layout grids', 'Text styles', 'Constraints', 'Variables'],
          answer: 3,
          why: 'Variables store values during a prototype session, and conditionals can react to them.',
        },
      ],
    },
  ],

  'interaction-design': [
    {
      key: 'interaction-design',
      title: 'Feedback, affordances and component states',
      min: 30,
      sum: 'Interaction design shapes how a product responds to people. Controls must look like what they do (**affordances** and **signifiers**), every action needs visible **feedback**, and every component needs designed states for hover, focus, pressed, disabled, loading and error. Make targets large and easy to reach, and let people undo mistakes instead of only warning them.',
      pts: [
        'Every action gets feedback, ideally within about 100 ms.',
        'Design all the states, not just the default.',
        'Prefer undo over "Are you sure?" dialogs for reversible actions.',
      ],
      learn: [
        'Affordance and signifier: what an element allows, and the cue (shape, underline, shadow) that shows it',
        'Feedback: pressed states, spinners, toasts and inline messages confirm that an action happened',
        'Component states: default, hover, focus, pressed, disabled, loading, error, success and selected',
        'Target size: at least 24×24 CSS px under WCAG 2.2 AA; 44–48px is the usual mobile guideline',
        'Fitts\'s law: bigger and closer targets are faster to hit; place key actions near the user\'s focus',
        'Hick\'s law: more choices take longer to decide; reduce or group options for frequent decisions',
        'Error prevention and recovery: constrain input, confirm destructive actions and offer undo',
        'Keyboard: logical tab order, visible focus, Enter or Space to activate and Esc to close',
      ],
      tasks: [
        { key: 'practice-state-matrix', kind: 'practice', title: 'Design every state of a "Pay ₹499" button and a UPI ID input, including loading, error and success', minutes: 40 },
      ],
      quiz: [
        {
          q: 'What is the WCAG 2.2 AA minimum size for pointer targets (with some exceptions)?',
          options: ['12×12 CSS px', '24×24 CSS px', '64×64 CSS px', 'There is no minimum'],
          answer: 1,
          why: 'WCAG 2.2 success criterion 2.5.8 sets 24×24 CSS pixels; platform guidelines recommend larger.',
        },
        {
          q: 'A user deletes a message by mistake. Which design best supports recovery?',
          options: ['A confirmation dialog for every message', 'Hiding the delete button', 'A toast with an Undo action', 'An error sound'],
          answer: 2,
          why: 'Undo fixes the mistake without slowing down every deliberate delete with a dialog.',
        },
      ],
    },
    {
      key: 'interaction-design-motion',
      title: 'Motion, loading states and response times',
      depth: 'standard',
      min: 30,
      sum: 'Timing shapes how fast and trustworthy a product feels. About **0.1 s** feels instant, about **1 s** keeps the user\'s flow of thought, and beyond about **10 s** attention drifts, so match the loading pattern to the wait. Use motion to explain changes (where something came from or went), keep it short, and respect the reduced-motion setting.',
      pts: [
        'Under about 1 s: no spinner needed; 1–10 s: an indicator; longer: progress and an estimate.',
        'Motion should explain, not decorate.',
        'Honour reduced motion: replace movement with fades or nothing.',
      ],
      learn: [
        'Response time limits: 0.1 s feels instant, 1 s keeps the flow of thought, 10 s is the limit of attention',
        'Loading patterns: skeleton screens for content, spinners for short waits, progress bars for long tasks',
        'Optimistic UI: show the result at once (a like, a sent message) and roll back with a message if it fails',
        'Motion purpose: show relationships, continuity and state changes, e.g. a card expanding into a page',
        'Duration and easing: about 100–300 ms for most UI motion; ease-out to enter, ease-in to exit',
        'Micro-interactions: trigger, rules, feedback, and loops and modes, e.g. pull to refresh or a toggle',
        'Reduced motion: respect the OS setting (prefers-reduced-motion) and avoid large parallax and zooms',
      ],
      tasks: [
        { key: 'practice-loading-states', kind: 'practice', title: 'Design loading, empty, error and success states for a train ticket search results screen', minutes: 40 },
        { key: 'build-micro-interaction', kind: 'build', title: 'Prototype a like-button micro-interaction with smart animate, plus a reduced-motion version', minutes: 30, optional: true },
      ],
      quiz: [
        {
          q: 'Which pattern best suits a feed of cards that takes about two seconds to load?',
          options: ['A skeleton screen', 'No feedback at all', 'A full-screen error', 'A progress bar with a time estimate'],
          answer: 0,
          why: 'Skeletons show the shape of coming content during short waits; long tasks need progress estimates.',
        },
        {
          q: 'What is optimistic UI?',
          options: ['Showing success messages on every screen', 'Using bright, cheerful colours', 'Updating the interface at once and rolling back if the request fails', 'Hiding errors from users'],
          answer: 2,
          why: 'The UI assumes success for fast feedback, then corrects itself and explains if the server says no.',
        },
      ],
    },
  ],

  'usability-testing': [
    {
      key: 'usability-testing',
      title: 'Planning and running a moderated usability test',
      min: 30,
      sum: 'Usability testing means watching real people try realistic tasks with your design. Recruit about five representative users per round, write task scenarios that give a goal without hinting at the interface, ask participants to **think aloud**, and observe without helping. Several small rounds with fixes in between find more problems than one large study.',
      pts: [
        'Test tasks, not opinions: watch what people do.',
        'Do not lead or rescue; ask "what would you do next?".',
        'About five users per round, then fix and test again.',
      ],
      learn: [
        'Test plan: goals, participant profile, 4–6 tasks, success criteria, prototype version and team roles',
        'Recruiting: screen for real target users; friends who know the product give biased results',
        'Task scenarios: realistic goals ("Book a cab to the station for 6 am") without naming buttons or menus',
        'Think aloud: ask people to say what they look for and expect; prompt gently when they go quiet',
        'Moderation: stay neutral, answer questions with questions, and help only if someone is fully stuck',
        'Observing: note where people hesitate, backtrack, misread or fail; a note-taker frees the moderator',
        'Moderated vs unmoderated: live sessions allow follow-up questions; unmoderated tests scale but lose context',
        'Pilot: run the full session once with a colleague to fix confusing tasks and broken links',
      ],
      tasks: [
        { key: 'practice-test-plan', kind: 'practice', title: 'Write a usability test plan with five task scenarios for your doctor booking prototype', minutes: 35 },
        { key: 'practice-run-tests', kind: 'practice', title: 'Run the test with three people and record where each one hesitated or failed', minutes: 60, optional: true },
      ],
      quiz: [
        {
          q: 'Which task scenario is best for a usability test?',
          options: ['Click the Book button on the home screen', 'Do you like the booking page?', 'Find the green button', 'You have a fever; book the earliest appointment with a doctor near you'],
          answer: 3,
          why: 'It gives a realistic goal without naming interface elements, so you see how people actually navigate.',
        },
        {
          q: 'A participant asks "Should I tap here?" What should the moderator say?',
          options: ['"Yes, tap there."', '"What would you expect to happen if you did?"', '"No, try the menu."', '"That is wrong."'],
          answer: 1,
          why: 'Returning the question keeps the moderator neutral and reveals what the participant expects.',
        },
      ],
    },
    {
      key: 'usability-testing-analysis',
      title: 'Heuristic evaluation and analysing findings',
      depth: 'standard',
      min: 30,
      sum: 'A **heuristic evaluation** reviews a design against established usability principles and catches obvious problems before you test with users. After testing, turn observations into findings: group repeated problems, rate their **severity** and recommend specific fixes. Report a few clear, prioritised issues with evidence rather than a long list nobody acts on.',
      pts: [
        'Heuristics find likely problems; tests confirm real ones.',
        'Severity depends on how often a problem occurs, its impact and whether it persists.',
        'Each finding: what happened, evidence, severity and a fix.',
      ],
      learn: [
        'Heuristics 1–5: visibility of status, match with the real world, user control, consistency, error prevention',
        'Heuristics 6–10: recognition over recall, flexibility, minimalist design, error recovery, help and docs',
        'Running an evaluation: 3–5 evaluators review alone, then merge their issues and remove duplicates',
        'Severity scale: 0 not a problem, 1 cosmetic, 2 minor, 3 major, 4 catastrophic',
        'Metrics: task success rate, time on task, errors per task and a questionnaire such as SUS',
        'Synthesis: list issues per task, count how many participants hit each, and attach quotes or clips',
        'Report: top issues first with evidence and a concrete recommendation; note what worked well too',
      ],
      tasks: [
        { key: 'practice-heuristic-review', kind: 'practice', title: 'Run a heuristic evaluation of a railway ticket booking app and rate each issue on the 0–4 severity scale', minutes: 45 },
      ],
      quiz: [
        {
          q: 'Which heuristic is broken when users must remember a code from a previous screen?',
          options: ['Recognition rather than recall', 'Aesthetic and minimalist design', 'Help and documentation', 'Flexibility and efficiency of use'],
          answer: 0,
          why: 'Interfaces should show needed information rather than make people hold it in memory.',
        },
        {
          q: 'What makes a usability finding most actionable?',
          options: ['A general statement that the app is confusing', 'Evidence, a severity rating and a specific recommended fix', 'A list of every opinion participants shared', 'A redesign of the whole app'],
          answer: 1,
          why: 'Teams act on findings they can verify, prioritise and turn into a concrete change.',
        },
      ],
    },
  ],

  'information-architecture': [
    {
      key: 'information-architecture',
      title: 'Organising content: card sorting and sitemaps',
      min: 30,
      sum: '**Information architecture** (IA) decides how content is grouped, labelled and connected so people can find things. Learn how your users think about the content with **card sorting**, choose an organisation scheme that matches their tasks, and record the structure in a **sitemap**. Labels should use the users\' words, not internal team jargon.',
      pts: [
        'Organise around user tasks and mental models, not the org chart.',
        'Open card sorts discover groups; closed sorts test existing ones.',
        'Balance breadth and depth; do not bury content many levels down.',
      ],
      learn: [
        'IA parts: organisation (grouping), labelling (names), navigation (moving) and search (finding)',
        'Organisation schemes: by topic, task, audience, time or alphabet; mix them only for clear reasons',
        'Open card sort: users group cards and name the groups themselves, revealing their mental models',
        'Closed card sort: users place cards into predefined groups, checking a proposed structure',
        'Analysing sorts: look for cards often grouped together and for cards with no agreement',
        'Sitemap: a hierarchy diagram of sections and pages, numbered by level (1.0, 1.1, 1.1.1)',
        'Breadth vs depth: a few levels with clear groups is usually easier than a deep, narrow tree',
      ],
      tasks: [
        { key: 'practice-card-sort', kind: 'practice', title: 'Run an open card sort with 25 cards for a college app with three classmates, then draw a sitemap', minutes: 50 },
      ],
      quiz: [
        {
          q: 'Which method lets users create and name their own groups?',
          options: ['Closed card sort', 'Tree test', 'Open card sort', 'A/B test'],
          answer: 2,
          why: 'In an open sort participants form and name groups, which shows how they think about the content.',
        },
        {
          q: 'Why should navigation labels use users\' words?',
          options: ['Internal names are confidential', 'Users find content faster when labels match how they think', 'It improves page load speed', 'Design tools require it'],
          answer: 1,
          why: 'People scan for words they expect; internal jargon makes them guess.',
        },
      ],
    },
    {
      key: 'information-architecture-navigation',
      title: 'Navigation design, labelling and tree testing',
      depth: 'standard',
      min: 30,
      sum: 'Navigation turns the IA into something people can move through. Choose patterns that fit the platform and the number of destinations, show users where they are, and support both browsing and search. **Tree testing** checks whether people can find items in your structure without visual design getting in the way.',
      pts: [
        'Users must always know where they are and how to go back.',
        'Tree testing checks findability before visual design.',
        'Search complements navigation; it does not replace a clear structure.',
      ],
      learn: [
        'Global vs local navigation: global for top sections everywhere, local for options within a section',
        'Patterns: bottom tabs, top tabs, side navigation, drawers, breadcrumbs and hub-and-spoke',
        'Wayfinding: highlight the current section, use clear page titles and add breadcrumbs on deep pages',
        'Tree test: users find items in a text-only hierarchy; measure success rate and directness',
        'First click: where people click first strongly predicts whether they complete the task',
        'Search: show suggestions, tolerate typos and transliterated words, and design a useful no-results state',
        'Labelling: short, specific, parallel labels; avoid vague ones such as "Resources" or "More" where possible',
      ],
      tasks: [
        { key: 'practice-tree-test', kind: 'practice', title: 'Design and run a tree test with six find-it tasks on your college app sitemap, then revise the structure', minutes: 45 },
      ],
      quiz: [
        {
          q: 'What does a tree test measure?',
          options: ['Visual appeal', 'Page load time', 'Colour contrast', 'Whether users can find items in a text-only structure'],
          answer: 3,
          why: 'Removing visual design isolates the structure and labels, so you see whether people can find things.',
        },
        {
          q: 'On deep website pages, which pattern helps users see where they are?',
          options: ['Breadcrumbs', 'Carousels', 'Pop-ups', 'Infinite scroll'],
          answer: 0,
          why: 'Breadcrumbs show the path from the home page and let users jump back up levels.',
        },
      ],
    },
  ],

  'ux-writing': [
    {
      key: 'ux-writing',
      title: 'Buttons, labels and error messages',
      min: 25,
      sum: 'Words are part of the interface. Write buttons as **verbs that describe the outcome**, labels that say exactly what goes in a field, and error messages that explain what happened and how to fix it, without blaming the user. Keep text short, put the key words first and use the same term for the same thing everywhere.',
      pts: [
        'Buttons: verb plus object, e.g. "Save changes", not "OK".',
        'Errors: what happened, why if useful, and how to fix it.',
        'One term per concept across the whole product.',
      ],
      learn: [
        'Buttons: verb plus object ("Pay ₹499", "Send invite"); avoid vague "Submit", "OK" or "Click here"',
        'Labels: name the content precisely ("Mobile number"); give format hints outside the placeholder',
        'Error messages: say what went wrong and how to fix it, e.g. "Enter a 10-digit mobile number"',
        'Error tone: no blame, no jargon, no bare error codes; keep what the user typed whenever possible',
        'Front-loading: put the important words first so people who scan still get the meaning',
        'Consistency: pick one term (e.g. "Sign in", not also "Log in") and keep a shared word list',
        'Confirmation dialogs: the title names the action and buttons repeat it ("Delete file" and "Cancel")',
      ],
      tasks: [
        { key: 'practice-rewrite-errors', kind: 'practice', title: 'Rewrite ten vague buttons and error messages from apps you use, showing before, after and why', minutes: 30 },
      ],
      quiz: [
        {
          q: 'Which error message is best?',
          options: ['Error 403', 'Invalid input', 'Enter the 6-digit OTP from the SMS we sent to your number', 'Oops! Something happened'],
          answer: 2,
          why: 'It says exactly what is needed and where to find it; the others give no way forward.',
        },
        {
          q: 'In a dialog confirming deletion of a resume, which button label is best?',
          options: ['Yes', 'OK', 'Proceed', 'Delete resume'],
          answer: 3,
          why: 'A verb plus object states the outcome, so people do not need to reread the question.',
        },
      ],
    },
    {
      key: 'ux-writing-voice',
      title: 'Empty states, onboarding copy and voice and tone',
      depth: 'standard',
      min: 30,
      sum: 'Beyond labels, UX writing guides people through first use, empty screens and sensitive moments. An empty state should explain what will appear and offer the next step; onboarding should show value quickly instead of listing every feature. A defined **voice** keeps the product sounding the same everywhere, while **tone** adapts to the moment: calmer for errors and payments than for celebrations.',
      pts: [
        'Empty states: what goes here, why it is empty, and one clear action.',
        'Voice stays constant; tone changes with the situation.',
        'Write for translation: simple sentences, no idioms.',
      ],
      learn: [
        'Empty states: first use, no results and cleared states each need different text and a next action',
        'Onboarding copy: lead with the user benefit, keep steps few, and let people skip and return later',
        'Voice: 3–4 traits with do and don\'t examples, e.g. "friendly, not childish"',
        'Tone: adjust to context; plain and reassuring for money, failures and account problems',
        'Plain language: short sentences, common words and active voice, written for someone new to the product',
        'Localisation: leave room for longer translations, avoid idioms, and test Hindi and regional languages',
        'Inclusive language: avoid gendered defaults and ableist phrases; use "they" when gender is unknown',
        'Formats: write ₹ amounts, dates and phone numbers in the formats Indian users expect',
      ],
      tasks: [
        { key: 'practice-empty-states', kind: 'practice', title: 'Write empty-state copy for no saved jobs, no search results and no internet in a job app, each with a next step', minutes: 30 },
        { key: 'practice-voice-chart', kind: 'practice', title: 'Write a voice chart with three traits and do and don\'t examples for a student finance app', minutes: 25, optional: true },
      ],
      quiz: [
        {
          q: 'What is the difference between voice and tone?',
          options: ['They are the same thing', 'Voice stays consistent; tone adapts to the situation', 'Voice is for buttons, tone is for errors', 'Tone never changes'],
          answer: 1,
          why: 'Voice is the product\'s stable personality; tone shifts with context, such as a failed payment.',
        },
        {
          q: 'What should a good empty state include?',
          options: ['A clear explanation and a next action', 'Only an illustration', 'A list of all app features', 'An error code'],
          answer: 0,
          why: 'People need to know why the screen is empty and what to do to fill it.',
        },
      ],
    },
  ],

  // ── dev.design-portfolio ────────────────────────────────────────────────
  'design-portfolio': [
    {
      key: 'design-portfolio',
      title: 'Choosing projects and structuring a case study',
      min: 30,
      sum: 'Hiring managers skim portfolios quickly, so show **2–3 deep case studies** rather than many shallow ones. Choose projects that show the kind of work you want next and real problem-solving, even if they are student or self-initiated projects. Every case study follows the same arc: context, problem, your role, process, solution and outcome.',
      pts: [
        'Quality over quantity: 2–3 strong case studies.',
        'Pick projects that match the roles you apply for.',
        'Self-initiated work counts if the process is real.',
      ],
      learn: [
        'Project choice: work with real users, constraints and decisions, matched to the roles you want',
        'Case study arc: context, problem, role and team, constraints, process, solution, outcome, learnings',
        'Your role: state exactly what you did versus the team; interviewers will ask',
        'Self-initiated projects: redesign a real flow you can research, such as a college portal, with real users',
        'Constraints: time, technology, business rules and accessibility; showing them explains your decisions',
        'Outcome: measured results if you have them; otherwise test findings and what you would measure',
        'Confidentiality: remove client data and anything under NDA, and describe it at a higher level instead',
      ],
      tasks: [
        { key: 'practice-case-outline', kind: 'practice', title: 'Pick your two strongest projects and outline each as a case study using the eight-part arc', minutes: 40 },
      ],
      quiz: [
        {
          q: 'How many case studies should a junior design portfolio usually feature?',
          options: ['One', 'Two or three deep ones', 'Ten or more short ones', 'As many as possible'],
          answer: 1,
          why: 'Reviewers have little time; a few deep case studies show process better than many thin ones.',
        },
        {
          q: 'You have no measured outcome for a student project. What should you show?',
          options: ['Plausible made-up numbers', 'Nothing about the outcome', 'Test findings and how you would measure success', 'Only the final screens'],
          answer: 2,
          why: 'Honest evidence and a measurement plan show judgement; invented numbers destroy trust.',
        },
      ],
    },
    {
      key: 'design-portfolio-writing',
      title: 'Writing case studies that show process and impact',
      min: 35,
      sum: 'A case study is a story about decisions. Open with a short summary a reader can grasp in seconds, then show the messy middle: research insights, alternatives you explored, trade-offs and why you chose the final direction. Use visuals with captions that explain the point, and keep the text scannable with headings and short paragraphs.',
      pts: [
        'Lead with a summary: problem, your role, result.',
        'Show alternatives and why you rejected them.',
        'Every image needs a caption that says what to notice.',
      ],
      learn: [
        'Summary block: one paragraph at the top with the problem, your role, the timeline and the outcome',
        'Research evidence: one or two key insights with a quote, not every sticky note you made',
        'Exploration: early sketches and two or three rejected directions, with the reason for each',
        'Decision points: "We chose X over Y because…" sentences show judgement better than screens alone',
        'Visuals: before and after, flows and annotated screens; captions explain what to look at',
        'Scannable writing: headings, short paragraphs and bold key phrases; aim for about a 5-minute read',
        'Reflection: what you learnt and what you would do differently next time',
      ],
      tasks: [
        { key: 'build-case-study', kind: 'build', title: 'Write a full case study draft for one project with a summary block, three decision points and captioned images', minutes: 60 },
      ],
      quiz: [
        {
          q: 'What best shows design judgement in a case study?',
          options: ['Many polished final screens', 'A long list of tools used', 'Mood boards only', 'Explaining alternatives and why one was chosen'],
          answer: 3,
          why: 'Reviewers hire for decision-making; trade-offs and reasons show it far better than final screens.',
        },
        {
          q: 'What should appear at the very top of a case study?',
          options: ['A short summary of the problem, your role and the outcome', 'Your full CV', 'Every research note', 'A list of the fonts used'],
          answer: 0,
          why: 'A summary lets a busy reviewer understand the project in seconds and decide to read on.',
        },
      ],
    },
    {
      key: 'design-portfolio-presenting',
      title: 'Portfolio site, presentations and design interviews',
      depth: 'standard',
      min: 30,
      sum: 'Your portfolio site is itself a design sample: fast, readable on a phone and easy to navigate. Prepare to present one case study live in about 15–20 minutes, and expect interview rounds such as a portfolio review, a design exercise or whiteboard challenge, and an app critique. Practise telling each story aloud and get feedback from working designers.',
      pts: [
        'The portfolio site must load fast and work well on phones.',
        'Rehearse a 15–20 minute walkthrough of one case study.',
        'In design exercises, ask questions first and narrate your reasoning.',
      ],
      learn: [
        'Site basics: your name and role, 2–3 case study cards on the home page, an about page and contact details',
        'Formats: a website builder, a simple coded site or a PDF; keep a short PDF version for applications',
        'Accessibility: readable text size, alt text for images and good contrast; reviewers notice',
        'Presentation: 15–20 minutes, slides adapted from the case study, with time left for questions',
        'Design exercise: clarify the brief, define users and goals, sketch options, choose and explain trade-offs',
        'App critique: pick a product, state its goal and user, then discuss what works, what fails and why',
        'Feedback loop: get reviews from working designers and peers, and revise before applying widely',
      ],
      tasks: [
        { key: 'practice-portfolio-talk', kind: 'practice', title: 'Record yourself presenting one case study in 15 minutes and list three things to tighten', minutes: 40 },
        { key: 'practice-app-critique', kind: 'practice', title: 'Give a 10-minute spoken critique of a train booking app\'s search flow and write down your main points', minutes: 25, optional: true },
      ],
      quiz: [
        {
          q: 'In a whiteboard design exercise, what should you do first?',
          options: ['Start drawing the final screen', 'Pick a colour palette', 'Ask clarifying questions about users, goals and constraints', 'Ask how the exercise is scored'],
          answer: 2,
          why: 'Interviewers assess how you frame the problem; clarifying first shows structured thinking.',
        },
        {
          q: 'Why does the portfolio site itself matter in design hiring?',
          options: ['Reviewers ignore it', 'Only its domain name matters', 'It must use lots of animation', 'It is a sample of your design skill and attention to detail'],
          answer: 3,
          why: 'A slow or hard-to-read portfolio undermines the case studies inside it.',
        },
      ],
    },
  ],
};
