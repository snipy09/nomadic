/**
 * Frontend projects: an app idea built in the browser (React, Vue, Angular,
 * SvelteKit or plain HTML/CSS/JS). Beginner keeps data in the browser;
 * intermediate and advanced talk to a local REST API (json-server), add
 * routing and tests; advanced adds all three features and a CI pipeline.
 */
import type { ProjectLevel } from '../../types';
import { an, andList, fieldList, lowerFirst, sampleLiteral, tsType, upperFirst } from '../names';
import type { Ctx, FieldDef, KindPlan, StackDef, StageTemplate } from '../types';

interface FrontendKit {
  create: string;
  run: string;
  /** Where components live, e.g. "src/components". */
  dir: string;
  /** Component file extension. */
  ext: string;
  /** How the list is held, for the step text. */
  state: string;
  typeFile: string;
  typeDef: (c: Ctx) => string;
  list: (c: Ctx) => string;
  form: (c: Ctx) => string;
  remove: (c: Ctx) => string;
  storage: (c: Ctx) => string;
  proxy: string;
  router: { install: string; code: (c: Ctx) => string };
  test: { install: string; code: (c: Ctx) => string; run: string };
  topics: { ui: string[]; state: string[]; test: string[] };
}

const STORAGE_KEY = (c: Ctx) => `${c.n.kebabMany}-v1`;
const others = (c: Ctx) => c.fields.filter((f) => f !== c.titleField).slice(0, 3);

function initial(f: FieldDef): string {
  if (f.type === 'enum') return `'${f.options?.[0] ?? ''}'`;
  if (f.type === 'boolean') return 'false';
  return "''";
}

function shown(f: FieldDef, v: string): string {
  if (f.type === 'money') return `₹{${v}.${f.name}}`;
  if (f.type === 'boolean') return `{${v}.${f.name} ? '${f.label}: yes' : '${f.label}: no'}`;
  return `{${v}.${f.name}}`;
}

/** TypeScript interface shared by the TS stacks. */
function tsInterface(c: Ctx): string {
  const lines = c.fields.map((f) => `  ${f.name}${f.required === false ? '?' : ''}: ${tsType(f)};`);
  const sample = c.fields.map((f) => `    ${f.name}: ${sampleLiteral(f, 0)},`).join('\n');
  return `export interface ${c.n.Pascal} {\n  id: string;\n${lines.join('\n')}\n}\n\nexport const SAMPLE_${c.n.snakeMany.toUpperCase()}: ${c.n.Pascal}[] = [\n  {\n    id: '1',\n${sample}\n  },\n];`;
}

/** Converts form strings into typed values (shared by the TS stacks). */
function tsConvert(c: Ctx, src: string): string {
  return c.fields
    .map((f) => `    ${f.name}: ${f.type === 'number' || f.type === 'money' ? `Number(${src}.${f.name})` : f.type === 'text' || f.type === 'longtext' ? `${src}.${f.name}.trim()` : f.type === 'enum' ? `${src}.${f.name} as ${c.n.Pascal}['${f.name}']` : `${src}.${f.name}`},`)
    .join('\n');
}

const requiredChecks = (c: Ctx, src: string, setError: (msg: string) => string) =>
  c.fields
    .filter((f) => f.required !== false && (f.type === 'text' || f.type === 'number' || f.type === 'money'))
    .slice(0, 2)
    .map((f) =>
      f.type === 'text'
        ? `  if (!${src}.${f.name}.trim()) return ${setError(`Add ${an(f.label)}.`)};`
        : `  if (${src}.${f.name} === '' || Number(${src}.${f.name}) < 0) return ${setError(`Enter ${an(f.label)} of 0 or more.`)};`
    )
    .join('\n');

function apiClient(c: Ctx, base: string): string {
  const N = c.n;
  return `import type { ${N.Pascal} } from './types';

const BASE = '${base}';

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, { headers: { 'Content-Type': 'application/json' }, ...init });
  if (!res.ok) throw new Error(\`Request failed: \${res.status}\`);
  return res.status === 204 ? (undefined as T) : res.json();
}

export const list${N.PascalMany} = () => call<${N.Pascal}[]>('/${N.kebabMany}');
export const create${N.Pascal} = (body: Omit<${N.Pascal}, 'id'>) =>
  call<${N.Pascal}>('/${N.kebabMany}', { method: 'POST', body: JSON.stringify(body) });
export const update${N.Pascal} = (item: ${N.Pascal}) =>
  call<${N.Pascal}>(\`/${N.kebabMany}/\${item.id}\`, { method: 'PUT', body: JSON.stringify(item) });
export const delete${N.Pascal} = (id: string) => call<void>(\`/${N.kebabMany}/\${id}\`, { method: 'DELETE' });`;
}

// ── Kits ────────────────────────────────────────────────────────────────────

