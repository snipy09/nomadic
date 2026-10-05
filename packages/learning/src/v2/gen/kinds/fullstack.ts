/**
 * Full-stack projects: an app idea built end to end, a React (or Next.js)
 * interface on top of an API and a database, in MERN, Next.js + Prisma,
 * Django + React, Spring Boot + React or FastAPI + React. Every level gets the
 * data model, the API, the list and form screens, tests and a deploy;
 * intermediate adds accounts and one feature; advanced adds all three
 * features, Docker, CI and an end-to-end test.
 */
import type { ProjectLevel } from '../../types';
import { JAVA_TYPE, an, andList, fieldList, lowerFirst, snakeOf, tsType, upperFirst } from '../names';
import type { Ctx, FieldDef, KindPlan, StackDef, StageTemplate } from '../types';

type Lang = 'mern' | 'nextjs-prisma' | 'django-react' | 'spring-react' | 'fastapi-react';
const lang = (c: Ctx) => c.stack.key as Lang;
const isNext = (c: Ctx) => lang(c) === 'nextjs-prisma';
const snakeJson = (c: Ctx) => lang(c) === 'django-react' || lang(c) === 'fastapi-react';

/** The JSON key a field has on the wire for this stack. */
const key = (c: Ctx, f: FieldDef) => (snakeJson(c) ? snakeOf(f.name) : f.name);
const idKey = (c: Ctx) => (lang(c) === 'mern' ? '_id' : 'id');
const apiPath = (c: Ctx) => `/api/${c.n.kebabMany}`;
const q = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const enumField = (c: Ctx) => c.fields.find((f) => f.type === 'enum' || f.type === 'boolean');
const numberField = (c: Ctx) => c.fields.find((f) => f.type === 'number' || f.type === 'money');

const PORT: Record<Lang, number> = { mern: 4000, 'nextjs-prisma': 3000, 'django-react': 8000, 'spring-react': 8080, 'fastapi-react': 8000 };
const SERVER_DIR: Record<Lang, string> = { mern: 'server/src/**', 'nextjs-prisma': 'app/**', 'django-react': 'server/core/**', 'spring-react': 'server/src/main/java/**', 'fastapi-react': 'server/app/**' };
const CLIENT_DIR = (c: Ctx) => (isNext(c) ? 'app/**' : 'client/src/**');
const SERVER_TOPIC: Record<Lang, string> = {
  mern: 'dev.backend-core.nodejs',
  'nextjs-prisma': 'dev.react.nextjs',
  'django-react': 'dev.backend-core.python-web-frameworks',
  'spring-react': 'dev.backend-core.java-spring',
  'fastapi-react': 'dev.backend-core.python-web-frameworks',
};

// ── Code per stack ──────────────────────────────────────────────────────────

const VITE_CLIENT = 'npm create vite@latest client -- --template react-ts\ncd client && npm install && cd ..';

const SETUP: Record<Lang, string> = {
  mern: `mkdir app && cd app\n${VITE_CLIENT}\nmkdir server && cd server\nnpm init -y\nnpm install express mongoose zod\nnpm install -D typescript tsx @types/express @types/node\nnpx tsc --init\ndocker run -d --name mongo -p 27017:27017 mongo:7`,
  'nextjs-prisma': 'npx create-next-app@latest app --ts --app --eslint --tailwind --src-dir=false\ncd app\nnpm install @prisma/client zod\nnpm install -D prisma\nnpx prisma init --datasource-provider postgresql\ndocker run -d --name pg -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=app -p 5432:5432 postgres:16',
  'django-react': `mkdir app && cd app\n${VITE_CLIENT}\nmkdir server && cd server\npython -m venv .venv\nsource .venv/bin/activate   # Windows: .venv\\Scripts\\activate\npip install django djangorestframework django-cors-headers psycopg[binary]\ndjango-admin startproject config .\npython manage.py startapp core`,
  'spring-react': `mkdir app && cd app\n${VITE_CLIENT}\n# start.spring.io: Java 21, Maven, Spring Boot 3, artifact "server"\n# dependencies: Spring Web, Spring Data JPA, Validation, PostgreSQL Driver, Flyway\nunzip server.zip\ncd server && ./mvnw spring-boot:run`,
  'fastapi-react': `mkdir app && cd app\n${VITE_CLIENT}\nmkdir server && cd server\npython -m venv .venv\nsource .venv/bin/activate   # Windows: .venv\\Scripts\\activate\npip install "fastapi[standard]" sqlmodel psycopg[binary]\nfastapi dev app/main.py`,
};

function proxy(c: Ctx): string {
  return `// client/vite.config.ts: the browser calls /api on the same origin, Vite forwards it\nimport { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({\n  plugins: [react()],\n  server: { proxy: { '/api': 'http://localhost:${PORT[lang(c)]}' } },\n});`;
}

