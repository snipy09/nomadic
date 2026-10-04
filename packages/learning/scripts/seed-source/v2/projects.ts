/**
 * 12 SDE starter projects (Frontend, Backend, Full-stack, DevOps; 3 each).
 * Self-drafted: the owner sent no references, so every project is
 * ai_drafted, status draft, and source_reference names that. Text only,
 * no links; repo checks use simple globs.
 */
import type { ProjectInput } from './projectDefs';
import { project, stage } from './projectDefs';

const SRC = 'Self-drafted for Learn v2 (no owner reference)';

export const PROJECT_DEFS: ProjectInput[] = [
  // ── Frontend ──────────────────────────────────────────────────────────────
  project({
    id: 'fe-portfolio-site',
    title: 'Responsive portfolio site',
    pitch: 'A fast, accessible personal site with your projects, built with plain HTML, CSS and a little JavaScript. Recruiters open it from your resume, so it must load quickly and work on a phone.',
    roles: ['frontend', 'fullstack', 'design'],
    level: 'beginner',
    skills: ['html', 'css', 'css-layout', 'responsive-design', 'accessibility'],
    stacks: ['HTML', 'CSS', 'JavaScript'],
    pre: ['dev.web-foundations'],
    outcome: 'A deployed one-page site with a header, project cards, an about section and a contact form that validates input, scoring well on accessibility checks.',
    source: SRC,
    stages: [
      stage('structure', 'Semantic structure', 'The page has a correct semantic outline that reads well without CSS.', [
        ['Create the repo and index.html', 'Create a repository, add index.html with the doctype, lang attribute, title and meta viewport.', 15],
        ['Add landmarks', 'Add header, nav, main, section and footer elements with one h1 and ordered headings.', 20],
        ['Write the content', 'Add an about paragraph, three project entries with titles and descriptions, and a contact section.', 25],
        ['Check the outline', 'Turn off CSS in the browser and read the page top to bottom; fix anything out of order.', 10],
      ], ['Use one h1 per page and do not skip heading levels.', 'Buttons do things; links go places.'], [
        'The page has header, nav, main and footer landmarks.',
        'Headings go h1, h2, h3 without skipping levels.',
        'Every image has a meaningful alt text or an empty alt if decorative.',
      ], { paths: ['index.html'], readme: [], commits: 1 }, ['Why do landmarks matter for screen reader users?', 'When should an image have an empty alt attribute?'], 'feat: add semantic page structure', ['dev.web-foundations.html']),
      stage('layout', 'Responsive layout', 'The page looks right from 320 px phones to wide desktops.', [
        ['Add a stylesheet and base styles', 'Link styles.css; set box-sizing, a readable font size and line height, and a max content width.', 15],
        ['Lay out project cards with grid', 'Use CSS grid with repeat(auto-fit, minmax(16rem, 1fr)) so cards wrap without media queries.', 25],
        ['Make the nav responsive', 'Use flexbox for the nav; on narrow screens stack the links or wrap them.', 20],
        ['Test on small screens', 'Use the device toolbar at 320, 768 and 1280 px and fix overflow or tiny tap targets.', 15],
      ], ['minmax with auto-fit does most of the responsive work for card grids.', 'Look for horizontal scrolling; it usually means a fixed width somewhere.'], [
        'No horizontal scrolling at 320 px wide.',
        'Project cards wrap into one, two or three columns by width.',
        'Tap targets are at least 44 by 44 px on mobile.',
      ], { paths: ['*.css', 'index.html'], readme: [], commits: 1 }, ['How does auto-fit differ from auto-fill in grid?', 'Why prefer relative units such as rem over px for text?'], 'feat: responsive layout with grid and flexbox', ['dev.web-foundations.css-layout', 'dev.web-foundations.responsive-design']),
      stage('interactivity', 'Theme toggle and contact form', 'Visitors can switch light and dark themes and send a validated message.', [
        ['Add a theme toggle', 'Add a button that toggles a data-theme attribute on the html element and stores the choice.', 20],
        ['Respect the system preference', 'Default to prefers-color-scheme when no choice is stored.', 15],
        ['Validate the contact form', 'Use required, type="email" and a minimum length; show inline error messages linked with aria-describedby.', 25],
        ['Handle submission', 'Prevent the default submit, show a success message, and reset the form.', 15],
      ], ['Use CSS custom properties for colours so the theme switch only changes variables.', 'Connect error text to its input with aria-describedby.'], [
        'The theme toggle works with the keyboard and remembers the choice.',
        'Submitting an invalid email shows an error next to the field.',
        'A valid submission shows a success message without reloading.',
      ], { paths: ['*.js'], readme: [], commits: 1 }, ['How would you avoid a flash of the wrong theme on load?', 'Why are native input types useful for validation?'], 'feat: theme toggle and validated contact form', ['dev.javascript.dom-apis']),
      stage('ship', 'Accessibility pass and deploy', 'The site is public, accessible and documented.', [
        ['Run an accessibility audit', 'Run the browser’s Lighthouse accessibility audit and fix contrast, labels and focus issues.', 20],
        ['Keyboard test', 'Tab through the page; every interactive element must be reachable with a visible focus ring.', 15],
        ['Write the README', 'Add a README with the project summary, features, stack and how to run it locally.', 15],
        ['Deploy', 'Deploy to a free static host and add the live URL to the README and your resume.', 20],
      ], ['Fix colour contrast before anything else; it is the most common failure.'], [
        'The Lighthouse accessibility score is 90 or more.',
        'All features work with the keyboard only.',
        'The README lists features, stack and setup.',
      ], { paths: ['README.md'], readme: ['Features', 'Setup'], commits: 1 }, ['What did the audit find, and how did you fix it?', 'How does a static host serve your site?'], 'docs: add README and deploy', []),
    ],
    readme: ['Features', 'Stack', 'Setup', 'Live demo'],
    deploy: ['Push the repository to GitHub.', 'Connect it to a free static host such as GitHub Pages, Netlify or Vercel.', 'Set the publish directory to the folder with index.html.', 'Open the live URL on a phone and a laptop to check it.'],
    verbs: ['Built', 'Designed', 'Deployed'],
  }),
  project({
    id: 'fe-placement-tracker-ui',
    title: 'Placement tracker UI in React',
    pitch: 'A React app to track job and internship applications with statuses, filters and reminders, saved in the browser. It shows component design, state management and forms.',
    roles: ['frontend', 'fullstack'],
    level: 'intermediate',
    skills: ['react', 'react-state-management', 'typescript', 'frontend-testing'],
    stacks: ['React', 'TypeScript', 'Vite'],
    pre: ['dev.react'],
    outcome: 'A working tracker where you add, edit and delete applications, filter by status, sort by date, and keep data after reload, with tests for the core logic.',
    source: SRC,
    stages: [
      stage('setup', 'Project setup and data model', 'A typed React project with the application model and sample data.', [
        ['Create the app', 'Scaffold a React and TypeScript project with Vite and run it.', 15],
        ['Define the types', 'Define an Application type: id, company, role, status (applied, OA, interview, offer, rejected), applied_on, notes.', 15],
        ['Render a list', 'Render a table of sample applications with one row component.', 25],
        ['Add linting', 'Add a lint script and fix any warnings.', 10],
      ], ['Use a union type for status so typos fail at compile time.'], [
        'The app runs with no TypeScript errors.',
        'Status is a union type, not a free string.',
        'The list renders from typed sample data.',
      ], { paths: ['src/**/*.tsx', 'package.json'], readme: [], commits: 1 }, ['Why model status as a union type?', 'What does Vite do during development?'], 'feat: typed application model and list', ['dev.react.react']),
      stage('crud', 'Add, edit and delete', 'Users can manage applications through a form.', [
        ['Build the form', 'Create a controlled form for a new application with validation for required fields.', 30],
        ['Lift state up', 'Keep the applications array in one parent with add, update and remove handlers.', 20],
        ['Edit in place', 'Open the same form prefilled to edit an application.', 25],
        ['Delete with confirm', 'Add a delete button with a confirmation step.', 10],
      ], ['Use a reducer once you have three or more state updates.', 'Generate ids with crypto.randomUUID.'], [
        'New applications appear in the list immediately.',
        'Editing changes the right row only.',
        'Required fields show an error when empty.',
      ], { paths: ['src/**/*form*', 'src/**/*.tsx'], readme: [], commits: 2 }, ['Controlled versus uncontrolled inputs: which did you use and why?', 'Why keep state in one parent component?'], 'feat: add, edit and delete applications', ['dev.react.react-state-management']),
      stage('filters', 'Filters, sorting and persistence', 'The list can be filtered and sorted, and survives a reload.', [
        ['Filter by status', 'Add status chips that filter the list; derive the visible list instead of storing it.', 20],
        ['Sort by date', 'Sort by applied date ascending or descending.', 15],
        ['Persist to localStorage', 'Save on change and load on start; handle bad or old data safely.', 25],
        ['Empty states', 'Show a helpful message when there are no applications or no matches.', 10],
      ], ['Derived data (filtered and sorted list) should be computed, not stored.', 'Wrap JSON.parse in try/catch.'], [
        'Filters and sorting combine correctly.',
        'Data is still there after a page reload.',
        'Corrupt saved data does not crash the app.',
      ], { paths: ['src/**/*.ts*'], readme: [], commits: 1 }, ['Why compute the filtered list instead of storing it?', 'What can go wrong when reading localStorage?'], 'feat: filters, sorting and local persistence', []),
      stage('tests', 'Tests and polish', 'Core logic is tested and the UI is accessible.', [
        ['Extract pure logic', 'Move filtering, sorting and validation into a pure module.', 20],
        ['Unit tests', 'Write tests for filtering, sorting and validation with Vitest.', 30],
        ['Component test', 'Test that adding an application shows it in the list with Testing Library.', 25],
        ['Keyboard and labels', 'Check labels, focus order and that the form works with the keyboard only.', 15],
      ], ['Pure functions are the easiest code to test; move logic out of components.'], [
        'At least six passing tests.',
        'A component test covers adding an application.',
        'Every form field has a visible label.',
      ], { paths: ['src/**/*.test.ts*'], readme: [], commits: 1 }, ['What did you test, and what did you leave untested?', 'Why test behaviour rather than implementation details?'], 'test: cover tracker logic and the add flow', ['dev.frontend-engineering.frontend-testing']),
      stage('ship', 'README and deploy', 'The app is live with a clear README.', [
        ['Write the README', 'Describe features, stack, setup, scripts and a screenshot you took.', 20],
        ['Production build', 'Run the production build and fix any warnings.', 10],
        ['Deploy', 'Deploy to a free static host and link it in the README.', 20],
      ], ['Use relative asset paths if you deploy under a sub-path.'], [
        'The production build succeeds.',
        'The live app works after a hard reload.',
        'The README has features, stack and setup sections.',
      ], { paths: ['README.md'], readme: ['Features', 'Setup'], commits: 1 }, ['What would you add next, and why?', 'How would you sync this data to a server later?'], 'docs: README and deployment', []),
    ],
    readme: ['Features', 'Stack', 'Setup', 'Scripts', 'Tests'],
    deploy: ['Run the production build locally.', 'Connect the repository to a free static host.', 'Set the build command and output folder.', 'Check the live site on a phone.'],
    verbs: ['Built', 'Designed', 'Tested'],
  }),
  project({
    id: 'fe-analytics-dashboard',
    title: 'Fast analytics dashboard',
    pitch: 'A dashboard that loads a public dataset, shows charts and a sortable table, and stays fast: code splitting, memoisation and virtualised rows. It shows that you care about performance, not only features.',
    roles: ['frontend'],
    level: 'advanced',
    skills: ['react', 'typescript', 'web-performance', 'data-visualization', 'frontend-testing'],
    stacks: ['React', 'TypeScript', 'Vite', 'Chart library'],
    pre: ['dev.react', 'dev.frontend-engineering'],
    outcome: 'A dashboard with filters, two or three charts and a 10,000-row table that scrolls smoothly, with measured performance before and after optimisation.',
    source: SRC,
    stages: [
      stage('data', 'Data loading and types', 'The app loads a public dataset into typed rows with loading and error states.', [
        ['Pick a dataset', 'Choose a public CSV or JSON dataset with at least 10,000 rows and note its licence in the README.', 15],
        ['Parse and type', 'Load and parse it into a typed array; drop or flag invalid rows.', 30],
        ['Loading and error states', 'Show a skeleton while loading and a retry button on failure.', 20],
      ], ['Parse in a web worker if parsing blocks the main thread for long.'], [
        'Rows are typed and invalid rows are counted.',
        'Loading and error states are visible.',
        'The dataset licence is in the README.',
      ], { paths: ['src/**/*.ts*'], readme: [], commits: 1 }, ['How did you handle invalid rows?', 'When would you move parsing to a worker?'], 'feat: load and type the dataset', []),
      stage('charts', 'Filters and charts', 'Users filter the data and see it as charts.', [
        ['Filters', 'Add two or three filters (date range, category) that drive one derived dataset.', 25],
        ['Aggregate', 'Write pure aggregation functions (group by, sum, average) with tests.', 25],
        ['Charts', 'Render a line chart and a bar chart from the aggregates, with titles and axis labels.', 30],
      ], ['Aggregate once per filter change, not on every render.'], [
        'Changing a filter updates every chart consistently.',
        'Aggregation functions have unit tests.',
        'Every chart has a title and labelled axes.',
      ], { paths: ['src/**/*.test.ts*'], readme: [], commits: 1 }, ['How did you avoid recomputing aggregates?', 'Which chart type fits each question, and why?'], 'feat: filters, aggregates and charts', ['dev.data-communication.data-visualization']),
      stage('table', 'Virtualised table', 'A sortable table that scrolls 10,000 rows smoothly.', [
        ['Sortable table', 'Render a table with sortable columns and a stable sort.', 25],
        ['Measure first', 'Record the time to render and scroll with the browser performance panel.', 15],
        ['Virtualise rows', 'Render only visible rows (windowing) and keep row height fixed.', 30],
        ['Measure again', 'Record the same metrics and add both numbers to the README.', 15],
      ], ['Measure before optimising; write the numbers down.'], [
        'Sorting works on every column.',
        'Only visible rows are in the DOM while scrolling.',
        'Before and after measurements are in the README.',
      ], { paths: ['src/**/*table*'], readme: ['Performance'], commits: 1 }, ['How does windowing reduce work?', 'What did your measurements show?'], 'perf: virtualise the table', ['dev.frontend-engineering.web-performance']),
      stage('performance', 'Bundle and render performance', 'The first load is small and interactions stay responsive.', [
        ['Code-split charts', 'Lazy-load the chart library so the first screen loads faster.', 20],
        ['Memoise', 'Memoise expensive derived values and stable callbacks where profiling shows re-renders.', 25],
        ['Lighthouse', 'Run Lighthouse on the production build and fix the top two issues.', 20],
      ], ['Profile with React DevTools before adding memo everywhere.'], [
        'The chart library is in a separate chunk.',
        'The Lighthouse performance score is recorded in the README.',
        'Filtering does not freeze the UI.',
      ], { paths: ['README.md'], readme: ['Performance'], commits: 1 }, ['When does memoisation hurt?', 'What did code splitting change in the bundle?'], 'perf: code-split charts and memoise', []),
      stage('ship', 'Tests, README and deploy', 'The dashboard is tested, documented and live.', [
        ['Component tests', 'Test that filters change the table and charts with Testing Library.', 25],
        ['README', 'Document features, stack, dataset source, performance numbers and setup.', 20],
        ['Deploy', 'Deploy the production build to a free static host.', 15],
      ], ['Mock the dataset in tests with a small fixture.'], [
        'Tests cover filtering end to end.',
        'The README has features, performance and setup sections.',
        'The live app loads the dataset.',
      ], { paths: ['README.md', 'src/**/*.test.ts*'], readme: ['Features', 'Setup'], commits: 1 }, ['What would you do with 1 million rows?', 'How would you add server-side filtering?'], 'docs: README and deploy', []),
    ],
    readme: ['Features', 'Stack', 'Dataset', 'Performance', 'Setup'],
    deploy: ['Build for production.', 'Deploy to a free static host.', 'Host the dataset with the app or load it from its public source.', 'Re-run Lighthouse on the live URL.'],
    verbs: ['Built', 'Optimised', 'Measured'],
  }),
  // ── Backend ───────────────────────────────────────────────────────────────
  project({
    id: 'be-notes-api',
    title: 'Notes REST API',
    pitch: 'A small REST API for notes with validation, a SQLite database and tests. It is the simplest complete backend: routes, data, errors and documentation.',
    roles: ['backend', 'fullstack'],
    level: 'beginner',
    skills: ['nodejs', 'rest-api-design', 'sql', 'testing-fundamentals'],
    stacks: ['Node.js', 'Express', 'SQLite'],
    pre: ['dev.backend-core'],
    outcome: 'An API with create, read, update and delete for notes, input validation, proper status codes, tests and a README listing every route.',
    source: SRC,
    stages: [
      stage('setup', 'Server setup', 'A Node server answers a health check.', [
        ['Initialise the project', 'Create the project, add Express and a start script, and commit.', 15],
        ['Health route', 'Add GET /health that returns { "status": "ok" } with 200.', 10],
        ['Configuration', 'Read the port from an environment variable with a default.', 10],
        ['Error handler', 'Add a JSON error handler and a 404 handler for unknown routes.', 20],
      ], ['Keep secrets and ports in environment variables, never in code.'], [
        'GET /health returns 200 with JSON.',
        'Unknown routes return 404 JSON.',
        'The port comes from the environment.',
      ], { paths: ['package.json', 'src/**/*.js'], readme: [], commits: 1 }, ['Why add a health check route?', 'What does middleware order change in Express?'], 'feat: server with health check', ['dev.backend-core.nodejs']),
      stage('crud', 'Notes CRUD with SQLite', 'Notes are stored in SQLite and managed through REST routes.', [
        ['Schema', 'Create a notes table: id, title, body, created_at, updated_at.', 15],
        ['List and create', 'Implement GET /notes and POST /notes.', 25],
        ['Read, update, delete', 'Implement GET, PATCH and DELETE on /notes/:id.', 25],
        ['Status codes', 'Return 201 on create, 404 for unknown ids and 204 on delete.', 10],
      ], ['Use parameterised queries; never build SQL from strings.', 'Return 404, not 500, when an id does not exist.'], [
        'All five routes work as specified.',
        'Unknown ids return 404.',
        'All SQL uses parameters.',
      ], { paths: ['src/**/*note*'], readme: [], commits: 2 }, ['Why use parameterised queries?', 'PUT versus PATCH: which did you use and why?'], 'feat: notes CRUD with SQLite', ['dev.backend-core.rest-api-design', 'dev.databases.sql']),
      stage('validation', 'Validation and pagination', 'Bad input is rejected and lists are paginated.', [
        ['Validate input', 'Validate title (required, max length) and body with a schema library; return 400 with details.', 25],
        ['Paginate', 'Add limit and offset (or a cursor) to GET /notes with sensible caps.', 20],
        ['Search', 'Add a ?q= filter on the title.', 15],
      ], ['Validate at the edge, before touching the database.'], [
        'Invalid bodies return 400 with a message.',
        'GET /notes caps the page size.',
        'Search returns only matching notes.',
      ], { paths: ['src/**/*.js'], readme: [], commits: 1 }, ['Offset versus cursor pagination: trade-offs?', 'Where should validation live?'], 'feat: validation, pagination and search', []),
      stage('tests', 'Tests and docs', 'Every route is tested and documented.', [
        ['Test setup', 'Use an in-memory database for tests.', 15],
        ['Route tests', 'Write one test per route plus the 400 and 404 cases.', 30],
        ['README', 'Document routes, request and response shapes, and setup.', 20],
      ], ['Reset the database before each test so tests do not depend on each other.'], [
        'All tests pass from a clean checkout.',
        'Each route has a test.',
        'The README lists every route.',
      ], { paths: ['test/**', 'README.md'], readme: ['API', 'Setup'], commits: 1 }, ['How did you isolate tests from each other?', 'What would you monitor in production?'], 'test: route tests and API docs', []),
    ],
    readme: ['Features', 'API', 'Setup', 'Tests'],
    deploy: ['Add a start script and read the port from the environment.', 'Deploy to a free Node host such as Render or Railway.', 'Use a persistent disk or switch to a hosted database for production data.', 'Call /health on the live URL.'],
    verbs: ['Built', 'Designed', 'Tested'],
  }),
  project({
    id: 'be-placement-api',
    title: 'Placement tracker API with auth',
    pitch: 'A multi-user API where each student tracks their applications: sign-up and login with hashed passwords, JWT auth, PostgreSQL, pagination, tests and Docker. This is the shape of most real backend work.',
    roles: ['backend', 'fullstack'],
    level: 'intermediate',
    skills: ['nodejs', 'authentication', 'postgresql', 'rest-api-design', 'docker', 'testing-fundamentals'],
    stacks: ['Node.js', 'Express', 'PostgreSQL', 'Docker'],
    pre: ['dev.backend-core', 'dev.databases'],
    outcome: 'An authenticated API where users see only their own applications, with migrations, tests, and a docker-compose setup that starts the API and the database.',
    source: SRC,
    stages: [
      stage('db', 'PostgreSQL and migrations', 'The API connects to PostgreSQL with versioned migrations.', [
        ['Run PostgreSQL', 'Run PostgreSQL locally or in Docker and connect with a pool.', 20],
        ['Migrations', 'Add a migration tool and create users and applications tables with a foreign key.', 25],
        ['Seed script', 'Add a seed script with two users and sample applications.', 15],
      ], ['Never edit an applied migration; add a new one.'], [
        'Migrations create both tables from scratch.',
        'applications.user_id references users.id.',
        'The seed script runs twice without errors.',
      ], { paths: ['migrations/**', 'src/**/*db*'], readme: [], commits: 1 }, ['Why version database changes?', 'What does ON DELETE CASCADE do?'], 'feat: PostgreSQL with migrations', ['dev.databases.postgresql']),
      stage('auth', 'Sign-up, login and JWT', 'Users sign up and log in; protected routes need a valid token.', [
        ['Sign-up', 'POST /auth/signup hashes the password with bcrypt and rejects duplicate emails.', 25],
        ['Login', 'POST /auth/login checks the hash and returns a short-lived JWT.', 20],
        ['Auth middleware', 'Verify the token on protected routes and attach the user id.', 20],
        ['Generic errors', 'Return the same error for an unknown email and a wrong password.', 10],
      ], ['Never store plain passwords.', 'Keep the JWT secret in an environment variable.'], [
        'Passwords are stored as bcrypt hashes.',
        'Protected routes return 401 without a valid token.',
        'Login errors do not reveal whether the email exists.',
      ], { paths: ['src/**/*auth*'], readme: [], commits: 2 }, ['Why use a slow hash such as bcrypt?', 'What are the risks of long-lived JWTs?'], 'feat: sign-up, login and JWT auth', ['dev.backend-core.authentication']),
      stage('applications', 'Applications CRUD per user', 'Each user manages only their own applications.', [
        ['Model', 'Application: company, role, status enum, applied_on, notes.', 15],
        ['Routes', 'GET and POST /applications, GET, PATCH and DELETE /applications/:id, all scoped to the user.', 30],
        ['Validation', 'Validate bodies and reject unknown statuses with 400.', 15],
        ['Pagination and filters', 'Filter by status and paginate the list.', 20],
      ], ['Put user_id in every WHERE clause, so a guessed id cannot reach another user’s data.'], [
        'A user cannot read or change another user’s application (404).',
        'An invalid status returns 400.',
        'The list supports status filters and pagination.',
      ], { paths: ['src/**/*application*'], readme: [], commits: 2 }, ['How do you prevent one user reading another’s rows?', 'Why return 404 instead of 403 for other users’ ids?'], 'feat: per-user applications CRUD', []),
      stage('tests', 'Integration tests', 'The main flows are covered by tests against a real database.', [
        ['Test database', 'Run tests against a separate database that migrations reset.', 20],
        ['Auth tests', 'Test sign-up, login, a bad password and a missing token.', 25],
        ['Ownership tests', 'Test that user B cannot see user A’s application.', 20],
      ], ['Test the security rule you care most about first: ownership.'], [
        'Tests run against a fresh database.',
        'Ownership is tested.',
        'All tests pass in CI or locally from a clean checkout.',
      ], { paths: ['test/**'], readme: [], commits: 1 }, ['What is the difference between unit and integration tests here?', 'Which bug would worry you most in production?'], 'test: auth and ownership integration tests', []),
      stage('docker', 'Docker and docs', 'One command starts the API and database; the README explains everything.', [
        ['Dockerfile', 'Write a Dockerfile for the API with a small base image and no dev dependencies.', 20],
        ['Compose', 'Add docker-compose with the API and PostgreSQL, using environment variables.', 20],
        ['README', 'Document routes, auth flow, environment variables and setup.', 20],
      ], ['Use a .dockerignore so node_modules and secrets stay out of the image.'], [
        'docker compose up starts the API and database.',
        'No secret is committed to the repository.',
        'The README documents every route and variable.',
      ], { paths: ['Dockerfile', 'docker-compose*', 'README.md'], readme: ['API', 'Setup'], commits: 1 }, ['What goes into a production Docker image, and what stays out?', 'How would you rotate the JWT secret?'], 'chore: Docker setup and docs', ['dev.containers-ci.docker']),
    ],
    readme: ['Features', 'API', 'Auth', 'Environment variables', 'Setup', 'Tests'],
    deploy: ['Create a free hosted PostgreSQL database.', 'Deploy the API container or Node app to a free host.', 'Set DATABASE_URL and JWT_SECRET as environment variables.', 'Run migrations on deploy and call /health.'],
    verbs: ['Built', 'Secured', 'Containerised'],
  }),
  project({
    id: 'be-url-shortener',
    title: 'URL shortener with caching and rate limits',
    pitch: 'A production-style URL shortener: short code generation, redirects served from a Redis cache, per-IP rate limiting and click analytics written asynchronously. It turns system design interview topics into working code.',
    roles: ['backend'],
    level: 'advanced',
    skills: ['caching', 'message-queues', 'postgresql', 'rest-api-design', 'system-design'],
    stacks: ['Node.js', 'PostgreSQL', 'Redis', 'Docker'],
    pre: ['dev.backend-scale'],
    outcome: 'A shortener that redirects from cache, survives cache restarts, limits abusive clients, and records clicks without slowing redirects, with a load-test result in the README.',
    source: SRC,
    stages: [
      stage('core', 'Short codes and redirects', 'Long URLs get short codes and redirect correctly.', [
        ['Schema', 'Create a links table with a unique code, the target URL and created_at.', 15],
        ['Code generation', 'Generate base62 codes from an id or random bytes; handle collisions.', 25],
        ['Create and redirect', 'POST /links validates the URL; GET /:code returns a 301 or 302 redirect.', 25],
      ], ['Validate that targets are http or https URLs to avoid open redirect abuse with other schemes.'], [
        'Codes are unique and URL-safe.',
        'GET /:code redirects to the stored URL.',
        'Unknown codes return 404.',
      ], { paths: ['src/**/*.ts', 'src/**/*.js'], readme: [], commits: 1 }, ['301 versus 302: which did you choose and why?', 'How likely are collisions with your scheme?'], 'feat: short codes and redirects', []),
      stage('cache', 'Redis cache-aside', 'Hot redirects are served from Redis.', [
        ['Add Redis', 'Run Redis in Docker and connect to it.', 15],
        ['Cache-aside', 'On redirect, read the cache; on a miss, read the database and fill the cache with a TTL.', 25],
        ['Fail open', 'If Redis is down, fall back to the database instead of failing.', 20],
      ], ['Cache misses must still work when Redis is unavailable.'], [
        'A second redirect for a code is served from the cache.',
        'Stopping Redis does not break redirects.',
        'Cache entries expire after the TTL.',
      ], { paths: ['src/**/*cache*'], readme: [], commits: 1 }, ['What happens on a cache stampede, and how would you prevent it?', 'Why fail open here?'], 'feat: Redis cache-aside for redirects', ['dev.backend-scale.caching']),
      stage('rate-limit', 'Rate limiting', 'Clients that create too many links are slowed down.', [
        ['Token bucket', 'Implement a per-IP token bucket in Redis for POST /links.', 30],
        ['Headers', 'Return 429 with Retry-After when the limit is hit.', 15],
        ['Tests', 'Test that the limit triggers and resets.', 20],
      ], ['Use an atomic Redis operation or a short Lua script to avoid races.'], [
        'Too many requests return 429 with Retry-After.',
        'The limit resets over time.',
        'Rate-limit logic has tests.',
      ], { paths: ['src/**/*limit*'], readme: [], commits: 1 }, ['Token bucket versus fixed window: trade-offs?', 'Where should the rate limiter run in a larger system?'], 'feat: token bucket rate limiting', []),
      stage('analytics', 'Asynchronous click analytics', 'Clicks are recorded without slowing redirects.', [
        ['Queue clicks', 'Push a click event to a Redis list or stream on each redirect.', 20],
        ['Worker', 'Run a worker that reads events in batches and writes counts to PostgreSQL.', 30],
        ['Stats route', 'GET /links/:code/stats returns total and daily clicks.', 20],
      ], ['Batch inserts reduce database load.'], [
        'Redirect time does not include the database write.',
        'The worker writes click counts in batches.',
        'The stats route returns correct totals.',
      ], { paths: ['src/**/*worker*'], readme: [], commits: 1 }, ['What happens to clicks if the worker crashes?', 'How would you make counts exactly-once?'], 'feat: async click analytics', ['dev.backend-scale.message-queues']),
      stage('ship', 'Load test and docs', 'Performance is measured and the design is documented.', [
        ['Load test', 'Load-test redirects with a load testing tool and record requests per second and p95 latency.', 25],
        ['Design doc', 'Write a README section with a diagram description, data flow and trade-offs.', 25],
        ['Compose', 'docker compose starts the API, worker, PostgreSQL and Redis.', 15],
      ], ['Run the load test against a production build, not dev mode.'], [
        'Load-test numbers are in the README.',
        'The README explains the design and trade-offs.',
        'One command starts every service.',
      ], { paths: ['README.md', 'docker-compose*'], readme: ['Design', 'Setup'], commits: 1 }, ['Where is the bottleneck now?', 'How would you scale to 10 times the traffic?'], 'docs: load test results and design', []),
    ],
    readme: ['Features', 'Design', 'API', 'Performance', 'Setup'],
    deploy: ['Provision a hosted PostgreSQL and a hosted Redis on free tiers.', 'Deploy the API and worker as two services.', 'Set connection strings as environment variables.', 'Create a link and open it from the live URL.'],
    verbs: ['Built', 'Scaled', 'Load-tested'],
  }),
  // ── Full-stack ────────────────────────────────────────────────────────────
  project({
    id: 'fs-expense-splitter',
    title: 'Hostel expense splitter',
    pitch: 'A small full-stack app for friends to record shared expenses and see who owes whom, with a simple settle-up suggestion. It connects a React front end to a small API.',
    roles: ['fullstack', 'frontend', 'backend'],
    level: 'beginner',
    skills: ['javascript', 'react', 'nodejs', 'rest-api-design'],
    stacks: ['React', 'Node.js', 'Express', 'SQLite'],
    pre: ['dev.javascript'],
    outcome: 'A group page where members add expenses, see balances and get a short list of payments that settles everything.',
    source: SRC,
    stages: [
      stage('api', 'Groups and expenses API', 'An API stores groups, members and expenses.', [
        ['Data model', 'Tables for groups, members and expenses (payer, amount in paise, split between members).', 20],
        ['Routes', 'Create a group, add members, add and list expenses.', 30],
        ['Validation', 'Reject negative amounts and members outside the group.', 15],
      ], ['Store money as integers (paise) to avoid floating-point errors.'], [
        'Amounts are stored as integers.',
        'Expenses can only involve group members.',
        'Routes return clear JSON errors.',
      ], { paths: ['server/**', 'api/**'], readme: [], commits: 1 }, ['Why store money as integers?', 'How did you model an expense split?'], 'feat: groups and expenses API', ['dev.backend-core.rest-api-design']),
      stage('balances', 'Balances and settle-up', 'The app computes balances and a short list of payments.', [
        ['Balances', 'Compute each member’s net balance from all expenses.', 20],
        ['Settle-up', 'Greedily match the largest debtor with the largest creditor to suggest payments.', 25],
        ['Tests', 'Unit-test balances and settle-up with three or four cases.', 25],
      ], ['Net balances always sum to zero; assert it in tests.'], [
        'Balances sum to zero.',
        'Settle-up payments clear every balance.',
        'Balance logic has unit tests.',
      ], { paths: ['**/*.test.*'], readme: [], commits: 1 }, ['Is the greedy settle-up always minimal?', 'How did you handle uneven splits?'], 'feat: balances and settle-up', []),
      stage('ui', 'React front end', 'Friends use a simple page to add expenses and see balances.', [
        ['Group page', 'Show members, expenses and balances fetched from the API.', 30],
        ['Add expense form', 'A form with payer, amount and who shares it.', 25],
        ['Loading and errors', 'Show loading states and API errors clearly.', 15],
      ], ['Fetch in one place and pass data down as props.'], [
        'Adding an expense updates the balances without a reload.',
        'API errors are shown to the user.',
        'The form works with the keyboard.',
      ], { paths: ['client/**', 'src/**/*.jsx', 'src/**/*.tsx'], readme: [], commits: 2 }, ['How does the front end talk to the API?', 'What did you do about CORS?'], 'feat: React group page', ['dev.react.react']),
      stage('ship', 'README and deploy', 'The app is documented and deployed.', [
        ['README', 'Document features, stack, API routes and setup.', 20],
        ['Deploy', 'Deploy the API and the front end to free hosts and set the API URL.', 25],
        ['Smoke test', 'Create a group, add two expenses and check the balances on the live site.', 10],
      ], ['Use an environment variable for the API base URL.'], [
        'Both parts are deployed and connected.',
        'The README lists features, API and setup.',
        'No secrets are committed.',
      ], { paths: ['README.md'], readme: ['Features', 'Setup'], commits: 1 }, ['What would you change for 1,000 groups?', 'How would you add authentication?'], 'docs: README and deploy', []),
    ],
    readme: ['Features', 'Stack', 'API', 'Setup'],
    deploy: ['Deploy the API to a free Node host.', 'Deploy the React build to a free static host.', 'Set the API base URL as a build-time variable.', 'Test adding an expense on the live site.'],
    verbs: ['Built', 'Designed', 'Deployed'],
  }),
  project({
    id: 'fs-campus-events',
    title: 'Campus events board',
    pitch: 'A full-stack events board for a college: clubs post events, students RSVP, and everyone sees what is on this week. It covers auth, roles, a relational database and deployment.',
    roles: ['fullstack'],
    level: 'intermediate',
    skills: ['react', 'nodejs', 'postgresql', 'authentication', 'fullstack-architecture'],
    stacks: ['React', 'Node.js', 'PostgreSQL'],
    pre: ['dev.react', 'dev.databases'],
    outcome: 'A deployed app where club admins create events, students RSVP with a seat limit, and the home page lists upcoming events with filters.',
    source: SRC,
    stages: [
      stage('schema', 'Schema and API skeleton', 'Users, clubs, events and RSVPs are modelled in PostgreSQL.', [
        ['Schema', 'Tables for users (role student or club_admin), clubs, events (capacity, starts_at) and rsvps.', 25],
        ['API skeleton', 'Set up the API with health check, error handler and database pool.', 20],
        ['Seed data', 'Seed two clubs, an admin and a few events.', 15],
      ], ['A unique (event_id, user_id) constraint stops double RSVPs.'], [
        'Tables have primary and foreign keys.',
        'RSVPs are unique per user and event.',
        'The API starts and connects to the database.',
      ], { paths: ['migrations/**', 'server/**'], readme: [], commits: 1 }, ['Which constraints did you put in the database, and why there?', 'How do you store event times?'], 'feat: schema and API skeleton', ['dev.databases.database-design']),
      stage('auth', 'Auth and roles', 'Students and club admins sign in; only admins manage events.', [
        ['Sign-up and login', 'Implement sign-up and login with hashed passwords and sessions or JWTs.', 30],
        ['Role checks', 'Only club admins can create or edit events of their club.', 20],
        ['Front-end auth', 'Login page, logged-in state and logout.', 25],
      ], ['Check roles on the server; hiding a button is not security.'], [
        'Students get 403 when they try to create an event.',
        'Passwords are hashed.',
        'Logout clears the session on the client and server.',
      ], { paths: ['server/**/*auth*', 'client/**'], readme: [], commits: 2 }, ['Why must role checks run on the server?', 'Sessions versus JWTs: what did you pick and why?'], 'feat: auth and club admin role', ['dev.backend-core.authentication']),
      stage('events', 'Events and RSVPs', 'Admins post events; students RSVP within capacity.', [
        ['Event CRUD', 'Admins create, edit and cancel events.', 25],
        ['RSVP with capacity', 'RSVP in a transaction that checks the seat count, so two students cannot take the last seat.', 30],
        ['Event list', 'Home page lists upcoming events with club and date filters.', 25],
      ], ['Use a transaction with a row lock or a conditional insert for the capacity check.'], [
        'An event never has more RSVPs than its capacity.',
        'Cancelled events are hidden from the list.',
        'Filters by club and date work together.',
      ], { paths: ['server/**/*event*', 'client/**'], readme: [], commits: 2 }, ['How did you prevent overbooking under concurrency?', 'How would you add a waitlist?'], 'feat: events and capacity-safe RSVPs', []),
      stage('quality', 'Tests and accessibility', 'Key flows are tested and the UI is accessible.', [
        ['API tests', 'Test auth, role checks and the capacity rule.', 30],
        ['UI checks', 'Keyboard-only pass and labelled form fields.', 15],
        ['Error states', 'Every page has loading, empty and error states.', 15],
      ], ['Write the capacity test with two RSVPs racing for the last seat.'], [
        'The capacity rule has a test.',
        'All pages work with the keyboard.',
        'Empty and error states are shown.',
      ], { paths: ['**/*.test.*'], readme: [], commits: 1 }, ['How did you test the race condition?', 'What did the keyboard pass reveal?'], 'test: auth, roles and capacity', []),
      stage('ship', 'Deploy and document', 'The board is live with a README.', [
        ['Deploy', 'Deploy the database, API and front end on free tiers with environment variables.', 30],
        ['README', 'Document features, roles, architecture, setup and the live URL.', 20],
        ['Smoke test', 'Sign up as a student, RSVP to an event and confirm the seat count on the live site.', 10],
      ], ['Run migrations as part of deployment.'], [
        'The live app supports sign-up, events and RSVPs.',
        'The README explains roles and setup.',
        'No secrets are in the repository.',
      ], { paths: ['README.md'], readme: ['Features', 'Architecture', 'Setup'], commits: 1 }, ['What would break first with 5,000 students?', 'How would you send reminders?'], 'docs: deploy and README', []),
    ],
    readme: ['Features', 'Roles', 'Architecture', 'Setup', 'Tests'],
    deploy: ['Create a hosted PostgreSQL database.', 'Deploy the API with DATABASE_URL and session or JWT secrets set.', 'Deploy the front end with the API URL.', 'Run migrations and create one admin account.'],
    verbs: ['Built', 'Designed', 'Shipped'],
  }),
  project({
    id: 'fs-realtime-chat',
    title: 'Real-time study group chat',
    pitch: 'A chat app for study groups with rooms, live messages over WebSockets, presence, message history and unread counts. It shows real-time systems, state sync and scaling thinking.',
    roles: ['fullstack', 'backend'],
    level: 'advanced',
    skills: ['nodejs', 'react', 'postgresql', 'caching', 'fullstack-architecture'],
    stacks: ['React', 'Node.js', 'WebSockets', 'PostgreSQL', 'Redis'],
    pre: ['dev.react', 'dev.backend-scale'],
    outcome: 'A deployed chat where messages appear instantly for everyone in a room, history loads in pages, presence shows who is online, and two server instances stay in sync through Redis pub/sub.',
    source: SRC,
    stages: [
      stage('rooms', 'Rooms and message history', 'Users join rooms and read paginated history.', [
        ['Schema', 'Tables for users, rooms, memberships and messages with an index on (room_id, created_at).', 20],
        ['REST routes', 'Create and join rooms; list messages with cursor pagination.', 25],
        ['Auth', 'Reuse a simple login so every message has an author.', 20],
      ], ['Cursor pagination by (created_at, id) stays correct while new messages arrive.'], [
        'History loads newest first, page by page.',
        'Only members can read a room.',
        'Messages store author and time.',
      ], { paths: ['server/**', 'migrations/**'], readme: [], commits: 1 }, ['Why cursor pagination for chat history?', 'Which index supports your history query?'], 'feat: rooms and paginated history', []),
      stage('realtime', 'Live messages over WebSockets', 'Messages appear instantly for everyone in a room.', [
        ['WebSocket server', 'Accept authenticated WebSocket connections.', 25],
        ['Join and broadcast', 'Clients join room channels; saved messages are broadcast to the room.', 25],
        ['Client', 'React chat view that appends live messages and scrolls sensibly.', 30],
      ], ['Save the message first, then broadcast the saved row with its id.'], [
        'Two browsers see each other’s messages instantly.',
        'Messages are saved before they are broadcast.',
        'Unauthenticated sockets are rejected.',
      ], { paths: ['server/**/*socket*', 'client/**'], readme: [], commits: 2 }, ['Why broadcast the saved row rather than the client’s payload?', 'How do you authenticate a WebSocket?'], 'feat: live messages over WebSockets', []),
      stage('presence', 'Presence, typing and unread counts', 'Users see who is online and how many messages they missed.', [
        ['Presence', 'Track online users per room with heartbeats and timeouts.', 25],
        ['Typing indicator', 'Send throttled typing events.', 15],
        ['Unread counts', 'Store the last read message per user and room; show unread badges.', 25],
      ], ['Throttle typing events so one keystroke does not mean one message.'], [
        'Closing a tab removes the user from presence within a minute.',
        'Unread counts are correct after a reload.',
        'Typing events are throttled.',
      ], { paths: ['server/**', 'client/**'], readme: [], commits: 1 }, ['How did you detect that a user went offline?', 'Where is the unread count computed?'], 'feat: presence, typing and unread counts', []),
      stage('scale', 'Two instances with Redis pub/sub', 'Messages reach users connected to a different server instance.', [
        ['Pub/sub', 'Publish saved messages to Redis and have every instance relay them to its sockets.', 30],
        ['Run two instances', 'Run two server instances behind a simple proxy and test across them.', 20],
        ['Reconnect', 'On reconnect, the client fetches messages it missed since its last id.', 20],
      ], ['Sticky sessions help WebSockets but pub/sub is what keeps instances in sync.'], [
        'Users on different instances chat normally.',
        'Reconnecting clients catch up on missed messages.',
        'No message is shown twice.',
      ], { paths: ['server/**/*redis*', 'server/**/*pubsub*'], readme: [], commits: 1 }, ['Why are WebSockets harder to scale than REST?', 'How do you avoid duplicate messages after a reconnect?'], 'feat: multi-instance sync with Redis pub/sub', ['dev.backend-scale.message-queues']),
      stage('ship', 'Tests, docs and deploy', 'The chat is tested, documented and live.', [
        ['Tests', 'Test history pagination and the broadcast path with two test clients.', 30],
        ['README', 'Describe the architecture, message flow and scaling approach.', 20],
        ['Deploy', 'Deploy the server, database, Redis and front end on free tiers.', 25],
      ], ['Document the message flow step by step; interviewers will ask.'], [
        'Tests cover pagination and broadcast.',
        'The README explains the architecture.',
        'The live app works in two browsers.',
      ], { paths: ['README.md', '**/*.test.*'], readme: ['Architecture', 'Setup'], commits: 1 }, ['What happens to a message if Redis is down?', 'How would you add end-to-end encryption?'], 'docs: architecture and deploy', []),
    ],
    readme: ['Features', 'Architecture', 'Message flow', 'Setup', 'Tests'],
    deploy: ['Provision hosted PostgreSQL and Redis.', 'Deploy the WebSocket server to a host that supports long-lived connections.', 'Deploy the front end with the API and socket URLs.', 'Open the app in two browsers and chat.'],
    verbs: ['Built', 'Scaled', 'Designed'],
  }),
  // ── DevOps ────────────────────────────────────────────────────────────────
  project({
    id: 'do-dockerise-app',
    title: 'Containerise a web app',
    pitch: 'Take a small web app with a database and make it run anywhere with Docker: a lean image, docker compose, health checks and persistent data. Every DevOps interview starts here.',
    roles: ['devops', 'backend'],
    level: 'beginner',
    skills: ['docker', 'linux', 'bash-scripting'],
    stacks: ['Docker', 'Docker Compose', 'PostgreSQL'],
    pre: ['dev.linux-networking'],
    outcome: 'A repository where docker compose up starts the app and its database with health checks, persistent volumes and a small production image.',
    source: SRC,
    stages: [
      stage('image', 'A first Dockerfile', 'The app runs in a container.', [
        ['Pick an app', 'Use your own small web app or write a minimal one with a health route.', 20],
        ['Dockerfile', 'Write a Dockerfile: base image, copy files, install dependencies, expose the port, start command.', 25],
        ['.dockerignore', 'Exclude dependencies, git data and local env files.', 10],
      ], ['Copy dependency files and install before copying the rest, so the install layer is cached.'], [
        'docker build succeeds from a clean checkout.',
        'The container answers its health route.',
        'A .dockerignore keeps secrets and dependencies out.',
      ], { paths: ['Dockerfile', '.dockerignore'], readme: [], commits: 1 }, ['How does layer caching speed up builds?', 'What is the difference between an image and a container?'], 'feat: Dockerfile for the app', ['dev.containers-ci.docker']),
      stage('lean', 'A lean, safe image', 'The image is small and does not run as root.', [
        ['Multi-stage build', 'Build in one stage and copy only the output into a slim runtime stage.', 25],
        ['Non-root user', 'Create and switch to an unprivileged user.', 15],
        ['Measure', 'Compare image sizes before and after and note them in the README.', 10],
      ], ['Alpine or slim base images cut size; check that your runtime works on them.'], [
        'The final image uses a multi-stage build.',
        'The container runs as a non-root user.',
        'Image sizes before and after are in the README.',
      ], { paths: ['Dockerfile', 'README.md'], readme: [], commits: 1 }, ['Why avoid running containers as root?', 'What did the multi-stage build remove?'], 'perf: multi-stage, non-root image', []),
      stage('compose', 'Compose with a database', 'One command starts the app and PostgreSQL with persistent data.', [
        ['Compose file', 'Define app and db services, a network and a named volume for the data.', 25],
        ['Health checks', 'Add a database health check and make the app wait for it.', 20],
        ['Configuration', 'Pass settings with an env file that is not committed; commit an example file.', 15],
      ], ['depends_on with condition: service_healthy waits for a healthy database.'], [
        'docker compose up starts both services.',
        'Data survives docker compose down and up.',
        'Real env files are not committed; an example is.',
      ], { paths: ['docker-compose*', '.env.example'], readme: [], commits: 1 }, ['What does a named volume do?', 'How do containers on one compose network find each other?'], 'feat: compose with PostgreSQL and health checks', []),
      stage('ship', 'Scripts and README', 'Anyone can run, back up and reset the stack.', [
        ['Helper scripts', 'Add shell scripts to back up and restore the database.', 25],
        ['README', 'Document commands, ports, variables and troubleshooting.', 20],
        ['Fresh-machine test', 'Clone the repository into a new folder and follow only the README to start the stack.', 15],
      ], ['Use set -euo pipefail at the top of bash scripts.'], [
        'Backup and restore scripts work.',
        'The README covers commands, variables and troubleshooting.',
        'Scripts stop on the first error.',
      ], { paths: ['scripts/**', 'README.md'], readme: ['Setup', 'Commands'], commits: 1 }, ['How would you run this on a server?', 'What would you monitor first?'], 'docs: scripts and README', ['dev.linux-networking.bash-scripting']),
    ],
    readme: ['Overview', 'Setup', 'Commands', 'Environment variables', 'Troubleshooting'],
    deploy: ['Install Docker on a small VM or use a container host.', 'Copy the compose file and env file to the server.', 'Run docker compose up -d.', 'Check the health route from outside.'],
    verbs: ['Containerised', 'Automated', 'Documented'],
  }),
  project({
    id: 'do-ci-pipeline',
    title: 'CI/CD pipeline for a web app',
    pitch: 'A pipeline that tests every pull request, builds and scans a Docker image, publishes it and deploys the main branch automatically. It shows you can ship safely and often.',
    roles: ['devops', 'backend', 'fullstack'],
    level: 'intermediate',
    skills: ['ci-cd', 'docker', 'git', 'devsecops'],
    stacks: ['GitHub Actions', 'Docker', 'Container registry'],
    pre: ['dev.containers-ci'],
    outcome: 'A repository where pull requests run lint and tests, the main branch builds, scans and publishes an image, and a deploy job updates the live app, with a status badge in the README.',
    source: SRC,
    stages: [
      stage('ci', 'Continuous integration', 'Every push and pull request runs lint and tests.', [
        ['Workflow', 'Add a workflow triggered on push and pull request.', 20],
        ['Steps', 'Check out, set up the runtime, install with a lockfile, lint and test.', 20],
        ['Caching', 'Cache dependencies to speed up runs.', 15],
        ['Branch protection', 'Require the check to pass before merging.', 10],
      ], ['Install with the lockfile (npm ci or equivalent) for repeatable builds.'], [
        'Pull requests show a passing or failing check.',
        'Dependency caching is enabled.',
        'Merging needs a green check.',
      ], { paths: ['.github/workflows/*.yml'], readme: [], commits: 1 }, ['Why use the lockfile in CI?', 'What does branch protection prevent?'], 'ci: lint and test on every push', ['dev.containers-ci.ci-cd']),
      stage('build', 'Build, scan and publish an image', 'The main branch publishes a scanned image tagged with the commit.', [
        ['Build job', 'Build the Docker image on the main branch.', 20],
        ['Scan', 'Scan the image for known vulnerabilities and fail on critical findings.', 20],
        ['Publish', 'Push to a container registry tagged with the commit SHA.', 20],
      ], ['Tag with the commit SHA so every deploy is traceable.'], [
        'Images are tagged with the commit SHA.',
        'Critical vulnerabilities fail the job.',
        'Registry credentials come from repository secrets.',
      ], { paths: ['.github/workflows/*.yml', 'Dockerfile'], readme: [], commits: 1 }, ['Why not deploy the latest tag?', 'Where do pipeline secrets live?'], 'ci: build, scan and publish image', ['dev.cloud-ops.devsecops']),
      stage('deploy', 'Continuous deployment', 'A green main branch deploys automatically.', [
        ['Deploy job', 'Add a deploy job that runs after the image is published.', 25],
        ['Environment', 'Use a protected environment with its own secrets.', 15],
        ['Smoke test', 'After deploy, call the health route and fail the job if it is down.', 20],
      ], ['A smoke test after deploy catches broken releases early.'], [
        'Merging to main deploys the new image.',
        'The pipeline fails if the health check fails after deploy.',
        'Deploy secrets are scoped to the environment.',
      ], { paths: ['.github/workflows/*.yml'], readme: [], commits: 1 }, ['How would you roll back a bad deploy?', 'Continuous delivery versus continuous deployment?'], 'cd: deploy main with a smoke test', []),
      stage('ship', 'Docs and badge', 'The pipeline is documented with a status badge.', [
        ['Diagram in words', 'Describe each stage of the pipeline in the README.', 20],
        ['Badge', 'Add the workflow status badge.', 10],
        ['Rollback note', 'Document how to redeploy a previous image.', 15],
      ], ['Keep the README in sync with the workflow files.'], [
        'The README describes every pipeline stage.',
        'The status badge shows the latest result.',
        'Rollback steps are documented.',
      ], { paths: ['README.md'], readme: ['Pipeline', 'Rollback'], commits: 1 }, ['Which stage takes longest, and how would you speed it up?', 'What would you add for a team of 20?'], 'docs: pipeline and rollback', []),
    ],
    readme: ['Overview', 'Pipeline', 'Secrets', 'Rollback', 'Setup'],
    deploy: ['Create a free container host or VM that can pull from your registry.', 'Store registry and host credentials as repository secrets.', 'Merge a change and watch the pipeline deploy it.', 'Open the health route on the live URL.'],
    verbs: ['Automated', 'Built', 'Secured'],
  }),
  project({
    id: 'do-k8s-observability',
    title: 'Kubernetes deploy with monitoring',
    pitch: 'Run a two-service app on a local Kubernetes cluster with deployments, services, config, autoscaling and Prometheus and Grafana dashboards. It covers what platform and SRE teams do every day.',
    roles: ['devops'],
    level: 'advanced',
    skills: ['kubernetes', 'observability', 'docker', 'sre-practices'],
    stacks: ['Kubernetes', 'kind or minikube', 'Prometheus', 'Grafana'],
    pre: ['dev.containers-ci', 'dev.cloud-ops'],
    outcome: 'Manifests that deploy an API and a worker with config, secrets, probes and autoscaling, plus dashboards and an alert for error rate and latency.',
    source: SRC,
    stages: [
      stage('cluster', 'Cluster and first deployment', 'The API runs on a local cluster behind a service.', [
        ['Local cluster', 'Create a local cluster with kind or minikube and load your image.', 20],
        ['Deployment and service', 'Write a Deployment with two replicas and a ClusterIP Service.', 25],
        ['Access', 'Expose it with port-forward or an ingress and call the health route.', 15],
      ], ['Set resource requests and limits on every container.'], [
        'Two replicas run and pass health checks.',
        'Containers have requests and limits.',
        'The service answers through port-forward or ingress.',
      ], { paths: ['k8s/**/*.yaml', 'k8s/**/*.yml'], readme: [], commits: 1 }, ['What does a Service give you that a Pod IP does not?', 'Why set resource requests?'], 'feat: deployment and service', ['dev.containers-ci.kubernetes']),
      stage('config', 'Config, secrets and probes', 'Configuration is external and unhealthy pods restart.', [
        ['ConfigMap and Secret', 'Move settings to a ConfigMap and credentials to a Secret.', 20],
        ['Probes', 'Add readiness and liveness probes with sensible delays.', 20],
        ['Worker', 'Deploy the worker service using the same config.', 20],
      ], ['Readiness gates traffic; liveness restarts stuck containers.'], [
        'No setting is hard-coded in the image.',
        'Readiness and liveness probes are configured.',
        'Killing a pod brings a new one up automatically.',
      ], { paths: ['k8s/**'], readme: [], commits: 1 }, ['Readiness versus liveness: what happens when each fails?', 'Are Kubernetes Secrets encrypted by default?'], 'feat: config, secrets and probes', []),
      stage('scale', 'Autoscaling and rollouts', 'The API scales with load and updates without downtime.', [
        ['Metrics server', 'Install the metrics server.', 15],
        ['HPA', 'Add a HorizontalPodAutoscaler on CPU and load-test to see it scale.', 25],
        ['Rolling update', 'Change the image tag and watch a rolling update; practise a rollback.', 20],
      ], ['maxUnavailable: 0 keeps capacity during rollouts.'], [
        'The HPA adds pods under load and removes them after.',
        'A rolling update causes no failed requests.',
        'A rollback restores the previous version.',
      ], { paths: ['k8s/**/*hpa*'], readme: [], commits: 1 }, ['How does the HPA decide the number of pods?', 'How do you roll back a deployment?'], 'feat: autoscaling and rolling updates', []),
      stage('observe', 'Metrics, dashboards and alerts', 'You can see error rate and latency, and get alerted.', [
        ['Expose metrics', 'Add request count and latency metrics to the API.', 25],
        ['Prometheus and Grafana', 'Install them on the cluster and scrape the API.', 25],
        ['Dashboard and alert', 'Build a dashboard for rate, errors and duration, and an alert for a high error rate.', 25],
      ], ['Start with the RED metrics: rate, errors, duration.'], [
        'Prometheus scrapes the API metrics.',
        'A dashboard shows rate, errors and latency.',
        'An alert fires when you inject errors.',
      ], { paths: ['k8s/**', 'monitoring/**'], readme: [], commits: 1 }, ['What is the difference between monitoring and observability?', 'What would your SLO be for this API?'], 'feat: metrics, dashboards and alerts', ['dev.cloud-ops.observability']),
      stage('ship', 'Runbook and README', 'Someone else can operate the system.', [
        ['README', 'Describe the architecture, manifests and how to run everything.', 20],
        ['Runbook', 'Write a short runbook for the alert: what it means and what to check.', 20],
        ['Clean apply', 'Delete the cluster, recreate it and apply everything from the README to prove it works.', 20],
      ], ['A runbook entry answers: what broke, how to confirm, how to fix.'], [
        'The README explains how to run the stack.',
        'The runbook covers the alert.',
        'Manifests apply cleanly to a new cluster.',
      ], { paths: ['README.md', 'docs/**', 'RUNBOOK.md'], readme: ['Architecture', 'Setup'], commits: 1 }, ['What would you change for a production cluster?', 'How would you manage these manifests for three environments?'], 'docs: README and runbook', ['dev.cloud-ops.sre-practices']),
    ],
    readme: ['Overview', 'Architecture', 'Setup', 'Monitoring', 'Runbook'],
    deploy: ['Create a local cluster with kind or minikube.', 'Build and load the images into the cluster.', 'Apply the manifests in order: config, deployments, services, autoscaler.', 'Port-forward Grafana and open the dashboard.'],
    verbs: ['Deployed', 'Monitored', 'Automated'],
  }),
];