const REACT: FrontendKit = {
  create: 'npm create vite@latest my-app -- --template react-ts\ncd my-app\nnpm install\nnpm run dev',
  run: 'npm run dev',
  dir: 'src/components',
  ext: 'tsx',
  state: 'a useState array in App.tsx',
  typeFile: 'src/types.ts',
  typeDef: tsInterface,
  list: (c) => {
    const N = c.n;
    return `import type { ${N.Pascal} } from '../types';

interface Props {
  ${N.camelMany}: ${N.Pascal}[];
  onDelete: (id: string) => void;
}

export function ${N.Pascal}List({ ${N.camelMany}, onDelete }: Props) {
  if (${N.camelMany}.length === 0) return <p className="empty">No ${N.many} yet. Add your first one.</p>;
  return (
    <ul className="list">
      {${N.camelMany}.map((item) => (
        <li key={item.id} className="card">
          <strong>{item.${c.titleField.name}}</strong>
${others(c).map((f) => `          <span>${shown(f, 'item')}</span>`).join('\n')}
          <button onClick={() => onDelete(item.id)} aria-label={\`Delete \${item.${c.titleField.name}}\`}>Delete</button>
        </li>
      ))}
    </ul>
  );
}`;
  },
  form: (c) => {
    const N = c.n;
    return `const EMPTY = { ${c.fields.map((f) => `${f.name}: ${initial(f)}`).join(', ')} };

export function ${N.Pascal}Form({ onAdd }: { onAdd: (item: ${N.Pascal}) => void }) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
${requiredChecks(c, 'form', (m) => `setError('${m}')`).replace(/^ {2}/gm, '    ')}
    onAdd({ id: crypto.randomUUID(),
${tsConvert(c, 'form').replace(/^ {4}/gm, '      ')}
    });
    setForm(EMPTY);
    setError('');
  }
  // Render one labelled input per field; onChange: setForm({ ...form, [name]: value })
}`;
  },
  remove: (c) =>
    `const remove = (id: string) => set${c.n.PascalMany}((list) => list.filter((x) => x.id !== id));\nconst update = (next: ${c.n.Pascal}) => set${c.n.PascalMany}((list) => list.map((x) => (x.id === next.id ? next : x)));`,
  storage: (c) =>
    `const KEY = '${STORAGE_KEY(c)}';\n\nfunction load(): ${c.n.Pascal}[] {\n  try {\n    return JSON.parse(localStorage.getItem(KEY) ?? '[]');\n  } catch {\n    return [];\n  }\n}\n\n// In App: read once, save on every change.\nconst [${c.n.camelMany}, set${c.n.PascalMany}] = useState<${c.n.Pascal}[]>(load);\nuseEffect(() => localStorage.setItem(KEY, JSON.stringify(${c.n.camelMany})), [${c.n.camelMany}]);`,
  proxy: `// vite.config.ts
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': { target: 'http://localhost:3001', rewrite: (p) => p.replace(/^\\/api/, '') } } },
});`,
  router: {
    install: 'npm install react-router',
    code: (c) => `import { createBrowserRouter, RouterProvider } from 'react-router';

const router = createBrowserRouter([
  { path: '/', element: <${c.n.Pascal}ListPage /> },
  { path: '/${c.n.kebabMany}/:id', element: <${c.n.Pascal}DetailPage /> },
  { path: '*', element: <NotFound /> },
]);

// main.tsx: root.render(<RouterProvider router={router} />);
// Detail page: const { id } = useParams();`,
  },
  test: {
    install: 'npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event',
    run: 'npx vitest',
    code: (c) => `import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ${c.n.Pascal}List } from './${c.n.Pascal}List';

describe('${c.n.Pascal}List', () => {
  it('shows an empty message', () => {
    render(<${c.n.Pascal}List ${c.n.camelMany}={[]} onDelete={() => {}} />);
    expect(screen.getByText(/no ${c.n.many} yet/i)).toBeTruthy();
  });
});`,
  },
  topics: { ui: ['dev.react.react'], state: ['dev.react.react-state-management'], test: ['dev.frontend-engineering.frontend-testing'] },
};

const VUE: FrontendKit = {
  create: 'npm create vue@latest my-app\n# pick TypeScript, Router: No (added later), Vitest: No\ncd my-app\nnpm install\nnpm run dev',
  run: 'npm run dev',
  dir: 'src/components',
  ext: 'vue',
  state: 'a ref array in App.vue',
  typeFile: 'src/types.ts',
  typeDef: tsInterface,
  list: (c) => {
    const N = c.n;
    return `<script setup lang="ts">
import type { ${N.Pascal} } from '../types';

defineProps<{ ${N.camelMany}: ${N.Pascal}[] }>();
const emit = defineEmits<{ delete: [id: string] }>();
</script>

<template>
  <p v-if="${N.camelMany}.length === 0" class="empty">No ${N.many} yet. Add your first one.</p>
  <ul v-else class="list">
    <li v-for="item in ${N.camelMany}" :key="item.id" class="card">
      <strong>{{ item.${c.titleField.name} }}</strong>
${others(c).map((f) => `      <span>{{ item.${f.name} }}</span>`).join('\n')}
      <button @click="emit('delete', item.id)">Delete</button>
    </li>
  </ul>
</template>`;
  },
  form: (c) => {
    const N = c.n;
    return `<script setup lang="ts">
import { reactive, ref } from 'vue';
import type { ${N.Pascal} } from '../types';

const emit = defineEmits<{ add: [item: ${N.Pascal}] }>();
const EMPTY = { ${c.fields.map((f) => `${f.name}: ${initial(f)}`).join(', ')} };
const form = reactive({ ...EMPTY });
const error = ref('');

function submit() {
${requiredChecks(c, 'form', (m) => `void (error.value = '${m}')`)}
  emit('add', { id: crypto.randomUUID(),
${tsConvert(c, 'form')}
  });
  Object.assign(form, EMPTY);
  error.value = '';
}
</script>
<!-- template: <form @submit.prevent="submit"> with v-model on each labelled input -->`;
  },
  remove: (c) => `const ${c.n.camelMany} = ref<${c.n.Pascal}[]>([]);\nconst remove = (id: string) => (${c.n.camelMany}.value = ${c.n.camelMany}.value.filter((x) => x.id !== id));\nconst update = (next: ${c.n.Pascal}) =>\n  (${c.n.camelMany}.value = ${c.n.camelMany}.value.map((x) => (x.id === next.id ? next : x)));`,
  storage: (c) =>
    `import { ref, watch } from 'vue';\n\nconst KEY = '${STORAGE_KEY(c)}';\n\nfunction load(): ${c.n.Pascal}[] {\n  try {\n    return JSON.parse(localStorage.getItem(KEY) ?? '[]');\n  } catch {\n    return [];\n  }\n}\n\nconst ${c.n.camelMany} = ref<${c.n.Pascal}[]>(load());\nwatch(${c.n.camelMany}, (v) => localStorage.setItem(KEY, JSON.stringify(v)), { deep: true });`,
  proxy: `// vite.config.ts
export default defineConfig({
  plugins: [vue()],
  server: { proxy: { '/api': { target: 'http://localhost:3001', rewrite: (p) => p.replace(/^\\/api/, '') } } },
});`,
  router: {
    install: 'npm install vue-router',
    code: (c) => `import { createRouter, createWebHistory } from 'vue-router';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: () => import('./pages/${c.n.Pascal}ListPage.vue') },
    { path: '/${c.n.kebabMany}/:id', component: () => import('./pages/${c.n.Pascal}DetailPage.vue'), props: true },
    { path: '/:pathMatch(.*)*', component: () => import('./pages/NotFound.vue') },
  ],
});

// main.ts: createApp(App).use(router).mount('#app'); App.vue renders <RouterView />`,
  },
  test: {
    install: 'npm install -D vitest jsdom @vue/test-utils',
    run: 'npx vitest',
    code: (c) => `import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ${c.n.Pascal}List from './${c.n.Pascal}List.vue';

describe('${c.n.Pascal}List', () => {
  it('shows an empty message', () => {
    const wrapper = mount(${c.n.Pascal}List, { props: { ${c.n.camelMany}: [] } });
    expect(wrapper.text()).toContain('No ${c.n.many} yet');
  });
});`,
  },
  topics: { ui: ['dev.frontend-engineering.vue'], state: ['dev.frontend-engineering.vue'], test: ['dev.frontend-engineering.frontend-testing'] },
};