function model(c: Ctx): string {
  const N = c.n;
  switch (lang(c)) {
    case 'mern':
      return `// server/src/models/${N.camel}.ts\nimport { Schema, model } from 'mongoose';\n\nconst ${N.camel}Schema = new Schema(\n  {\n${c.fields
        .map((f) => {
          const t = f.type === 'number' || f.type === 'money' ? 'Number' : f.type === 'date' ? 'Date' : f.type === 'boolean' ? 'Boolean' : 'String';
          const extra = [
            f.required ? 'required: true' : '',
            f.type === 'enum' && f.options?.length ? `enum: [${f.options.map(q).join(', ')}]` : '',
            f.type === 'text' || f.type === 'longtext' ? 'trim: true' : '',
            f.type === 'number' || f.type === 'money' ? 'min: 0' : '',
            f.type === 'boolean' ? 'default: false' : '',
          ].filter(Boolean);
          return `    ${f.name}: { type: ${t}${extra.length ? ', ' + extra.join(', ') : ''} },`;
        })
        .join('\n')}\n  },\n  { timestamps: true }\n);\n\nexport const ${N.Pascal} = model('${N.Pascal}', ${N.camel}Schema);`;
    case 'nextjs-prisma':
      return `// prisma/schema.prisma\nmodel ${N.Pascal} {\n  id        Int      @id @default(autoincrement())\n${c.fields
        .map((f) => {
          const t = f.type === 'number' ? 'Int' : f.type === 'money' ? 'Decimal' : f.type === 'date' ? 'DateTime' : f.type === 'boolean' ? 'Boolean' : 'String';
          const opt = f.required || f.type === 'boolean' ? '' : '?';
          const attr = f.type === 'money' ? ' @db.Decimal(12, 2)' : f.type === 'date' ? ' @db.Date' : f.type === 'boolean' ? ' @default(false)' : '';
          return `  ${f.name.padEnd(9)} ${t}${opt}${attr}`;
        })
        .join('\n')}\n  createdAt DateTime @default(now())\n}\n\n// then: npx prisma migrate dev --name init`;
    case 'django-react':
      return `# server/core/models.py\nfrom django.db import models\n\n\nclass ${N.Pascal}(models.Model):\n${c.fields
        .map((f) => {
          const opt = f.required ? '' : 'null=True, blank=True';
          switch (f.type) {
            case 'number':
              return `    ${snakeOf(f.name)} = models.PositiveIntegerField(${opt})`;
            case 'money':
              return `    ${snakeOf(f.name)} = models.DecimalField(max_digits=12, decimal_places=2${opt ? ', ' + opt : ''})`;
            case 'date':
              return `    ${snakeOf(f.name)} = models.DateField(${opt})`;
            case 'boolean':
              return `    ${snakeOf(f.name)} = models.BooleanField(default=False)`;
            case 'enum':
              return `    ${snakeOf(f.name)} = models.CharField(max_length=40, choices=[${(f.options ?? []).map((o) => `(${q(o)}, ${q(upperFirst(o))})`).join(', ')}], default=${q(f.options?.[0] ?? '')})`;
            case 'longtext':
              return `    ${snakeOf(f.name)} = models.TextField(${f.required ? '' : 'blank=True'})`;
            default:
              return `    ${snakeOf(f.name)} = models.CharField(max_length=200${f.required ? '' : ', blank=True'})`;
          }
        })
        .join('\n')}\n    created_at = models.DateTimeField(auto_now_add=True)\n\n# python manage.py makemigrations && python manage.py migrate`;
    case 'spring-react':
      return `// server/src/main/java/.../${N.Pascal}.java\n@Entity\n@Table(name = "${N.snakeMany}")\npublic class ${N.Pascal} {\n  @Id\n  @GeneratedValue(strategy = GenerationType.IDENTITY)\n  private Long id;\n\n${c.fields
        .map((f) => {
          const ann = f.required ? (f.type === 'text' || f.type === 'longtext' ? '  @NotBlank\n' : f.type === 'number' || f.type === 'money' ? '  @NotNull @PositiveOrZero\n' : '  @NotNull\n') : '';
          return `${ann}  private ${JAVA_TYPE[f.type]} ${f.name};`;
        })
        .join('\n')}\n\n  // getters and setters (or a Java record DTO for requests)\n}\n\npublic interface ${N.Pascal}Repository extends JpaRepository<${N.Pascal}, Long> {}`;
    case 'fastapi-react':
      return `# server/app/models.py\nfrom datetime import date\nfrom sqlmodel import Field, SQLModel\n\n\nclass ${N.Pascal}Base(SQLModel):\n${c.fields
        .map((f) => {
          const t = f.type === 'number' ? 'int' : f.type === 'money' ? 'float' : f.type === 'date' ? 'date' : f.type === 'boolean' ? 'bool' : 'str';
          const opt = f.required || f.type === 'boolean' ? '' : ' | None';
          const def = f.type === 'boolean' ? ' = False' : f.required ? (f.type === 'text' ? ' = Field(min_length=1, max_length=200)' : f.type === 'money' || f.type === 'number' ? ' = Field(ge=0)' : '') : ' = None';
          return `    ${snakeOf(f.name)}: ${t}${opt}${def}`;
        })
        .join('\n')}\n\n\nclass ${N.Pascal}(${N.Pascal}Base, table=True):\n    id: int | None = Field(default=None, primary_key=True)\n\n\nclass ${N.Pascal}Create(${N.Pascal}Base):\n    pass`;
  }
}

function api(c: Ctx): string {
  const N = c.n;
  switch (lang(c)) {
    case 'mern':
      return `// server/src/routes/${N.kebabMany}.ts\nconst router = Router();\n\nrouter.get('/', async (_req, res) => {\n  res.json(await ${N.Pascal}.find().sort({ createdAt: -1 }).limit(50));\n});\n\nrouter.post('/', async (req, res) => {\n  const parsed = ${N.Pascal}Input.safeParse(req.body);\n  if (!parsed.success) return res.status(400).json({ error: 'Check the highlighted fields', details: parsed.error.flatten().fieldErrors });\n  res.status(201).json(await ${N.Pascal}.create(parsed.data));\n});\n\nrouter.put('/:id', async (req, res) => {\n  if (!isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Not found' });\n  const parsed = ${N.Pascal}Input.safeParse(req.body);\n  if (!parsed.success) return res.status(400).json({ error: 'Check the highlighted fields', details: parsed.error.flatten().fieldErrors });\n  const doc = await ${N.Pascal}.findByIdAndUpdate(req.params.id, parsed.data, { new: true, runValidators: true });\n  doc ? res.json(doc) : res.status(404).json({ error: 'Not found' });\n});\n\nrouter.delete('/:id', async (req, res) => {\n  const doc = isValidObjectId(req.params.id) && (await ${N.Pascal}.findByIdAndDelete(req.params.id));\n  res.status(doc ? 204 : 404).end();\n});\n\napp.use('${apiPath(c)}', router);`;
    case 'nextjs-prisma':
      return `// app/${N.kebabMany}/actions.ts\n'use server';\nimport { revalidatePath } from 'next/cache';\nimport { prisma } from '@/lib/prisma';\nimport { ${N.Pascal}Input } from '@/lib/validation';\n\nexport type FormState = { error?: string; fields?: Record<string, string[]> };\n\nexport async function create${N.Pascal}(_prev: FormState, form: FormData): Promise<FormState> {\n  const parsed = ${N.Pascal}Input.safeParse(Object.fromEntries(form));\n  if (!parsed.success) return { error: 'Check the highlighted fields', fields: parsed.error.flatten().fieldErrors };\n  await prisma.${N.camel}.create({ data: parsed.data });\n  revalidatePath('/${N.kebabMany}');\n  return {};\n}\n\nexport async function delete${N.Pascal}(id: number) {\n  await prisma.${N.camel}.delete({ where: { id } });\n  revalidatePath('/${N.kebabMany}');\n}`;
    case 'django-react':
      return `# server/core/serializers.py\nclass ${N.Pascal}Serializer(serializers.ModelSerializer):\n    class Meta:\n        model = ${N.Pascal}\n        fields = ['id', ${c.fields.map((f) => `'${snakeOf(f.name)}'`).join(', ')}, 'created_at']\n        read_only_fields = ['id', 'created_at']\n\n\n# server/core/views.py\nclass ${N.Pascal}ViewSet(viewsets.ModelViewSet):\n    queryset = ${N.Pascal}.objects.order_by('-id')\n    serializer_class = ${N.Pascal}Serializer\n\n\n# server/config/urls.py\nrouter = DefaultRouter(trailing_slash=False)\nrouter.register('${N.kebabMany}', ${N.Pascal}ViewSet)\nurlpatterns = [path('api/', include(router.urls))]`;
    case 'spring-react':
      return `@RestController\n@RequestMapping("${apiPath(c)}")\npublic class ${N.Pascal}Controller {\n  private final ${N.Pascal}Repository repo;\n\n  public ${N.Pascal}Controller(${N.Pascal}Repository repo) {\n    this.repo = repo;\n  }\n\n  @GetMapping\n  public List<${N.Pascal}> list() {\n    return repo.findAll(Sort.by(Sort.Direction.DESC, "id"));\n  }\n\n  @PostMapping\n  @ResponseStatus(HttpStatus.CREATED)\n  public ${N.Pascal} create(@Valid @RequestBody ${N.Pascal} body) {\n    return repo.save(body);\n  }\n\n  @DeleteMapping("/{id}")\n  @ResponseStatus(HttpStatus.NO_CONTENT)\n  public void delete(@PathVariable Long id) {\n    if (!repo.existsById(id)) throw new ResponseStatusException(HttpStatus.NOT_FOUND);\n    repo.deleteById(id);\n  }\n}`;
    case 'fastapi-react':
      return `# server/app/main.py\nrouter = APIRouter(prefix='${apiPath(c)}')\n\n\n@router.get('', response_model=list[${N.Pascal}])\ndef list_${N.snakeMany}(session: SessionDep):\n    return session.exec(select(${N.Pascal}).order_by(${N.Pascal}.id.desc()).limit(50)).all()\n\n\n@router.post('', response_model=${N.Pascal}, status_code=201)\ndef create_${N.snake}(data: ${N.Pascal}Create, session: SessionDep):\n    item = ${N.Pascal}.model_validate(data)\n    session.add(item)\n    session.commit()\n    session.refresh(item)\n    return item\n\n\n@router.delete('/{item_id}', status_code=204)\ndef delete_${N.snake}(item_id: int, session: SessionDep):\n    item = session.get(${N.Pascal}, item_id)\n    if not item:\n        raise HTTPException(status_code=404, detail='${N.One} not found')\n    session.delete(item)\n    session.commit()\n\n\napp.include_router(router)`;
  }
}

/** The React type for one row as the API returns it. */
function rowType(c: Ctx): string {
  const idT = lang(c) === 'mern' ? 'string' : 'number';
  return `export type ${c.n.Pascal} = {\n  ${idKey(c)}: ${idT};\n${c.fields.map((f) => `  ${key(c, f)}${f.required || f.type === 'boolean' ? '' : '?'}: ${f.type === 'money' && lang(c) === 'django-react' ? 'string' : tsType(f)};`).join('\n')}\n};`;
}

function listComponent(c: Ctx): string {
  const N = c.n;
  const extra = c.fields.find((f) => f !== c.titleField && f.type !== 'longtext');
  if (isNext(c)) {
    return `// app/${N.kebabMany}/page.tsx: a server component reads the database directly\nimport { prisma } from '@/lib/prisma';\nimport { ${N.Pascal}Form } from './${N.Pascal}Form';\n\nexport default async function ${N.PascalMany}Page() {\n  const items = await prisma.${N.camel}.findMany({ orderBy: { id: 'desc' }, take: 50 });\n  return (\n    <main className="mx-auto max-w-2xl p-6">\n      <h1 className="text-2xl font-semibold">${N.Many}</h1>\n      <${N.Pascal}Form />\n      {items.length === 0 ? (\n        <p>No ${N.many} yet. Add your first one above.</p>\n      ) : (\n        <ul className="divide-y">\n          {items.map((x) => (\n            <li key={x.id} className="py-2">{x.${c.titleField.name}}${extra ? ` <span className="text-sm text-gray-500">{String(x.${extra.name} ?? '')}</span>` : ''}</li>\n          ))}\n        </ul>\n      )}\n    </main>\n  );\n}\n// app/${N.kebabMany}/loading.tsx and error.tsx give the loading and error states`;
  }
  return `// client/src/${N.Pascal}List.tsx\nimport { useCallback, useEffect, useState } from 'react';\nimport type { ${N.Pascal} } from './types';\n\nexport function ${N.Pascal}List({ refresh }: { refresh: number }) {\n  const [items, setItems] = useState<${N.Pascal}[] | null>(null);\n  const [error, setError] = useState<string | null>(null);\n\n  const load = useCallback(async () => {\n    setError(null);\n    try {\n      const res = await fetch('${apiPath(c)}');\n      if (!res.ok) throw new Error('HTTP ' + res.status);\n      setItems(await res.json());\n    } catch {\n      setError('Could not load ${N.many}.');\n    }\n  }, []);\n\n  useEffect(() => {\n    void load();\n  }, [load, refresh]);\n\n  if (error) return <p role="alert">{error} <button onClick={load}>Try again</button></p>;\n  if (!items) return <p aria-busy="true">Loading ${N.many}…</p>;\n  if (!items.length) return <p>No ${N.many} yet. Add your first one above.</p>;\n  return (\n    <ul>\n      {items.map((x) => (\n        <li key={x.${idKey(c)}}>{x.${key(c, c.titleField)}}${extra ? ` <small>{String(x.${key(c, extra)} ?? '')}</small>` : ''}</li>\n      ))}\n    </ul>\n  );\n}`;
}

const inputType = (f: FieldDef) =>
  f.type === 'longtext' ? 'textarea' : f.type === 'enum' ? 'select' : f.type === 'boolean' ? 'checkbox' : f.type === 'number' || f.type === 'money' ? 'number' : f.type === 'date' ? 'date' : 'text';

function fieldsConfig(c: Ctx): string {
  return `const FIELDS: Field[] = [\n${c.fields
    .map((f) => `  { name: ${q(key(c, f))}, label: ${q(upperFirst(f.label))}, type: '${inputType(f)}'${f.required ? ', required: true' : ''}${f.type === 'enum' ? `, options: [${(f.options ?? []).map(q).join(', ')}]` : ''} },`)
    .join('\n')}\n];`;
}

const FIELD_JSX = `      {FIELDS.map((f) => (\n        <label key={f.name}>\n          {f.label}\n          {f.type === 'textarea' ? (\n            <textarea name={f.name} required={f.required} />\n          ) : f.type === 'select' ? (\n            <select name={f.name}>{f.options!.map((o) => <option key={o}>{o}</option>)}</select>\n          ) : (\n            <input name={f.name} type={f.type} required={f.required} step={f.type === 'number' ? 'any' : undefined} />\n          )}\n        </label>\n      ))}`;

function formComponent(c: Ctx): string {
  const N = c.n;
  const head = `type Field = { name: string; label: string; type: 'text' | 'textarea' | 'number' | 'date' | 'select' | 'checkbox'; required?: boolean; options?: string[] };\n${fieldsConfig(c)}`;
  if (isNext(c)) {
    return `// app/${N.kebabMany}/${N.Pascal}Form.tsx\n'use client';\nimport { useActionState } from 'react';\nimport { create${N.Pascal}, type FormState } from './actions';\n\n${head}\n\nexport function ${N.Pascal}Form() {\n  const [state, action, pending] = useActionState<FormState, FormData>(create${N.Pascal}, {});\n  return (\n    <form action={action} className="my-4 grid gap-2">\n${FIELD_JSX}\n      {state.error && <p role="alert">{state.error}</p>}\n      <button disabled={pending}>{pending ? 'Saving…' : 'Add'}</button>\n    </form>\n  );\n}`;
  }
  return `// client/src/${N.Pascal}Form.tsx\nimport { useState, type FormEvent } from 'react';\n\n${head}\n\nfunction read(form: FormData, f: Field) {\n  const v = form.get(f.name);\n  if (f.type === 'checkbox') return form.has(f.name);\n  if (f.type === 'number') return v === '' ? null : Number(v);\n  return v === '' ? null : v;\n}\n\nexport function ${N.Pascal}Form({ onSaved }: { onSaved: () => void }) {\n  const [error, setError] = useState<string | null>(null);\n  const [saving, setSaving] = useState(false);\n\n  async function submit(e: FormEvent<HTMLFormElement>) {\n    e.preventDefault();\n    const el = e.currentTarget;\n    const form = new FormData(el);\n    const body = Object.fromEntries(FIELDS.map((f) => [f.name, read(form, f)]));\n    setSaving(true);\n    setError(null);\n    const res = await fetch('${apiPath(c)}', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });\n    setSaving(false);\n    if (!res.ok) return setError('Could not save: check the fields and try again.');\n    el.reset();\n    onSaved();\n  }\n\n  return (\n    <form onSubmit={submit}>\n${FIELD_JSX}\n      {error && <p role="alert">{error}</p>}\n      <button disabled={saving}>{saving ? 'Saving…' : 'Add'}</button>\n    </form>\n  );\n}`;
}