const ANGULAR: FrontendKit = {
  create: 'npm install -g @angular/cli\nng new my-app --style=css --ssr=false\ncd my-app\nng serve',
  run: 'ng serve',
  dir: 'src/app',
  ext: 'ts',
  state: 'a signal in a service',
  typeFile: 'src/app/types.ts',
  typeDef: tsInterface,
  list: (c) => {
    const N = c.n;
    return `import { Component, input, output } from '@angular/core';
import type { ${N.Pascal} } from './types';

@Component({
  selector: 'app-${N.kebabMany}-list',
  template: \`
    @if (${N.camelMany}().length === 0) {
      <p class="empty">No ${N.many} yet. Add your first one.</p>
    } @else {
      <ul class="list">
        @for (item of ${N.camelMany}(); track item.id) {
          <li class="card">
            <strong>{{ item.${c.titleField.name} }}</strong>
${others(c).map((f) => `            <span>{{ item.${f.name} }}</span>`).join('\n')}
            <button (click)="remove.emit(item.id)">Delete</button>
          </li>
        }
      </ul>
    }
  \`,
})
export class ${N.Pascal}List {
  ${N.camelMany} = input.required<${N.Pascal}[]>();
  remove = output<string>();
}`;
  },
  form: (c) => {
    const N = c.n;
    return `import { Component, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { ${N.Pascal} } from './types';

@Component({ selector: 'app-${N.kebabMany}-form', imports: [FormsModule], templateUrl: './${N.kebabMany}-form.html' })
export class ${N.Pascal}Form {
  add = output<${N.Pascal}>();
  error = signal('');
  form = { ${c.fields.map((f) => `${f.name}: ${initial(f)}`).join(', ')} };

  submit() {
${requiredChecks(c, 'this.form', (m) => `this.error.set('${m}')`).replace(/^ {2}/gm, '    ')}
    this.add.emit({ id: crypto.randomUUID(),
${tsConvert(c, 'this.form').replace(/^ {4}/gm, '      ')}
    });
    this.error.set('');
  }
}
// template: <form (ngSubmit)="submit()"> with [(ngModel)] and name="…" on each labelled input`;
  },
  remove: (c) =>
    `@Injectable({ providedIn: 'root' })\nexport class ${c.n.Pascal}Store {\n  readonly ${c.n.camelMany} = signal<${c.n.Pascal}[]>([]);\n  add(item: ${c.n.Pascal}) { this.${c.n.camelMany}.update((l) => [...l, item]); }\n  remove(id: string) { this.${c.n.camelMany}.update((l) => l.filter((x) => x.id !== id)); }\n  replace(next: ${c.n.Pascal}) { this.${c.n.camelMany}.update((l) => l.map((x) => (x.id === next.id ? next : x))); }\n}`,
  storage: (c) =>
    `const KEY = '${STORAGE_KEY(c)}';\n\nfunction load(): ${c.n.Pascal}[] {\n  try {\n    return JSON.parse(localStorage.getItem(KEY) ?? '[]');\n  } catch {\n    return [];\n  }\n}\n\n// In ${c.n.Pascal}Store:\nreadonly ${c.n.camelMany} = signal<${c.n.Pascal}[]>(load());\nconstructor() {\n  effect(() => localStorage.setItem(KEY, JSON.stringify(this.${c.n.camelMany}())));\n}`,
  proxy: `// proxy.conf.json (then: ng serve --proxy-config proxy.conf.json)
{
  "/api": { "target": "http://localhost:3001", "pathRewrite": { "^/api": "" } }
}`,
  router: {
    install: '# the router ships with Angular',
    code: (c) => `// app.routes.ts
export const routes: Routes = [
  { path: '', component: ${c.n.Pascal}ListPage },
  { path: '${c.n.kebabMany}/:id', component: ${c.n.Pascal}DetailPage },
  { path: '**', component: NotFound },
];

// app.config.ts: providers: [provideRouter(routes, withComponentInputBinding())]
// Detail page: id = input.required<string>();`,
  },
  test: {
    install: '# ng new already set up the test runner',
    run: 'ng test',
    code: (c) => `import { TestBed } from '@angular/core/testing';
import { ${c.n.Pascal}List } from './${c.n.kebabMany}-list';

describe('${c.n.Pascal}List', () => {
  it('shows an empty message', () => {
    const fixture = TestBed.createComponent(${c.n.Pascal}List);
    fixture.componentRef.setInput('${c.n.camelMany}', []);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No ${c.n.many} yet');
  });
});`,
  },
  topics: { ui: ['dev.frontend-engineering.angular'], state: ['dev.frontend-engineering.angular'], test: ['dev.frontend-engineering.frontend-testing'] },
};