function sharedValidation(c: Ctx): string {
  const N = c.n;
  const z = c.fields
    .map((f) => {
      const num = isNext(c) ? 'z.coerce.number()' : 'z.number()';
      let t =
        f.type === 'number'
          ? `${num}.int().min(0)`
          : f.type === 'money'
            ? `${num}.min(0)`
            : f.type === 'boolean'
              ? isNext(c)
                ? "z.preprocess((v) => v === 'on' || v === true, z.boolean())"
                : 'z.boolean()'
              : f.type === 'date'
                ? 'z.coerce.date()'
                : f.type === 'enum'
                  ? `z.enum([${(f.options ?? []).map(q).join(', ')}])`
                  : `z.string().trim().min(1, '${upperFirst(f.label)} is required').max(${f.type === 'longtext' ? 2000 : 200})`;
      // A form sends '' for an empty optional input; treat it as missing.
      if (!f.required && f.type !== 'boolean') t = isNext(c) ? `z.preprocess((v) => (v === '' ? undefined : v), ${t}.optional())` : `${t}.nullish()`;
      return `  ${f.name}: ${t},`;
    })
    .join('\n');
  return `// ${isNext(c) ? 'lib/validation.ts' : 'server/src/validation.ts'}\nimport { z } from 'zod';\n\nexport const ${N.Pascal}Input = z.object({\n${z}\n});\nexport type ${N.Pascal}Input = z.infer<typeof ${N.Pascal}Input>;`;
}

const AUTH: Record<Lang, string> = {
  mern: "// npm install bcrypt jsonwebtoken cookie-parser\nrouter.post('/login', async (req, res) => {\n  const user = await User.findOne({ email: req.body.email });\n  if (!user || !(await bcrypt.compare(req.body.password, user.passwordHash))) {\n    return res.status(401).json({ error: 'Wrong email or password' });\n  }\n  const token = jwt.sign({ sub: user.id }, process.env.JWT_SECRET!, { expiresIn: '7d' });\n  res.cookie('session', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });\n  res.json({ email: user.email });\n});\n\nexport function requireUser(req, res, next) {\n  try {\n    req.userId = (jwt.verify(req.cookies.session ?? '', process.env.JWT_SECRET!) as { sub: string }).sub;\n    next();\n  } catch {\n    res.status(401).json({ error: 'Sign in first' });\n  }\n}",
  'nextjs-prisma': "// npm install next-auth@beta @auth/prisma-adapter\n// auth.ts\nexport const { handlers, auth, signIn, signOut } = NextAuth({\n  adapter: PrismaAdapter(prisma),\n  providers: [GitHub],\n  session: { strategy: 'database' },\n});\n\n// in a server action or page:\nconst session = await auth();\nif (!session?.user?.id) redirect('/login');\nconst items = await prisma.item.findMany({ where: { userId: session.user.id } });",
  'django-react': "# Use Django's session login with CSRF for a same-origin React app.\n# settings.py\nREST_FRAMEWORK = {\n    'DEFAULT_AUTHENTICATION_CLASSES': ['rest_framework.authentication.SessionAuthentication'],\n    'DEFAULT_PERMISSION_CLASSES': ['rest_framework.permissions.IsAuthenticated'],\n}\n\n# views.py\nclass ItemViewSet(viewsets.ModelViewSet):\n    def get_queryset(self):\n        return Item.objects.filter(owner=self.request.user)\n\n    def perform_create(self, serializer):\n        serializer.save(owner=self.request.user)\n# React sends the csrftoken cookie back in the X-CSRFToken header",
  'spring-react': '// spring-boot-starter-security: session cookie log-in for the React app\n@Bean\nSecurityFilterChain web(HttpSecurity http) throws Exception {\n  return http\n    .authorizeHttpRequests(a -> a.requestMatchers("/api/auth/**").permitAll().anyRequest().authenticated())\n    .formLogin(f -> f.loginProcessingUrl("/api/auth/login")\n      .successHandler((req, res, auth) -> res.setStatus(200))\n      .failureHandler((req, res, e) -> res.sendError(401)))\n    .csrf(c -> c.csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse()))\n    .build();\n}\n// store passwords with BCryptPasswordEncoder',
  'fastapi-react': "# pip install pyjwt \"pwdlib[argon2]\"\n@router.post('/api/auth/login')\ndef login(body: LoginIn, response: Response, session: SessionDep):\n    user = session.exec(select(User).where(User.email == body.email)).first()\n    if not user or not password_hash.verify(body.password, user.password_hash):\n        raise HTTPException(401, 'Wrong email or password')\n    token = jwt.encode({'sub': str(user.id)}, settings.secret_key, algorithm='HS256')\n    response.set_cookie('session', token, httponly=True, samesite='lax', secure=settings.prod)\n    return {'email': user.email}",
};

function apiTest(c: Ctx): { run: string; code: string } {
  const N = c.n;
  switch (lang(c)) {
    case 'mern':
      return { run: 'npx vitest', code: `// server/test/${N.kebabMany}.test.ts (npm install -D vitest supertest mongodb-memory-server)\nit('rejects an empty ${N.one} with 400', async () => {\n  const res = await request(app).post('${apiPath(c)}').send({});\n  expect(res.status).toBe(400);\n});\n\nit('creates and lists ${an(N.one)}', async () => {\n  const created = await request(app).post('${apiPath(c)}').send(sample);\n  expect(created.status).toBe(201);\n  const list = await request(app).get('${apiPath(c)}');\n  expect(list.body.map((x: { _id: string }) => x._id)).toContain(created.body._id);\n});` };
    case 'nextjs-prisma':
      return { run: 'npx vitest', code: `// lib/validation.test.ts\nimport { describe, expect, it } from 'vitest';\nimport { ${N.Pascal}Input } from './validation';\n\ndescribe('${N.Pascal}Input', () => {\n  it('rejects an empty form', () => {\n    expect(${N.Pascal}Input.safeParse({}).success).toBe(false);\n  });\n\n  it('trims text and rejects a blank ${c.titleField.label}', () => {\n    const r = ${N.Pascal}Input.safeParse({ ${c.titleField.name}: '   ' });\n    expect(r.success).toBe(false);\n  });\n});` };
    case 'django-react':
      return { run: 'python manage.py test', code: `class ${N.Pascal}ApiTests(APITestCase):\n    def test_rejects_empty_body(self):\n        res = self.client.post('/api/${N.kebabMany}', {}, format='json')\n        self.assertEqual(res.status_code, 400)\n\n    def test_unknown_id_is_404(self):\n        res = self.client.get('/api/${N.kebabMany}/999999')\n        self.assertEqual(res.status_code, 404)` };
    case 'spring-react':
      return { run: './mvnw test', code: `@SpringBootTest\n@AutoConfigureMockMvc\nclass ${N.Pascal}ControllerTest {\n  @Autowired MockMvc mvc;\n\n  @Test\n  void rejectsEmptyBody() throws Exception {\n    mvc.perform(post("${apiPath(c)}").contentType(MediaType.APPLICATION_JSON).content("{}"))\n      .andExpect(status().isBadRequest());\n  }\n}` };
    case 'fastapi-react':
      return { run: 'pytest', code: `client = TestClient(app)\n\n\ndef test_rejects_empty_${N.snake}():\n    assert client.post('${apiPath(c)}', json={}).status_code == 422\n\n\ndef test_unknown_id_is_404():\n    assert client.delete('${apiPath(c)}/999999').status_code == 404` };
  }
}

function uiTest(c: Ctx): string {
  const N = c.n;
  return `// e2e/${N.kebabMany}.spec.ts (npm init playwright@latest)\nimport { expect, test } from '@playwright/test';\n\ntest('adds ${an(N.one)} and sees it in the list', async ({ page }) => {\n  await page.goto('${isNext(c) ? `/${N.kebabMany}` : '/'}');\n  await page.getByLabel(${q(upperFirst(c.titleField.label))}).fill('Playwright ${N.one}');\n${c.fields
    .filter((f) => f.required && f !== c.titleField && f.type !== 'enum' && f.type !== 'boolean')
    .slice(0, 3)
    .map((f) => `  await page.getByLabel(${q(upperFirst(f.label))}).fill(${f.type === 'date' ? "'2026-10-05'" : f.type === 'number' || f.type === 'money' ? "'3'" : "'Some text'"});`)
    .join('\n')}\n  await page.getByRole('button', { name: 'Add' }).click();\n  await expect(page.getByText('Playwright ${N.one}')).toBeVisible();\n});`;
}

const COMPOSE = (c: Ctx) =>
  lang(c) === 'mern'
    ? `services:\n  mongo:\n    image: mongo:7\n    volumes: [mongodata:/data/db]\n  server:\n    build: ./server\n    environment: { MONGO_URL: "mongodb://mongo:27017/app" }\n    depends_on: [mongo]\n  client:\n    build: ./client   # nginx serving the Vite build, proxying /api to server\n    ports: ["8080:80"]\n    depends_on: [server]\nvolumes:\n  mongodata:`
    : isNext(c)
      ? `services:\n  db:\n    image: postgres:16\n    environment: { POSTGRES_PASSWORD: dev, POSTGRES_DB: app }\n    volumes: [pgdata:/var/lib/postgresql/data]\n    healthcheck: { test: ["CMD", "pg_isready", "-U", "postgres"], interval: 5s }\n  web:\n    build: .   # next.config: output: 'standalone'\n    ports: ["3000:3000"]\n    environment: { DATABASE_URL: "postgresql://postgres:dev@db:5432/app" }\n    depends_on: { db: { condition: service_healthy } }\nvolumes:\n  pgdata:`
      : `services:\n  db:\n    image: postgres:16\n    environment: { POSTGRES_PASSWORD: dev, POSTGRES_DB: app }\n    volumes: [pgdata:/var/lib/postgresql/data]\n    healthcheck: { test: ["CMD", "pg_isready", "-U", "postgres"], interval: 5s }\n  server:\n    build: ./server\n    environment: { DATABASE_URL: "postgresql://postgres:dev@db:5432/app" }\n    depends_on: { db: { condition: service_healthy } }\n  client:\n    build: ./client   # nginx serving the Vite build, proxying /api to server\n    ports: ["8080:80"]\n    depends_on: [server]\nvolumes:\n  pgdata:`;

const dbName = (c: Ctx) => (lang(c) === 'mern' ? 'MongoDB' : 'PostgreSQL');

// ── Stages ──────────────────────────────────────────────────────────────────

const setup: StageTemplate<Ctx> = {
  id: 'setup',
  minutes: [20, 15, 15, 10],
  build: (c) => ({
    title: 'One repository, two halves talking',
    goal: isNext(c)
      ? 'The Next.js app runs locally against PostgreSQL in Docker, and the code is on GitHub.'
      : `The React client and the ${c.stack.short.split(' + ')[0]} server run side by side, the client reaches the server through a dev proxy, and the code is on GitHub.`,
    steps: [
      { title: 'Create the projects', detail: isNext(c) ? 'Create the Next.js app with the App Router and TypeScript, add Prisma and start PostgreSQL in Docker.' : `Create one folder with client/ (React + TypeScript with Vite) and server/ (${c.stack.label.split(' + ').slice(1).join(' + ') || c.stack.label}), and start ${dbName(c)} in Docker.`, code: SETUP[lang(c)] },
      isNext(c)
        ? { title: 'Connect the database', detail: 'Put DATABASE_URL in .env (git ignores it), create lib/prisma.ts that reuses one PrismaClient in development, and check the connection with npx prisma studio.', code: "// lib/prisma.ts\nimport { PrismaClient } from '@prisma/client';\n\nconst g = globalThis as unknown as { prisma?: PrismaClient };\nexport const prisma = g.prisma ?? new PrismaClient();\nif (process.env.NODE_ENV !== 'production') g.prisma = prisma;\n\n// .env\nDATABASE_URL=\"postgresql://postgres:dev@localhost:5432/app\"" }
        : { title: 'Proxy /api to the server', detail: `In development the browser loads the client from Vite and calls /api on the same origin; Vite forwards those calls to the server on port ${PORT[lang(c)]}. This avoids CORS problems now and matches production later.`, code: proxy(c) },
      { title: 'Health check end to end', detail: isNext(c) ? 'Add app/api/health/route.ts returning { status: "ok" } and open /api/health in the browser.' : 'Add GET /api/health on the server returning {"status": "ok"}, fetch it from the client on load and show "API: ok" in a corner. Seeing it proves both halves and the proxy work.' },
      { title: 'Commit and push', detail: 'Add a .gitignore (node_modules, virtual environments, build output, .env), commit and push to a new public GitHub repository. Add a README line on how to start both halves.' },
    ],
    hints: ['Run the two halves in two terminals; a root package.json script with concurrently can start both.', 'Commit a .env.example with dummy values; never the real .env.'],
    acceptance: ['Both halves start with documented commands.', 'The client shows the API health status.', 'Secrets and connection strings come from .env, which is not committed.'],
    repo: { paths: ['.gitignore', isNext(c) ? 'app/**' : 'client/**'] },
    self_check: ['Why use a dev proxy instead of calling the API on another port?', 'What is CORS, and when would you need to configure it?'],
    commit: 'chore: client, server and database running locally',
    topics: [isNext(c) ? 'dev.react.nextjs' : 'dev.react.react', SERVER_TOPIC[lang(c)]],
  }),
};