const SVELTE: FrontendKit = {
  create: 'npx sv create my-app\n# pick: SvelteKit minimal, TypeScript\ncd my-app\nnpm install\nnpm run dev',
  run: 'npm run dev',
  dir: 'src/lib',
  ext: 'svelte',
  state: 'a $state array in +page.svelte',
  typeFile: 'src/lib/types.ts',
  typeDef: tsInterface,
  list: (c) => {
    const N = c.n;
    return `<script lang="ts">
  import type { ${N.Pascal} } from './types';

  let { ${N.camelMany}, ondelete }: { ${N.camelMany}: ${N.Pascal}[]; ondelete: (id: string) => void } = $props();
</script>

{#if ${N.camelMany}.length === 0}
  <p class="empty">No ${N.many} yet. Add your first one.</p>
{:else}
  <ul class="list">
    {#each ${N.camelMany} as item (item.id)}
      <li class="card">
        <strong>{item.${c.titleField.name}}</strong>
${others(c).map((f) => `        <span>{item.${f.name}}</span>`).join('\n')}
        <button onclick={() => ondelete(item.id)}>Delete</button>
      </li>
    {/each}
  </ul>
{/if}`;
  },
  form: (c) => {
    const N = c.n;
    return `<script lang="ts">
  import type { ${N.Pascal} } from './types';

  let { onadd }: { onadd: (item: ${N.Pascal}) => void } = $props();
  const EMPTY = { ${c.fields.map((f) => `${f.name}: ${initial(f)}`).join(', ')} };
  let form = $state({ ...EMPTY });
  let error = $state('');

  function submit(e: SubmitEvent) {
    e.preventDefault();
${requiredChecks(c, 'form', (m) => `void (error = '${m}')`).replace(/^ {2}/gm, '    ')}
    onadd({ id: crypto.randomUUID(),
${tsConvert(c, 'form').replace(/^ {4}/gm, '      ')}
    });
    form = { ...EMPTY };
    error = '';
  }
</script>
<!-- <form onsubmit={submit}> with bind:value on each labelled input -->`;
  },
  remove: (c) => `let ${c.n.camelMany} = $state<${c.n.Pascal}[]>([]);\nconst remove = (id: string) => (${c.n.camelMany} = ${c.n.camelMany}.filter((x) => x.id !== id));\nconst update = (next: ${c.n.Pascal}) => (${c.n.camelMany} = ${c.n.camelMany}.map((x) => (x.id === next.id ? next : x)));`,
  storage: (c) =>
    `import { browser } from '$app/environment';\n\nconst KEY = '${STORAGE_KEY(c)}';\n\nfunction load(): ${c.n.Pascal}[] {\n  if (!browser) return [];\n  try {\n    return JSON.parse(localStorage.getItem(KEY) ?? '[]');\n  } catch {\n    return [];\n  }\n}\n\nlet ${c.n.camelMany} = $state<${c.n.Pascal}[]>(load());\n$effect(() => localStorage.setItem(KEY, JSON.stringify(${c.n.camelMany})));`,
  proxy: `// vite.config.ts
export default defineConfig({
  plugins: [sveltekit()],
  server: { proxy: { '/api': { target: 'http://localhost:3001', rewrite: (p) => p.replace(/^\\/api/, '') } } },
});`,
  router: {
    install: '# SvelteKit routes are folders under src/routes',
    code: (c) => `src/routes/+page.svelte                      -> /
src/routes/${c.n.kebabMany}/[id]/+page.svelte        -> /${c.n.kebabMany}/:id
src/routes/${c.n.kebabMany}/[id]/+page.ts            -> load the ${c.n.one}
src/routes/+error.svelte                     -> not found and other errors

// +page.ts
export async function load({ params, fetch }) {
  const res = await fetch(\`/api/${c.n.kebabMany}/\${params.id}\`);
  if (res.status === 404) error(404, '${c.n.One} not found');
  return { ${c.n.camel}: await res.json() };
}`,
  },
  test: {
    install: 'npm install -D vitest jsdom @testing-library/svelte',
    run: 'npx vitest',
    code: (c) => `import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import ${c.n.Pascal}List from './${c.n.Pascal}List.svelte';

describe('${c.n.Pascal}List', () => {
  it('shows an empty message', () => {
    render(${c.n.Pascal}List, { props: { ${c.n.camelMany}: [], ondelete: () => {} } });
    expect(screen.getByText(/no ${c.n.many} yet/i)).toBeTruthy();
  });
});`,
  },
  topics: { ui: ['dev.javascript.javascript'], state: ['dev.javascript.javascript'], test: ['dev.frontend-engineering.frontend-testing'] },
};

const VANILLA: FrontendKit = {
  create: 'mkdir my-app && cd my-app\ngit init\n# create index.html, styles.css and app.js\nnpx serve .',
  run: 'npx serve .',
  dir: '.',
  ext: 'js',
  state: 'an array in app.js',
  typeFile: 'app.js',
  typeDef: (c) =>
    `/**\n * @typedef {Object} ${c.n.Pascal}\n * @property {string} id\n${c.fields.map((f) => ` * @property {${f.type === 'number' || f.type === 'money' ? 'number' : f.type === 'boolean' ? 'boolean' : 'string'}} ${f.name}`).join('\n')}\n */\n\n/** @type {${c.n.Pascal}[]} */\nlet ${c.n.camelMany} = [\n  { id: '1', ${c.fields.map((f) => `${f.name}: ${sampleLiteral(f, 0)}`).join(', ')} },\n];`,
  list: (c) => {
    const N = c.n;
    return `const listEl = document.querySelector('#list');

function render() {
  listEl.replaceChildren();
  if (${N.camelMany}.length === 0) {
    listEl.textContent = 'No ${N.many} yet. Add your first one.';
    return;
  }
  for (const item of ${N.camelMany}) {
    const li = document.createElement('li');
    li.className = 'card';
    const title = document.createElement('strong');
    title.textContent = item.${c.titleField.name}; // textContent, never innerHTML, for user text
    const del = document.createElement('button');
    del.textContent = 'Delete';
    del.addEventListener('click', () => remove(item.id));
    li.append(title, del);
    listEl.append(li);
  }
}`;
  },
  form: (c) => `const form = document.querySelector('#${c.n.kebabMany}-form');

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  if (!String(data.${c.titleField.name} ?? '').trim()) {
    showError('Add ${an(c.titleField.label)}.');
    return;
  }
  ${c.n.camelMany}.push({ id: crypto.randomUUID(), ...data });
  form.reset();
  save();
  render();
});`,
  remove: (c) => `function remove(id) {\n  ${c.n.camelMany} = ${c.n.camelMany}.filter((x) => x.id !== id);\n  save();\n  render();\n}`,
  storage: (c) =>
    `const KEY = '${STORAGE_KEY(c)}';\n\nfunction load() {\n  try {\n    return JSON.parse(localStorage.getItem(KEY) ?? '[]');\n  } catch {\n    return [];\n  }\n}\n\nfunction save() {\n  localStorage.setItem(KEY, JSON.stringify(${c.n.camelMany}));\n}\n\n${c.n.camelMany} = load();\nrender();`,
  proxy: '// json-server allows calls from other origins, so app.js can call it directly:\nconst BASE = \'http://localhost:3001\';',
  router: {
    install: '# no library: use the URL hash',
    code: (c) => `function route() {
  const [, page, id] = location.hash.split('/'); // #/${c.n.kebabMany}/42
  if (page === '${c.n.kebabMany}' && id) showDetail(id);
  else if (!page) showList();
  else showNotFound();
}

window.addEventListener('hashchange', route);
route();`,
  },
  test: {
    install: 'npm init -y\nnpm install -D vitest',
    run: 'npx vitest',
    code: (c) => `// logic.js holds pure functions (filter, sort, totals) that app.js imports
import { describe, expect, it } from 'vitest';
import { search } from './logic.js';

describe('search', () => {
  it('matches the ${c.titleField.label} without case', () => {
    const items = [{ id: '1', ${c.titleField.name}: 'Alpha' }, { id: '2', ${c.titleField.name}: 'beta' }];
    expect(search(items, 'ALP').map((x) => x.id)).toEqual(['1']);
  });
});`,
  },
  topics: { ui: ['dev.web-foundations.html', 'dev.javascript.dom-apis'], state: ['dev.javascript.javascript'], test: ['dev.dev-tools.testing-fundamentals'] },
};

const KITS: Record<string, FrontendKit> = { react: REACT, vue: VUE, angular: ANGULAR, sveltekit: SVELTE, vanilla: VANILLA };
const kit = (c: Ctx) => KITS[c.stack.key];
const file = (c: Ctx, name: string) => (c.stack.key === 'vanilla' ? 'app.js' : `${kit(c).dir}/${name}.${kit(c).ext}`);
const cssFile = (c: Ctx) => (c.stack.key === 'vanilla' ? 'styles.css' : c.stack.key === 'angular' ? 'src/styles.css' : 'src/app.css');

// ── Stages ──────────────────────────────────────────────────────────────────

const setup: StageTemplate<Ctx> = {
  id: 'setup',
  minutes: [15, 15, 20, 10],
  build: (c) => ({
    title: 'Project setup and the first screen',
    goal: `A ${c.stack.short} project runs locally, shows the app's name and an empty state, and is pushed to GitHub.`,
    steps: [
      { title: 'Create the project', detail: `Create a new ${c.stack.label} project and start the dev server. Open it in the browser and keep the server running while you work.`, code: kit(c).create },
      { title: 'Clean out the starter', detail: `Delete the demo content, keep one root component and one stylesheet (${cssFile(c)}). Set the page title to "${c.idea.title}".` },
      { title: 'Build the app shell', detail: `Add a header with the app name, a main area and a short line saying what the app does: ${lowerFirst(c.idea.pitch)} Show an empty state ("No ${c.n.many} yet") until there is data. Use semantic elements (header, main, h1).` },
      { title: 'Commit and push', detail: 'Create a public GitHub repository, add a .gitignore that excludes node_modules and build output, commit and push. Commit small and often from here on.', code: 'git init\ngit add .\ngit commit -m "chore: project setup"\ngit branch -M main\ngit remote add origin <your repository>\ngit push -u origin main' },
    ],
    hints: ['If the dev server port is busy, stop the other server or pass a different port.', 'Keep the empty state friendly: say what to do next, not just "Nothing here".'],
    acceptance: ['The app starts with one command and shows the app name.', `An empty state says there are no ${c.n.many} yet.`, 'The repository is on GitHub with a .gitignore.'],
    repo: { paths: [c.stack.key === 'vanilla' ? 'index.html' : 'package.json', '.gitignore'] },
    self_check: [`Why does the project use ${c.stack.short} rather than plain HTML, or the other way round?`, 'What does your .gitignore keep out of the repository, and why?'],
    commit: 'chore: project setup and app shell',
    topics: kit(c).topics.ui,
  }),
};

const model: StageTemplate<Ctx> = {
  id: 'model',
  minutes: [15, 15, 25, 20],
  build: (c) => ({
    title: `Model the ${c.n.one} and show a list`,
    goal: `The ${c.n.one} has a typed shape and a list of sample ${c.n.many} renders as cards.`,
    steps: [
      { title: `Define the ${c.n.one}`, detail: `In ${kit(c).typeFile}, describe ${an(c.n.one)} with an id plus ${fieldList(c.fields)}.`, code: kit(c).typeDef(c) },
      { title: 'Add sample data', detail: `Add three realistic sample ${c.n.many} so you can see the layout. Use values a real user in India would enter (rupees for money, realistic dates).` },
      { title: 'Render the list', detail: `Create ${file(c, `${c.n.Pascal}List`)} that shows each ${c.n.one} as a card with its ${andList([c.titleField.label, ...others(c).map((f) => f.label)])}. Use the id as the key, and show the empty state when the list is empty.`, code: kit(c).list(c) },
      { title: 'Style the cards', detail: `In ${cssFile(c)}, lay the cards out with CSS grid (repeat(auto-fill, minmax(16rem, 1fr))), give them padding, a border and a readable font size. Check the page at 360 px and 1280 px wide.` },
    ],
    hints: ['Keys must be stable ids, not array indexes, or items get mixed up when you delete one.', 'Format money with toLocaleString("en-IN") to get 1,20,000 style grouping.'],
    acceptance: [`Three sample ${c.n.many} show as cards.`, 'Each card shows the main fields.', 'The layout works on a 360 px wide screen.'],
    repo: { paths: [c.stack.key === 'vanilla' ? 'app.js' : `${kit(c).dir}/**`] },
    self_check: [`Why does every ${c.n.one} need an id?`, 'What goes wrong if you use the array index as the list key?'],
    commit: `feat: ${c.n.one} model and list`,
    topics: kit(c).topics.ui,
  }),
};

const create: StageTemplate<Ctx> = {
  id: 'create',
  minutes: [20, 25, 20, 15],
  build: (c) => ({
    title: `Add new ${c.n.many} with a form`,
    goal: `A form adds a new ${c.n.one}; empty or invalid input shows a clear error and nothing is added.`,
    steps: [
      { title: 'Build the form', detail: `Add a form with one labelled input per field: ${fieldList(c.fields)}. Use the right input types (number, date, select for choices, checkbox for yes/no).` },
      { title: 'Handle submit', detail: `On submit, prevent the page reload, check the input, convert numbers, give the ${c.n.one} a new id (crypto.randomUUID()) and add it to ${kit(c).state}.`, code: kit(c).form(c) },
      { title: 'Show errors', detail: 'Show the error message next to the form with role="alert" so screen readers announce it. Keep what the user typed when there is an error.' },
      { title: 'Reset after adding', detail: 'Clear the form after a successful add and move focus back to the first input so the next one can be typed straight away.' },
    ],
    hints: ['Number inputs still give you strings; convert with Number() before saving.', 'Check the rules in one function so the same checks can be reused when editing.'],
    acceptance: [`Submitting a valid form adds ${an(c.n.one)} to the list.`, `An empty ${c.titleField.label} shows an error and adds nothing.`, 'The form clears after a successful add.', 'Every input has a visible label.'],
    repo: { paths: [c.stack.key === 'vanilla' ? 'app.js' : `${kit(c).dir}/**`] },
    self_check: ['Why do you call preventDefault on submit?', 'Where should validation live so add and edit share it?'],
    commit: `feat: add ${c.n.many} with validation`,
    topics: kit(c).topics.state,
  }),
};