const modelStage: StageTemplate<Ctx> = {
  id: 'model',
  minutes: [15, 20, 15],
  build: (c) => ({
    title: `Model the ${c.n.one}`,
    goal: `${upperFirst(an(c.n.one))} is stored in ${dbName(c)} with types and rules, and one validation schema describes valid input.`,
    steps: [
      { title: 'Design the data', detail: `${upperFirst(an(c.n.one))} has ${fieldList(c.fields)}. Decide what is required, the allowed values and the limits, and note them in the README.` },
      { title: 'Write the model', detail: lang(c) === 'mern' ? 'Define the Mongoose schema with types, required fields, allowed values and timestamps.' : 'Define the model and create the table with a migration, so every machine gets the same schema.', code: model(c) },
      lang(c) === 'mern' || isNext(c)
        ? { title: 'One validation schema', detail: 'Describe valid input once with zod. The server uses it on every write; the form uses the same rules to show errors early.', code: sharedValidation(c) }
        : { title: 'Seed three rows', detail: `Add three realistic ${c.n.many} (rupees for money, real dates) through the admin or a seed script and check the types come back right.` },
    ],
    hints: ['Store money as a decimal (or integer paise), never as a float.', 'Rules that protect data belong in the database or model, not only in the form.'],
    acceptance: [`The ${c.n.one} model exists with every field and rule.`, 'Required fields cannot be saved empty.', 'Allowed values are enforced on the server.'],
    repo: { paths: [lang(c) === 'mern' ? 'server/src/models/**' : isNext(c) ? 'prisma/schema.prisma' : SERVER_DIR[lang(c)]] },
    self_check: ['Why validate on the server even though the form validates too?', `Which ${c.n.one} field would you index first, and why?`],
    commit: `feat: ${c.n.one} model`,
    topics: [lang(c) === 'mern' ? 'dev.databases.nosql' : 'dev.databases.database-design', 'dev.databases.orms'],
  }),
};

const apiStage: StageTemplate<Ctx> = {
  id: 'api',
  minutes: [20, 25, 15],
  build: (c) => ({
    title: isNext(c) ? 'Server actions for create and delete' : `The ${c.n.many} API`,
    goal: isNext(c) ? `Creating and deleting ${c.n.many} runs on the server through server actions with validation.` : `${apiPath(c)} lists, creates, updates and deletes ${c.n.many} with the right status codes and one error shape.`,
    steps: [
      { title: 'Plan the operations', detail: isNext(c) ? 'Pages read data in server components; changes go through server actions that validate input, write with Prisma and revalidate the page. Plan create, update and delete.' : `GET ${apiPath(c)} (list), POST (create, 201), PUT /:id (update), DELETE /:id (204). Unknown ids are 404 and bad input is 400 with per-field details, never 500.` },
      { title: 'Implement them', detail: isNext(c) ? 'Write the actions. Validate with the zod schema and return field errors to the form instead of throwing.' : 'Write the handlers, validating every write and returning the saved row.', code: api(c) },
      { title: 'Try every operation', detail: isNext(c) ? 'Call the actions from a quick test page or the form: a valid save, an empty title, a delete. Check the rows in Prisma Studio.' : 'Call each route with curl or an HTTP client and check the status codes and bodies. Save the commands in the README.', code: isNext(c) ? undefined : `curl -i localhost:${PORT[lang(c)]}${apiPath(c)}\ncurl -i -X POST localhost:${PORT[lang(c)]}${apiPath(c)} -H 'Content-Type: application/json' -d '{}'` },
    ].map((s) => (s.code === undefined ? { title: s.title, detail: s.detail } : s)),
    hints: ['Return the created row from a create, so the client can show it at once.', 'Keep handlers thin: validate, call a function, return.'],
    acceptance: isNext(c)
      ? ['Create, update and delete work through server actions.', 'Invalid input returns field errors, not an exception.', 'Pages show fresh data after a change.']
      : ['All operations work against the database.', 'Create returns 201; delete returns 204.', 'Bad input returns 400 with details; unknown ids return 404.'],
    repo: { paths: [SERVER_DIR[lang(c)]] },
    self_check: isNext(c) ? ['What runs on the server and what in the browser in your app?', 'Why revalidate the path after a change?'] : ['Why 201 for a create and 204 for a delete?', 'How do you stop user input from changing your database query?'],
    commit: isNext(c) ? `feat: ${c.n.one} server actions` : `feat: ${c.n.many} API`,
    topics: ['dev.backend-core.rest-api-design', SERVER_TOPIC[lang(c)]],
  }),
};

const listStage: StageTemplate<Ctx> = {
  id: 'list-ui',
  minutes: [15, 25, 15],
  build: (c) => ({
    title: `The ${c.n.many} screen`,
    goal: `The app lists ${c.n.many} from the database with clear loading, empty and error states.`,
    steps: [
      { title: 'Share the types', detail: isNext(c) ? 'Prisma generates the row type; import it where you need it instead of writing it again.' : 'Write the row type once on the client so every component agrees on the shape the API returns.', code: isNext(c) ? `import type { ${c.n.Pascal} } from '@prisma/client';` : rowType(c) },
      { title: 'Build the list', detail: `Show the newest ${c.n.many} first with the ${c.titleField.label} as the main line. Handle all three states: loading, nothing yet (with a hint to add one) and an error with a retry button.`, code: listComponent(c) },
      { title: 'Make it usable', detail: 'Check it at 360 px wide and at full width, with the keyboard only and with 0, 1 and 50 rows. Long text must wrap, not break the layout.' },
    ],
    hints: ['Test the error state by stopping the server while the page is open.', 'Format money as rupees with Intl.NumberFormat(\'en-IN\', { style: \'currency\', currency: \'INR\' }).'],
    acceptance: [`${c.n.Many} from the database are listed, newest first.`, 'Loading, empty and error states all show something useful.', 'The page works at 360 px and with the keyboard.'],
    repo: { paths: [CLIENT_DIR(c)] },
    self_check: ['Why does every data screen need loading, empty and error states?', isNext(c) ? 'Server component or client component for this list, and why?' : 'What happens if a slow response arrives after a newer one?'],
    commit: `feat: ${c.n.many} list screen`,
    topics: [isNext(c) ? 'dev.react.nextjs' : 'dev.react.react'],
  }),
};