const edit: StageTemplate<Ctx> = {
  id: 'edit',
  minutes: [20, 25, 15],
  build: (c) => ({
    title: 'Edit and delete',
    goal: `Any ${c.n.one} can be edited in place or deleted after a confirmation.`,
    steps: [
      { title: 'Delete with confirmation', detail: `Add a Delete button per card. Ask "Delete this ${c.n.one}?" before removing it. Update the list immutably (filter), never by splicing the array in place.`, code: kit(c).remove(c) },
      { title: 'Edit mode', detail: `Add an Edit button that fills the same form with the ${c.n.one}'s values. Saving replaces the ${c.n.one} with the same id (map) instead of adding a new one. Add a Cancel button.` },
      { title: 'Check the edge cases', detail: `Delete the last ${c.n.one} (the empty state must come back), edit then cancel (nothing changes), and edit with an invalid value (the same error as on add).` },
    ],
    hints: ['Keep an "editingId" in state: null means the form adds, an id means it edits.', 'Buttons inside a form submit it by default; give non-submit buttons type="button".'],
    acceptance: [`Editing ${an(c.n.one)} changes it without creating a duplicate.`, 'Deleting asks first and then removes the card.', 'Cancel leaves the data unchanged.'],
    repo: { paths: [c.stack.key === 'vanilla' ? 'app.js' : `${kit(c).dir}/**`] },
    self_check: ['Why update state with a new array instead of changing the old one?', 'How does the form know whether it is adding or editing?'],
    commit: `feat: edit and delete ${c.n.many}`,
    topics: kit(c).topics.state,
  }),
};

const persist: StageTemplate<Ctx> = {
  id: 'persist',
  minutes: [15, 20, 15],
  build: (c) => ({
    title: 'Save to the browser',
    goal: `${c.n.Many} survive a page reload; broken saved data never crashes the app.`,
    steps: [
      { title: 'Load and save with localStorage', detail: 'Read the saved list once when the app starts and save it after every change. Version the key so you can change the shape later.', code: kit(c).storage(c) },
      { title: 'Survive bad data', detail: 'Put a broken value in localStorage from the browser console (localStorage.setItem(key, "{oops")) and reload: the app must start with an empty list, not a blank page.' },
      { title: 'Add a "Clear all" action', detail: `Add a Clear all button (with a confirmation) that removes every ${c.n.one} and the saved data.` },
    ],
    hints: ['localStorage only stores strings: JSON.stringify on save, JSON.parse on load.', 'Wrap JSON.parse in try/catch; anything stored can be corrupted.'],
    acceptance: [`Added ${c.n.many} are still there after a reload.`, 'Corrupt saved data does not crash the app.', 'Clear all empties the list and the saved data.'],
    repo: { paths: [c.stack.key === 'vanilla' ? 'app.js' : 'src/**'] },
    self_check: ['What are the limits of localStorage (size, type, sync)?', 'Why version the storage key?'],
    commit: 'feat: persist to localStorage',
    topics: ['dev.javascript.dom-apis'],
  }),
};

const api: StageTemplate<Ctx> = {
  id: 'api',
  minutes: [15, 20, 25, 20],
  build: (c) => ({
    title: 'Talk to a REST API',
    goal: `${c.n.Many} are loaded from and saved to a local REST API, with loading and error states.`,
    steps: [
      { title: 'Run a local API', detail: `Create db.json with a "${c.n.kebabMany}" array holding your sample data, then run json-server. It gives you GET, POST, PUT and DELETE on /${c.n.kebabMany} for free.`, code: `npm install -D json-server\nnpx json-server db.json --port 3001\n# db.json: { "${c.n.kebabMany}": [ { "id": "1", ... } ] }` },
      { title: 'Proxy the API in development', detail: 'Send /api calls to the API server so the browser never needs a full address and you avoid cross-origin errors.', code: kit(c).proxy },
      { title: 'Write an API client', detail: `Put every request in one file (api.ts). Each function returns typed data and throws on a non-2xx status.`, code: apiClient(c, c.stack.key === 'vanilla' ? 'http://localhost:3001' : '/api') },
      { title: 'Loading and error states', detail: `Replace local data with the API: show "Loading…" while the list loads, an error with a Retry button when it fails (stop json-server to test it), and disable the form while saving.` },
    ],
    hints: ['Start json-server in a second terminal so both servers run.', 'Update the screen only after the server confirms a save, or roll back if it fails.'],
    acceptance: ['The list loads from the API.', 'Add, edit and delete change db.json.', 'Stopping the API shows an error with Retry instead of a blank page.'],
    repo: { paths: ['db.json', c.stack.key === 'vanilla' ? 'app.js' : 'src/**/api*'] },
    self_check: ['What is the difference between PUT and PATCH?', 'Why show a loading state instead of an empty list while data loads?'],
    commit: 'feat: load and save through the REST API',
    topics: ['dev.javascript.async-javascript', 'dev.dev-tools.http-fundamentals'],
  }),
};

const find: StageTemplate<Ctx> = {
  id: 'find',
  minutes: [20, 20, 15],
  build: (c) => {
    const choice = c.fields.find((f) => f.type === 'enum' || f.type === 'boolean');
    const sortable = c.fields.find((f) => f.type === 'date' || f.type === 'number' || f.type === 'money') ?? c.titleField;
    return {
      title: 'Search, filter and sort',
      goal: `Users can find ${an(c.n.one)} quickly by typing, filtering and sorting.`,
      steps: [
        { title: 'Search box', detail: `Add a search input that filters ${c.n.many} by ${c.titleField.label} as you type, ignoring case. Derive the shown list from the full list; never delete data to filter it.`, code: `const shown = ${c.n.camelMany}.filter((x) =>\n  x.${c.titleField.name}.toLowerCase().includes(query.trim().toLowerCase())\n);` },
        { title: choice ? `Filter by ${choice.label}` : 'Filter chips', detail: choice ? `Add filter buttons for ${choice.type === 'enum' ? andList(choice.options ?? []) : `${choice.label} yes and no`} plus "All". Show how many ${c.n.many} each filter has.` : `Add "All" and "Recent" filters (recent = added in the last 7 days) and show how many ${c.n.many} each has.` },
        { title: `Sort by ${sortable.label}`, detail: `Add a sort control (${sortable.label}, newest or largest first and the reverse). Sort a copy ([...list].sort) so the original order is kept. Remember the chosen sort in the URL query or localStorage.` },
      ],
      hints: ['Keep search, filter and sort as three small functions you apply in a row.', 'An empty result needs its own message: "No matches for …".'],
      acceptance: ['Typing filters the list immediately.', 'Filters and search work together.', 'Sorting does not change the saved order.', 'No matches shows a helpful message.'],
      repo: { paths: [c.stack.key === 'vanilla' ? 'app.js' : 'src/**'] },
      self_check: ['Why derive the visible list instead of storing a filtered copy?', 'What is the time complexity of filtering then sorting n items?'],
      commit: 'feat: search, filter and sort',
      topics: kit(c).topics.state,
    };
  },
};

const routing: StageTemplate<Ctx> = {
  id: 'routing',
  minutes: [20, 25, 15],
  build: (c) => ({
    title: 'Pages and routing',
    goal: `Each ${c.n.one} has its own page with a shareable address, and unknown addresses show a not-found page.`,
    steps: [
      { title: 'Add the router', detail: `Set up routes for the list, ${an(c.n.one)} detail page and a not-found page.`, code: `${kit(c).router.install}\n\n${kit(c).router.code(c)}` },
      { title: 'Build the detail page', detail: `Read the id from the address, load that ${c.n.one} and show every field. Handle a missing id with a "${c.n.One} not found" message and a link back.` },
      { title: 'Link the pages', detail: 'Make each card link to its detail page, and add a Back link on the detail page. Check that reloading a detail page still works.' },
    ],
    hints: ['Use real links (anchor elements) for navigation, not click handlers on divs, so open-in-new-tab works.', 'On a static host, set a fallback to index.html so deep links do not 404.'],
    acceptance: [`Every ${c.n.one} has its own address.`, 'Reloading a detail page works.', 'An unknown address shows the not-found page.'],
    repo: { paths: [c.stack.key === 'vanilla' ? 'app.js' : 'src/**'] },
    self_check: ['What is client-side routing and why does a static host need a fallback?', 'Why put the id in the address instead of only in state?'],
    commit: 'feat: detail pages and routing',
    topics: kit(c).topics.ui,
  }),
};

function featureStage(index: 0 | 1 | 2): StageTemplate<Ctx> {
  return {
    id: `feature-${index + 1}`,
    minutes: [15, 25, 25, 15],
    build: (c) => {
      const f = c.idea.features[index];
      return {
        title: upperFirst(f),
        goal: `The app can ${f}, and it works for an empty list, one ${c.n.one} and many.`,
        steps: [
          { title: 'Plan it on paper', detail: `Write down what "${f}" needs: which ${c.n.one} fields it reads, what it shows, and where it sits on the screen. Sketch it in two minutes before coding.` },
          { title: 'Write the logic as a pure function', detail: `Put the calculation in a function that takes the list and returns what the screen needs, with no UI code in it. That makes it easy to test.`, code: `// ${c.stack.key === 'vanilla' ? 'logic.js' : 'src/logic.ts'}\nexport function ${index === 0 ? 'featureOne' : index === 1 ? 'featureTwo' : 'featureThree'}(${c.n.camelMany}${c.stack.key === 'vanilla' ? '' : `: ${c.n.Pascal}[]`}) {\n  // ${f}\n  // 1. handle the empty list first\n  // 2. compute the result in one pass if you can\n  // 3. return plain data, not markup\n}` },
          { title: 'Build the UI', detail: `Show the result clearly: a number, a small table or a simple chart built with CSS widths. Label units (₹, days, %) and keep it readable at 360 px.` },
          { title: 'Test the edge cases', detail: `Try an empty list, a single ${c.n.one}, very large values and a deleted ${c.n.one}. Fix anything that shows NaN, undefined or a crash.` },
        ],
        hints: ['If the result is derived from the list, compute it on render; do not store a second copy that can go stale.', 'Round only for display; keep full precision in calculations.'],
        acceptance: [`The app can ${f}.`, 'An empty list shows a sensible result, not NaN or an error.', 'The logic lives in a separate pure function.'],
        repo: { paths: [c.stack.key === 'vanilla' ? 'logic.js' : 'src/**'] },
        self_check: [`How did you make "${f}" correct for an empty list?`, 'Why keep this logic separate from the UI?'],
        commit: `feat: ${lowerFirst(f).slice(0, 60)}`,
        topics: kit(c).topics.state,
      };
    },
  };
}

const tests: StageTemplate<Ctx> = {
  id: 'tests',
  minutes: [15, 25, 25],
  build: (c) => ({
    title: 'Automated tests',
    goal: 'The main behaviour is covered by tests that run with one command.',
    steps: [
      { title: 'Set up the test runner', detail: `Install the test tools and add a "test" script so the tests run with one command (${kit(c).test.run}).`, code: kit(c).test.install },
      { title: 'Test the list', detail: `Write tests that the list shows an empty message, shows one card per ${c.n.one}, and that Delete calls the delete handler.`, code: kit(c).test.code(c) },
      { title: 'Test the logic', detail: 'Test the pure functions (search, filter, sort and your feature) with an empty list, one item and several items. Aim for every branch, not a coverage number.' },
    ],
    hints: ['Test what the user sees (text, roles, labels), not internal state.', 'A test that never fails is useless: break the code once to see it fail.'],
    acceptance: ['The tests run with one command.', 'At least 6 meaningful tests pass.', 'Breaking the list or the logic makes a test fail.'],
    repo: { paths: [c.stack.key === 'vanilla' ? '*.test.js' : 'src/**/*.{test,spec}.*'] },
    self_check: ['What is the difference between a unit test and an end-to-end test?', 'Which test gives you the most confidence for the least effort here, and why?'],
    commit: 'test: list and logic tests',
    topics: kit(c).topics.test,
  }),
};

const deploy: StageTemplate<Ctx> = {
  id: 'deploy',
  minutes: [15, 20, 20],
  build: (c) => ({
    title: 'Deploy and write the README',
    goal: 'The app is live on a free host and the README explains it in one minute.',
    steps: [
      { title: 'Build for production', detail: `Run the production build and preview it locally. Fix any warnings.${c.level !== 'beginner' ? ' The deployed app cannot reach json-server on your laptop: for the live demo, fall back to localStorage when the API is unreachable, or deploy the API too and point the client at it with an environment variable.' : ''}`, code: c.stack.key === 'vanilla' ? '# nothing to build: the files are served as they are' : c.stack.key === 'angular' ? 'ng build' : 'npm run build\nnpm run preview' },
      { title: 'Deploy', detail: `Import the GitHub repository on ${c.stack.host}, pick the framework preset and deploy. Every push to main now redeploys.` },
      { title: 'Write the README', detail: `Add: what the app does (one line), a screenshot or GIF, the live link, features, the stack, how to run it locally, and what you would build next.` },
    ],
    hints: ['Open the live site on your phone; mobile bugs show up here.', 'Put the live link at the top of the README and in the repository description.'],
    acceptance: ['The app is live and works on a phone.', 'The README has a screenshot, the live link and run steps.', 'Every push to main redeploys.'],
    repo: { paths: ['README.md'], readme: ['Features', 'Run locally'] },
    self_check: ['What happens between "git push" and the new version being live?', 'What would you change first with another week?'],
    commit: 'docs: README and deploy',
    topics: ['dev.dev-tools.deployment-basics'],
  }),
};