const formStage: StageTemplate<Ctx> = {
  id: 'form-ui',
  minutes: [25, 20, 20],
  build: (c) => ({
    title: `Add and remove ${c.n.many}`,
    goal: `A form adds ${an(c.n.one)} with clear errors, the list updates at once, and each row can be deleted after a confirmation.`,
    steps: [
      { title: 'Build the form', detail: `One field per property: ${andList(c.fields.map((f) => `${f.label} (${inputType(f)})`))}. Every input has a visible label; required ones say so.`, code: formComponent(c) },
      { title: 'Show server errors', detail: 'When the server rejects the input, keep what the user typed and show the message next to the form (or each field). Disable the button while saving so a double click cannot create two rows.' },
      { title: 'Delete with confirmation', detail: `Add a delete button per row that asks "Delete this ${c.n.one}?" and removes the row only after the server confirms. If the delete fails, show an error and keep the row.` },
    ],
    hints: ['Use the label text in tests (getByLabel); it also proves the form is accessible.', 'An optimistic update with rollback feels fastest; refetching after a save is simpler. Pick one and be consistent.'],
    acceptance: [`A valid ${c.n.one} is saved and appears in the list without a reload.`, 'Invalid input shows a clear message and keeps the typed values.', 'The save button cannot submit twice.', 'Delete asks first and handles failure.'],
    repo: { paths: [CLIENT_DIR(c)] },
    self_check: ['What is the difference between client-side and server-side validation, and why do you need both?', 'How did you prevent duplicate submissions?'],
    commit: `feat: add and delete ${c.n.many}`,
    topics: [isNext(c) ? 'dev.react.nextjs' : 'dev.react.react', 'dev.javascript.typescript'],
  }),
};

const authStage: StageTemplate<Ctx> = {
  id: 'auth',
  minutes: [20, 25, 20, 15],
  build: (c) => ({
    title: 'Accounts and private data',
    goal: `People sign up and log in; each ${c.n.one} belongs to one user and nobody sees anyone else's.`,
    steps: [
      { title: 'Users and ownership', detail: `Add a user model (email unique, password hash${isNext(c) ? ' or OAuth account' : ''}) and an owner on every ${c.n.one}.` },
      { title: 'Log in with a secure cookie', detail: isNext(c) ? 'Add Auth.js with a provider and database sessions. Check the session in every server action and page that touches data.' : 'Log in sets an httpOnly, SameSite=Lax session cookie (Secure in production), so scripts in the page cannot read it. Hash passwords with bcrypt or argon2.', code: AUTH[lang(c)] },
      { title: 'Scope every query', detail: `Filter every read, update and delete by the signed-in user. Take the user from the session, never from the request body. Another user's ${c.n.one} is 404.` },
      { title: 'Log-in and sign-up screens', detail: 'Add the two screens, redirect to the log-in page when the API answers 401, and add a log-out button. Show "Wrong email or password" for both mistakes.' },
    ],
    hints: ['Test with two browsers (or a private window) signed in as two users.', 'Rate-limit the log-in route.'],
    acceptance: ['Passwords are stored only as hashes (or delegated to OAuth).', 'The session cookie is httpOnly.', "A user can never read or change another user's data.", 'Signed-out users are sent to the log-in screen.'],
    repo: { paths: [SERVER_DIR[lang(c)], CLIENT_DIR(c)] },
    self_check: ['Cookie session or token in localStorage: what are the risks of each?', 'What is CSRF, and does your app need protection against it?'],
    commit: 'feat: accounts and per-user data',
    topics: ['dev.backend-core.authentication', 'dev.backend-scale.web-security'],
  }),
};

function featureStage(i: 0 | 1 | 2): StageTemplate<Ctx> {
  return {
    id: `feature-${i + 1}`,
    minutes: [15, 25, 20],
    build: (c) => {
      const f = c.idea.features[i];
      const ef = enumField(c);
      const nf = numberField(c);
      return {
        title: upperFirst(f),
        goal: `The app can ${f}, from the database to the screen, with a test.`,
        steps: [
          { title: 'Design it end to end', detail: `Sketch the screen for "${f}" and decide the data it needs: ${isNext(c) ? 'a query in a server component or a server action' : 'one API endpoint with its JSON shape'}, plus loading, empty and error states.` },
          { title: 'Build the data side', detail: `Let the database do the work (a query with filters, grouping or sums) and return only what the screen needs${ef ? `, for example counts per ${ef.label}` : ''}${nf ? ` or totals of ${nf.label}` : ''}.` },
          { title: 'Build the screen and test it', detail: `Add the screen or panel, check it with no ${c.n.many}, one and many, and add one automated test for the data side.` },
        ],
        hints: ['Ship the smallest useful version first, then polish.', 'Keep the response shape small and stable; the screen should not have to reshape it.'],
        acceptance: [`The app can ${f}.`, 'Loading, empty and error states are handled.', 'At least one test covers the new logic.'],
        repo: { paths: [SERVER_DIR[lang(c)], CLIENT_DIR(c)] },
        self_check: [`Walk through "${f}" from the click to the database and back.`, 'What would you change if there were a million rows?'],
        commit: `feat: ${lowerFirst(f).slice(0, 60)}`,
        topics: [SERVER_TOPIC[lang(c)], isNext(c) ? 'dev.react.nextjs' : 'dev.react.react'],
      };
    },
  };
}

const testStage: StageTemplate<Ctx> = {
  id: 'tests',
  minutes: [20, 25, 10],
  build: (c) => {
    const t = apiTest(c);
    return {
      title: 'Tests for both halves',
      goal: 'The server rules and the main screen are covered by automated tests that run with one command each.',
      steps: [
        { title: isNext(c) ? 'Test the rules' : 'Test the API', detail: `Cover bad input and missing rows first, then the happy path, against a separate test database. Run with: ${t.run}`, code: t.code },
        { title: 'Test the main flow in a browser', detail: 'Add one Playwright test that opens the app, adds a row through the form and sees it in the list. It catches the bugs unit tests miss: wiring, proxies and forms.', code: uiTest(c) },
        { title: 'One command for everything', detail: 'Add a root script (for example npm test) that runs the server tests and then the browser test, and note it in the README. Break one rule on purpose and check a test fails.' },
      ],
      hints: ['Give each test its own data so tests do not depend on order.', 'Use getByLabel and getByRole in browser tests; they break less than CSS selectors.'],
      acceptance: ['Server tests cover 400 and 404 cases and a successful create.', 'One browser test adds a row through the form.', 'Both test suites run with one command each.'],
      repo: { paths: ['e2e/**', isNext(c) ? 'lib/**' : 'server/**'] },
      self_check: ['What does an end-to-end test catch that a unit test does not?', 'How do you keep tests from touching your real data?'],
      commit: 'test: server and end-to-end tests',
      topics: ['dev.dev-tools.testing-fundamentals'],
    };
  },
};

const dockerStage: StageTemplate<Ctx> = {
  id: 'docker-ci',
  minutes: [20, 20, 20],
  build: (c) => ({
    title: 'Docker Compose and CI',
    goal: 'The whole app starts with docker compose up, and every push runs both test suites in GitHub Actions.',
    steps: [
      { title: 'Dockerfiles', detail: isNext(c) ? 'Write a multi-stage Dockerfile: install, prisma generate, next build, then copy only the standalone output into a slim image that runs as a non-root user.' : 'Write a multi-stage Dockerfile for the server (build, then a slim runtime image as a non-root user) and one for the client (Vite build, then nginx serving dist/). Add .dockerignore files.' },
      { title: 'Compose the app', detail: isNext(c) ? 'Build Next.js with output: "standalone" in a multi-stage Dockerfile and run it next to PostgreSQL.' : 'Give the server a Dockerfile, build the client into static files served by nginx (which also proxies /api to the server), and run all three with Compose.', code: COMPOSE(c) },
      { title: 'CI pipeline', detail: 'Add a GitHub Actions workflow that installs, type-checks or lints, runs the server tests against a database service container, runs the Playwright test against the built app and builds the images. Add the badge to the README.' },
    ],
    hints: ['Cache dependencies in CI (actions/setup-node or setup-python with cache) to keep runs fast.', 'Upload the Playwright report as an artifact when the test fails.'],
    acceptance: ['docker compose up starts a working app with its database.', 'CI runs server tests and the browser test on every push.', 'Containers run as a non-root user.'],
    repo: { paths: ['docker-compose.yml', '.github/workflows/*.yml'] },
    self_check: ['Why serve the client from nginx in production instead of the Vite dev server?', 'What does your CI stop from reaching main?'],
    commit: 'ci: compose and test pipeline',
    topics: ['dev.containers-ci.docker', 'dev.containers-ci.ci-cd'],
  }),
};