const release: StageTemplate<Ctx> = {
  id: 'release',
  minutes: [20, 20, 20, 20],
  build: (c) => ({
    title: 'Quality, CI and release',
    goal: 'Every push is linted, tested and built automatically; the live app passes an accessibility and performance audit.',
    steps: [
      { title: 'Continuous integration', detail: 'Add a GitHub Actions workflow that installs dependencies, runs the linter, the tests and the build on every push and pull request.', code: `# .github/workflows/ci.yml\nname: ci\non: [push, pull_request]\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with: { node-version: 22, cache: npm }\n      - run: npm ci\n      - run: npm run lint --if-present\n      - run: ${c.stack.key === 'angular' ? 'npx ng test --watch=false' : 'npx vitest run'}\n      - run: npm run build` },
      { title: 'Accessibility pass', detail: 'Use the app with the keyboard only (Tab, Enter, Escape), check focus is always visible, every input has a label, and colour contrast is at least 4.5:1. Run the Lighthouse accessibility audit and fix what it reports.' },
      { title: 'Performance pass', detail: 'Run Lighthouse on the live site. Lazy-load the detail page, compress images and remove unused code until performance is 90 or more on mobile.' },
      { title: 'Deploy and document', detail: `Deploy on ${c.stack.host}, add the CI badge, the Lighthouse scores, the live link and a short architecture note to the README.` },
    ],
    hints: ['Make CI fail on a broken test first, then fix it: that proves the pipeline works.', 'Lighthouse scores vary run to run; compare the median of three runs.'],
    acceptance: ['CI runs lint, tests and build on every push.', 'Keyboard-only use works everywhere.', 'Lighthouse accessibility and performance are 90 or more on mobile.', 'The README shows the live link and the CI badge.'],
    repo: { paths: ['.github/workflows/*.yml', 'README.md'], readme: ['Features', 'Run locally'] },
    self_check: ['What does your CI pipeline protect you from?', 'Which change gave the biggest performance gain, and why?'],
    commit: 'ci: lint, test and build on every push',
    topics: ['dev.frontend-engineering.web-performance', 'dev.web-foundations.accessibility'],
  }),
};

const STAGES: Record<ProjectLevel, StageTemplate<Ctx>[]> = {
  beginner: [setup, model, create, edit, persist, find, deploy],
  intermediate: [setup, model, create, edit, api, find, routing, featureStage(0), tests, deploy],
  advanced: [setup, model, create, edit, api, find, routing, featureStage(0), featureStage(1), featureStage(2), tests, release],
};

const stack = (s: Omit<StackDef, 'kind' | 'host'> & { host?: string }): StackDef => ({ kind: 'frontend', host: 'Vercel or Netlify', ...s });

export const FRONTEND = {
  stacks: [
    stack({ key: 'react', label: 'React + TypeScript (Vite)', short: 'React', tech: ['React', 'TypeScript', 'Vite'], skills: ['react', 'typescript', 'javascript', 'css'], roles: ['frontend', 'fullstack'], modules: ['dev.react'], levels: ['beginner', 'intermediate', 'advanced'], lang: 'tsx' }),
    stack({ key: 'vue', label: 'Vue 3 + TypeScript (Vite)', short: 'Vue', tech: ['Vue', 'TypeScript', 'Vite'], skills: ['vue', 'typescript', 'javascript', 'css'], roles: ['frontend', 'fullstack'], modules: ['dev.javascript'], levels: ['beginner', 'intermediate', 'advanced'], lang: 'vue' }),
    stack({ key: 'angular', label: 'Angular (standalone components and signals)', short: 'Angular', tech: ['Angular', 'TypeScript', 'RxJS'], skills: ['angular', 'typescript', 'css'], roles: ['frontend', 'fullstack'], modules: ['dev.javascript'], levels: ['beginner', 'intermediate', 'advanced'], lang: 'ts', host: 'Netlify or Firebase Hosting' }),
    stack({ key: 'sveltekit', label: 'SvelteKit + TypeScript', short: 'SvelteKit', tech: ['Svelte', 'SvelteKit', 'TypeScript'], skills: ['javascript', 'typescript', 'css'], roles: ['frontend', 'fullstack'], modules: ['dev.javascript'], levels: ['beginner', 'intermediate', 'advanced'], lang: 'svelte' }),
    stack({ key: 'vanilla', label: 'HTML, CSS and JavaScript', short: 'HTML/CSS/JS', tech: ['HTML', 'CSS', 'JavaScript'], skills: ['html', 'css', 'javascript', 'dom-apis'], roles: ['frontend', 'fullstack', 'design'], modules: ['dev.web-foundations'], levels: ['beginner', 'intermediate'], lang: 'js', host: 'GitHub Pages or Netlify' }),
  ],
  plan: {
    kind: 'frontend',
    stages: (level: ProjectLevel) => STAGES[level],
    outcome: (c: Ctx) =>
      `A deployed ${c.stack.short} app where users can add, edit, delete, search and sort ${c.n.many}${c.level === 'beginner' ? ', saved in the browser' : `, backed by a REST API, with ${c.level === 'advanced' ? 'all three features below, tests and CI' : 'a detail page per item and tests'}`}. Features: ${andList(c.idea.features.slice(0, c.level === 'advanced' ? 3 : c.level === 'intermediate' ? 1 : 0).map(lowerFirst)) || `add, edit and find ${c.n.many} quickly`}.`,
    readme: () => ['Live demo', 'Features', 'Tech stack', 'Run locally', 'Screenshots', "What's next"],
    deploy: (c: Ctx) => [
      `Push the code to a public GitHub repository.`,
      `Import the repository on ${c.stack.host} and choose the ${c.stack.short} preset.`,
      'Set any environment variables in the host settings, never in the code.',
      'Open the live link on a phone and a laptop and fix layout issues.',
      'Add the live link to the README, the repository description and your resume.',
    ],
    verbs: ['Built', 'Designed', 'Implemented', 'Shipped', 'Optimised', 'Tested'],
  } satisfies KindPlan<Ctx>,
};