const deployStage: StageTemplate<Ctx> = {
  id: 'deploy',
  minutes: [15, 25, 15],
  build: (c) => ({
    title: 'Deploy and document',
    goal: 'The app is live with a managed database, and the README shows what it does and how it is built.',
    steps: [
      { title: 'Production settings', detail: 'Read every address and secret from environment variables, turn off debug output, allow only your own client origin, and make sure migrations run as part of the release, not by hand.' },
      {
        title: 'Deploy',
        detail: isNext(c)
          ? 'Create a free PostgreSQL database (Neon or Supabase), deploy the app on Vercel from GitHub, set DATABASE_URL and secrets there and run prisma migrate deploy in the build.'
          : `Create a free ${dbName(c)} database (${lang(c) === 'mern' ? 'MongoDB Atlas' : 'Neon or the host\'s own'}), deploy the server on ${c.stack.host} and the client as a static site. Point the client's /api at the server (a rewrite rule on the static host) so cookies stay same-site.`,
      },
      { title: 'README and screenshots', detail: 'Write: what it does, the live link, two screenshots, the architecture in three lines (client, server, database), how to run it locally, the tests, and what you would build next.' },
    ],
    hints: ['Free servers sleep when idle; mention the first slow request in the README.', 'Check the live app in a private window as a new user.'],
    acceptance: ['The app works on its live address with a real database.', 'Secrets exist only in the hosts\' settings.', 'The README has the live link, screenshots and run steps.'],
    repo: { paths: ['README.md'], readme: ['Live demo', 'Run locally'] },
    self_check: ['Draw the path of one request in production, from the browser to the database.', 'How would you roll back a broken release?'],
    commit: 'docs: README and deployment',
    topics: ['dev.dev-tools.deployment-basics'],
  }),
};

const STAGES: Record<ProjectLevel, StageTemplate<Ctx>[]> = {
  beginner: [setup, modelStage, apiStage, listStage, formStage, testStage, deployStage],
  intermediate: [setup, modelStage, apiStage, listStage, formStage, authStage, featureStage(0), testStage, deployStage],
  advanced: [setup, modelStage, apiStage, listStage, formStage, authStage, featureStage(0), featureStage(1), featureStage(2), testStage, dockerStage, deployStage],
};

const ALL: ProjectLevel[] = ['beginner', 'intermediate', 'advanced'];
const stack = (s: Omit<StackDef, 'kind' | 'levels' | 'roles'>): StackDef => ({ kind: 'fullstack', levels: ALL, roles: ['fullstack', 'frontend', 'backend'], ...s });

export const FULLSTACK = {
  stacks: [
    stack({ key: 'mern', label: 'MERN: MongoDB + Express + React + Node.js', short: 'MERN', tech: ['MongoDB', 'Express', 'React', 'Node.js', 'TypeScript'], skills: ['react', 'nodejs', 'nosql', 'rest-api-design', 'typescript'], modules: ['dev.react', 'dev.backend-core', 'dev.databases'], lang: 'tsx', host: 'Render (server) and Vercel or Netlify (client)' }),
    stack({ key: 'nextjs-prisma', label: 'Next.js (App Router) + Prisma + PostgreSQL', short: 'Next.js', tech: ['Next.js', 'React', 'TypeScript', 'Prisma', 'PostgreSQL'], skills: ['nextjs', 'react', 'typescript', 'orms', 'postgresql'], modules: ['dev.react', 'dev.databases'], lang: 'tsx', host: 'Vercel' }),
    stack({ key: 'django-react', label: 'Django REST Framework + React + PostgreSQL', short: 'Django + React', tech: ['Django', 'DRF', 'React', 'TypeScript', 'PostgreSQL'], skills: ['python-web-frameworks', 'react', 'rest-api-design', 'postgresql', 'python'], modules: ['dev.react', 'dev.backend-core', 'dev.databases'], lang: 'python', host: 'Render (server) and Netlify (client)' }),
    stack({ key: 'spring-react', label: 'Spring Boot 3 + React + PostgreSQL', short: 'Spring + React', tech: ['Java', 'Spring Boot', 'React', 'TypeScript', 'PostgreSQL'], skills: ['java-spring', 'react', 'rest-api-design', 'postgresql', 'orms'], modules: ['dev.react', 'dev.backend-core', 'dev.databases'], lang: 'java', host: 'Render (server) and Netlify (client)' }),
    stack({ key: 'fastapi-react', label: 'FastAPI + React + PostgreSQL', short: 'FastAPI + React', tech: ['Python', 'FastAPI', 'SQLModel', 'React', 'PostgreSQL'], skills: ['python-web-frameworks', 'react', 'rest-api-design', 'postgresql', 'python'], modules: ['dev.react', 'dev.backend-core', 'dev.databases'], lang: 'python', host: 'Render (server) and Netlify (client)' }),
  ],
  plan: {
    kind: 'fullstack',
    stages: (level: ProjectLevel) => STAGES[level],
    outcome: (c: Ctx) =>
      `A deployed ${c.stack.short} app for ${c.n.many}: a responsive interface with forms and clear states on top of a validated API and a ${dbName(c)} database, with server and browser tests${c.level === 'beginner' ? '' : `, accounts with private data, and a way to ${lowerFirst(c.idea.features[0])}`}${c.level === 'advanced' ? `, plus ${lowerFirst(c.idea.features[1])}, ${lowerFirst(c.idea.features[2])}, Docker Compose and CI` : ''}.`,
    readme: () => ['Live demo', 'Screenshots', 'Features', 'Architecture', 'Tech stack', 'Run locally', 'Tests', "What's next"],
    deploy: (c: Ctx) => [
      'Push the code to a public GitHub repository.',
      `Create a free managed ${dbName(c)} database and copy its connection string.`,
      `Deploy on ${c.stack.host} from the repository and set the connection string and secrets in the host settings.`,
      'Run the migrations (or schema push) as part of the release.',
      'Open the live app in a private window, sign up as a new user and add a row.',
      'Put the live link and two screenshots in the README and the link on your resume.',
    ],
    verbs: ['Built', 'Designed', 'Implemented', 'Secured', 'Tested', 'Deployed', 'Shipped'],
  } satisfies KindPlan<Ctx>,
};
