/**
 * Backend projects: an app idea built as a REST API with PostgreSQL in
 * Express, NestJS, FastAPI, Django REST Framework, Spring Boot or Go. Every
 * level gets CRUD, validation, list queries, tests and a deploy; intermediate
 * adds authentication and one feature; advanced adds all three features,
 * Docker, CI and hardening.
 */
import type { ProjectLevel } from '../../types';
import { GO_TYPE, JAVA_TYPE, SQL_TYPE, an, andList, fieldList, lowerFirst, pascalOf, snakeOf, upperFirst } from '../names';
import type { Ctx, FieldDef, KindPlan, StackDef, StageTemplate } from '../types';

type Lang = 'express' | 'nestjs' | 'fastapi' | 'django-rest' | 'spring-boot' | 'go-api';
const lang = (c: Ctx) => c.stack.key as Lang;

const path = (c: Ctx) => `/api/${c.n.kebabMany}`;
const col = (f: FieldDef) => snakeOf(f.name);
const required = (c: Ctx) => c.fields.filter((f) => f.required);
const enumField = (c: Ctx) => c.fields.find((f) => f.type === 'enum' || f.type === 'boolean');
const numberField = (c: Ctx) => c.fields.find((f) => f.type === 'number' || f.type === 'money');
const pyStr = (s: string) => `'${s.replace(/'/g, "\\'")}'`;

function sampleJson(c: Ctx): string {
  const v = (f: FieldDef) =>
    f.type === 'number' ? '3' : f.type === 'money' ? '1200' : f.type === 'date' ? '"2026-10-05"' : f.type === 'boolean' ? 'true' : f.type === 'enum' ? `"${f.options?.[0] ?? ''}"` : `"Sample ${f.label}"`;
  return `{${c.fields.map((f) => `"${f.name}": ${v(f)}`).join(', ')}}`;
}

function sqlTable(c: Ctx): string {
  const lines = c.fields.map((f) => {
    const check = f.type === 'enum' && f.options?.length ? ` CHECK (${col(f)} IN (${f.options.map((o) => `'${o}'`).join(', ')}))` : '';
    const nn = f.required ? ' NOT NULL' : '';
    return `  ${col(f)} ${SQL_TYPE[f.type]}${nn}${check},`;
  });
  return `CREATE TABLE ${c.n.snakeMany} (\n  id BIGSERIAL PRIMARY KEY,\n${lines.join('\n')}\n  created_at TIMESTAMPTZ NOT NULL DEFAULT now()\n);`;
}

// ── Code per stack ──────────────────────────────────────────────────────────

const SETUP: Record<Lang, string> = {
  express: 'mkdir api && cd api\nnpm init -y\nnpm install express pg zod\nnpm install -D typescript tsx @types/express @types/pg @types/node\nnpx tsc --init\n# package.json: "dev": "tsx watch src/server.ts"\nnpm run dev',
  nestjs: 'npm install -g @nestjs/cli\nnest new api\ncd api\nnpm install prisma @prisma/client class-validator class-transformer\nnpx prisma init\nnpm run start:dev',
  fastapi: 'mkdir api && cd api\npython -m venv .venv\nsource .venv/bin/activate   # Windows: .venv\\Scripts\\activate\npip install "fastapi[standard]" sqlmodel psycopg[binary]\nfastapi dev app/main.py',
  'django-rest': 'mkdir api && cd api\npython -m venv .venv\nsource .venv/bin/activate   # Windows: .venv\\Scripts\\activate\npip install django djangorestframework psycopg[binary]\ndjango-admin startproject config .\npython manage.py startapp core\npython manage.py runserver',
  'spring-boot': '# start.spring.io: Java 21, Maven, Spring Boot 3\n# dependencies: Spring Web, Spring Data JPA, Validation, PostgreSQL Driver, Flyway\nunzip api.zip && cd api\n./mvnw spring-boot:run',
  'go-api': 'mkdir api && cd api\ngo mod init example.com/api\ngo get github.com/jackc/pgx/v5\ngo run ./cmd/api',
};

const HEALTH: Record<Lang, string> = {
  express: "import express from 'express';\n\nconst app = express();\napp.use(express.json());\napp.get('/health', (_req, res) => res.json({ status: 'ok' }));\n\nconst port = Number(process.env.PORT ?? 3000);\napp.listen(port, () => console.log(`API on port ${port}`));",
  nestjs: "@Controller('health')\nexport class HealthController {\n  @Get()\n  check() {\n    return { status: 'ok' };\n  }\n}\n// add HealthController to AppModule.controllers",
  fastapi: "from fastapi import FastAPI\n\napp = FastAPI(title='API')\n\n\n@app.get('/health')\ndef health():\n    return {'status': 'ok'}",
  'django-rest': "# core/views.py\nfrom rest_framework.decorators import api_view\nfrom rest_framework.response import Response\n\n\n@api_view(['GET'])\ndef health(request):\n    return Response({'status': 'ok'})\n\n# config/urls.py: path('health/', health)",
  'spring-boot': '@RestController\npublic class HealthController {\n  @GetMapping("/health")\n  public Map<String, String> health() {\n    return Map.of("status", "ok");\n  }\n}',
  'go-api': 'package main\n\nimport (\n\t"encoding/json"\n\t"log"\n\t"net/http"\n)\n\nfunc main() {\n\tmux := http.NewServeMux()\n\tmux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {\n\t\tjson.NewEncoder(w).Encode(map[string]string{"status": "ok"})\n\t})\n\tlog.Fatal(http.ListenAndServe(":8080", mux))\n}',
};

const PORT: Record<Lang, number> = { express: 3000, nestjs: 3000, fastapi: 8000, 'django-rest': 8000, 'spring-boot': 8080, 'go-api': 8080 };

function model(c: Ctx): string {
  const N = c.n;
  switch (lang(c)) {
    case 'express':
    case 'go-api':
      return `-- migrations/001_create_${N.snakeMany}.sql\n${sqlTable(c)}`;
    case 'nestjs':
      return `// prisma/schema.prisma\nmodel ${N.Pascal} {\n  id        Int      @id @default(autoincrement())\n${c.fields
        .map((f) => {
          const t = f.type === 'number' ? 'Int' : f.type === 'money' ? 'Decimal  @db.Decimal(12, 2)' : f.type === 'date' ? 'DateTime @db.Date' : f.type === 'boolean' ? 'Boolean  @default(false)' : 'String';
          const opt = f.required || f.type === 'boolean' ? '' : '?';
          const [base, ...rest] = t.split(' ');
          return `  ${f.name.padEnd(9)} ${base}${opt}${rest.length ? ' ' + rest.join(' ').trim() : ''} @map("${col(f)}")`;
        })
        .join('\n')}\n  createdAt DateTime @default(now()) @map("created_at")\n\n  @@map("${N.snakeMany}")\n}\n\n// then: npx prisma migrate dev --name init`;
    case 'fastapi':
      return `from datetime import date\nfrom sqlmodel import Field, SQLModel\n\n\nclass ${N.Pascal}Base(SQLModel):\n${c.fields
        .map((f) => {
          const t = f.type === 'number' ? 'int' : f.type === 'money' ? 'float' : f.type === 'date' ? 'date' : f.type === 'boolean' ? 'bool' : 'str';
          const opt = f.required || f.type === 'boolean' ? '' : ' | None';
          const def = f.type === 'boolean' ? ' = False' : f.required ? (f.type === 'text' ? ' = Field(min_length=1, max_length=200)' : f.type === 'money' || f.type === 'number' ? ' = Field(ge=0)' : '') : ' = None';
          return `    ${snakeOf(f.name)}: ${t}${opt}${def}`;
        })
        .join('\n')}\n\n\nclass ${N.Pascal}(${N.Pascal}Base, table=True):\n    __tablename__ = '${N.snakeMany}'\n    id: int | None = Field(default=None, primary_key=True)\n\n\nclass ${N.Pascal}Create(${N.Pascal}Base):\n    pass`;
    case 'django-rest':
      return `# core/models.py\nfrom django.db import models\n\n\nclass ${N.Pascal}(models.Model):\n${c.fields
        .map((f) => {
          const blank = f.required ? '' : 'null=True, blank=True';
          switch (f.type) {
            case 'number':
              return `    ${col(f)} = models.IntegerField(${blank})`;
            case 'money':
              return `    ${col(f)} = models.DecimalField(max_digits=12, decimal_places=2${blank ? `, ${blank}` : ''})`;
            case 'date':
              return `    ${col(f)} = models.DateField(${blank})`;
            case 'boolean':
              return `    ${col(f)} = models.BooleanField(default=False)`;
            case 'enum':
              return `    ${col(f)} = models.CharField(max_length=40, choices=[${(f.options ?? []).map((o) => `(${pyStr(o)}, ${pyStr(upperFirst(o))})`).join(', ')}], default=${pyStr(f.options?.[0] ?? '')})`;
            case 'longtext':
              return `    ${col(f)} = models.TextField(${blank ? 'blank=True' : ''})`;
            default:
              return `    ${col(f)} = models.CharField(max_length=200${blank ? ', blank=True' : ''})`;
          }
        })
        .join('\n')}\n    created_at = models.DateTimeField(auto_now_add=True)\n\n# then: python manage.py makemigrations && python manage.py migrate`;
    case 'spring-boot':
      return `@Entity\n@Table(name = "${N.snakeMany}")\npublic class ${N.Pascal} {\n  @Id\n  @GeneratedValue(strategy = GenerationType.IDENTITY)\n  private Long id;\n\n${c.fields
        .map((f) => {
          const ann = f.required ? (f.type === 'text' || f.type === 'longtext' ? '  @NotBlank\n' : f.type === 'money' || f.type === 'number' ? '  @NotNull @PositiveOrZero\n' : '  @NotNull\n') : '';
          return `${ann}  private ${JAVA_TYPE[f.type]} ${f.name};`;
        })
        .join('\n')}\n\n  // getters and setters\n}\n\npublic interface ${N.Pascal}Repository extends JpaRepository<${N.Pascal}, Long> {}\n\n// src/main/resources/db/migration/V1__create_${N.snakeMany}.sql holds the CREATE TABLE`;
  }
}

function crud(c: Ctx): string {
  const N = c.n;
  const cols = c.fields.map(col);
  const params = c.fields.map((_, i) => `$${i + 1}`).join(', ');
  switch (lang(c)) {
    case 'express':
      return `const router = Router();\n\nrouter.get('/', async (_req, res) => {\n  const { rows } = await pool.query('SELECT * FROM ${N.snakeMany} ORDER BY id DESC LIMIT 20');\n  res.json(rows);\n});\n\nrouter.get('/:id', async (req, res) => {\n  const { rows } = await pool.query('SELECT * FROM ${N.snakeMany} WHERE id = $1', [req.params.id]);\n  if (!rows[0]) return res.status(404).json({ error: '${N.One} not found' });\n  res.json(rows[0]);\n});\n\nrouter.post('/', async (req, res) => {\n  const b = req.body;\n  const { rows } = await pool.query(\n    'INSERT INTO ${N.snakeMany} (${cols.join(', ')}) VALUES (${params}) RETURNING *',\n    [${c.fields.map((f) => `b.${f.name}`).join(', ')}]\n  );\n  res.status(201).json(rows[0]);\n});\n\nrouter.delete('/:id', async (req, res) => {\n  const { rowCount } = await pool.query('DELETE FROM ${N.snakeMany} WHERE id = $1', [req.params.id]);\n  res.status(rowCount ? 204 : 404).end();\n});\n\napp.use('${path(c)}', router);`;
    case 'nestjs':
      return `@Controller('${N.kebabMany}')\nexport class ${N.PascalMany}Controller {\n  constructor(private readonly prisma: PrismaService) {}\n\n  @Get()\n  list() {\n    return this.prisma.${N.camel}.findMany({ orderBy: { id: 'desc' }, take: 20 });\n  }\n\n  @Get(':id')\n  async one(@Param('id', ParseIntPipe) id: number) {\n    const item = await this.prisma.${N.camel}.findUnique({ where: { id } });\n    if (!item) throw new NotFoundException('${N.One} not found');\n    return item;\n  }\n\n  @Post()\n  create(@Body() dto: Create${N.Pascal}Dto) {\n    return this.prisma.${N.camel}.create({ data: dto });\n  }\n\n  @Patch(':id')\n  update(@Param('id', ParseIntPipe) id: number, @Body() dto: Update${N.Pascal}Dto) {\n    return this.prisma.${N.camel}.update({ where: { id }, data: dto });\n  }\n\n  @Delete(':id')\n  @HttpCode(204)\n  async remove(@Param('id', ParseIntPipe) id: number) {\n    await this.prisma.${N.camel}.delete({ where: { id } });\n  }\n}\n// global prefix: app.setGlobalPrefix('api') in main.ts`;
    case 'fastapi':
      return `router = APIRouter(prefix='${path(c)}', tags=['${N.many}'])\n\n\n@router.get('/', response_model=list[${N.Pascal}])\ndef list_${N.snakeMany}(session: SessionDep, offset: int = 0, limit: int = Query(20, le=100)):\n    return session.exec(select(${N.Pascal}).order_by(${N.Pascal}.id.desc()).offset(offset).limit(limit)).all()\n\n\n@router.get('/{item_id}', response_model=${N.Pascal})\ndef get_${N.snake}(item_id: int, session: SessionDep):\n    item = session.get(${N.Pascal}, item_id)\n    if not item:\n        raise HTTPException(status_code=404, detail='${N.One} not found')\n    return item\n\n\n@router.post('/', response_model=${N.Pascal}, status_code=201)\ndef create_${N.snake}(data: ${N.Pascal}Create, session: SessionDep):\n    item = ${N.Pascal}.model_validate(data)\n    session.add(item)\n    session.commit()\n    session.refresh(item)\n    return item\n\n\n@router.delete('/{item_id}', status_code=204)\ndef delete_${N.snake}(item_id: int, session: SessionDep):\n    item = session.get(${N.Pascal}, item_id)\n    if not item:\n        raise HTTPException(status_code=404, detail='${N.One} not found')\n    session.delete(item)\n    session.commit()`;
    case 'django-rest':
      return `# core/serializers.py\nclass ${N.Pascal}Serializer(serializers.ModelSerializer):\n    class Meta:\n        model = ${N.Pascal}\n        fields = ['id', ${c.fields.map((f) => `'${col(f)}'`).join(', ')}, 'created_at']\n        read_only_fields = ['id', 'created_at']\n\n\n# core/views.py\nclass ${N.Pascal}ViewSet(viewsets.ModelViewSet):\n    queryset = ${N.Pascal}.objects.order_by('-id')\n    serializer_class = ${N.Pascal}Serializer\n\n\n# config/urls.py\nrouter = DefaultRouter()\nrouter.register('${N.kebabMany}', ${N.Pascal}ViewSet)\nurlpatterns = [path('api/', include(router.urls))]`;
    case 'spring-boot':
      return `@RestController\n@RequestMapping("${path(c)}")\npublic class ${N.Pascal}Controller {\n  private final ${N.Pascal}Repository repo;\n\n  public ${N.Pascal}Controller(${N.Pascal}Repository repo) {\n    this.repo = repo;\n  }\n\n  @GetMapping\n  public Page<${N.Pascal}> list(Pageable pageable) {\n    return repo.findAll(pageable);\n  }\n\n  @GetMapping("/{id}")\n  public ${N.Pascal} one(@PathVariable Long id) {\n    return repo.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "${N.One} not found"));\n  }\n\n  @PostMapping\n  @ResponseStatus(HttpStatus.CREATED)\n  public ${N.Pascal} create(@Valid @RequestBody ${N.Pascal} body) {\n    return repo.save(body);\n  }\n\n  @DeleteMapping("/{id}")\n  @ResponseStatus(HttpStatus.NO_CONTENT)\n  public void delete(@PathVariable Long id) {\n    if (!repo.existsById(id)) throw new ResponseStatusException(HttpStatus.NOT_FOUND);\n    repo.deleteById(id);\n  }\n}`;
    case 'go-api':
      return `type ${N.Pascal} struct {\n\tID int64 \`json:"id"\`\n${c.fields.map((f) => `\t${pascalOf(f.name)} ${f.required ? '' : '*'}${GO_TYPE[f.type]} \`json:"${f.name}"\``).join('\n')}\n}\n\nfunc (h *Handler) routes(mux *http.ServeMux) {\n\tmux.HandleFunc("GET ${path(c)}", h.list)\n\tmux.HandleFunc("POST ${path(c)}", h.create)\n\tmux.HandleFunc("GET ${path(c)}/{id}", h.get)\n\tmux.HandleFunc("PUT ${path(c)}/{id}", h.update)\n\tmux.HandleFunc("DELETE ${path(c)}/{id}", h.delete)\n}\n\nfunc (h *Handler) get(w http.ResponseWriter, r *http.Request) {\n\tid, err := strconv.ParseInt(r.PathValue("id"), 10, 64)\n\tif err != nil {\n\t\twriteError(w, http.StatusBadRequest, "id must be a number")\n\t\treturn\n\t}\n\tvar x ${N.Pascal}\n\terr = h.db.QueryRow(r.Context(), "SELECT id, ${cols.join(', ')} FROM ${N.snakeMany} WHERE id = $1", id).\n\t\tScan(&x.ID, ${c.fields.map((f) => `&x.${pascalOf(f.name)}`).join(', ')})\n\tif errors.Is(err, pgx.ErrNoRows) {\n\t\twriteError(w, http.StatusNotFound, "${N.one} not found")\n\t\treturn\n\t}\n\twriteJSON(w, http.StatusOK, x)\n}`;
  }
}

function validation(c: Ctx): string {
  const N = c.n;
  const req = required(c);
  switch (lang(c)) {
    case 'express':
      return `import { z } from 'zod';\n\nexport const ${N.Pascal}Input = z.object({\n${c.fields
        .map((f) => {
          let t =
            f.type === 'number' ? 'z.number().int().min(0)' : f.type === 'money' ? 'z.number().min(0)' : f.type === 'boolean' ? 'z.boolean()' : f.type === 'date' ? 'z.string().date()' : f.type === 'enum' ? `z.enum([${(f.options ?? []).map((o) => `'${o}'`).join(', ')}])` : `z.string().trim().min(1).max(${f.type === 'longtext' ? 2000 : 200})`;
          if (!f.required) t += '.optional()';
          return `  ${f.name}: ${t},`;
        })
        .join('\n')}\n});\n\n// in the POST and PUT handlers:\nconst parsed = ${N.Pascal}Input.safeParse(req.body);\nif (!parsed.success) {\n  return res.status(400).json({ error: 'Invalid ${N.one}', details: parsed.error.flatten().fieldErrors });\n}`;
    case 'nestjs':
      return `export class Create${N.Pascal}Dto {\n${c.fields
        .map((f) => {
          const opt = f.required ? '' : '  @IsOptional()\n';
          const v = f.type === 'number' ? '@IsInt() @Min(0)' : f.type === 'money' ? '@IsNumber() @Min(0)' : f.type === 'boolean' ? '@IsBoolean()' : f.type === 'date' ? '@IsDateString()' : f.type === 'enum' ? `@IsIn([${(f.options ?? []).map((o) => `'${o}'`).join(', ')}])` : '@IsString() @IsNotEmpty() @MaxLength(200)';
          return `${opt}  ${v}\n  ${f.name}${f.required ? '!' : '?'}: ${f.type === 'number' || f.type === 'money' ? 'number' : f.type === 'boolean' ? 'boolean' : 'string'};`;
        })
        .join('\n\n')}\n}\n\n// main.ts\napp.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));`;
    case 'fastapi':
      return `# Pydantic validates the body from the SQLModel fields and returns 422 with details.\n# Turn it into your one error format:\n@app.exception_handler(RequestValidationError)\nasync def invalid(request: Request, exc: RequestValidationError):\n    return JSONResponse(status_code=400, content={'error': 'Invalid ${N.one}', 'details': exc.errors()})`;
    case 'django-rest':
      return `class ${N.Pascal}Serializer(serializers.ModelSerializer):\n    # ...Meta as before\n\n${req
        .filter((f) => f.type === 'text')
        .slice(0, 1)
        .map((f) => `    def validate_${col(f)}(self, value):\n        if not value.strip():\n            raise serializers.ValidationError('${upperFirst(f.label)} cannot be blank.')\n        return value.strip()\n`)
        .join('')}\n# settings.py: REST_FRAMEWORK = {'EXCEPTION_HANDLER': 'core.errors.handler'} to return one error shape`;
    case 'spring-boot':
      return `@RestControllerAdvice\npublic class ApiErrors {\n  @ExceptionHandler(MethodArgumentNotValidException.class)\n  @ResponseStatus(HttpStatus.BAD_REQUEST)\n  public Map<String, Object> invalid(MethodArgumentNotValidException e) {\n    Map<String, String> details = new HashMap<>();\n    e.getBindingResult().getFieldErrors().forEach(f -> details.put(f.getField(), f.getDefaultMessage()));\n    return Map.of("error", "Invalid ${N.one}", "details", details);\n  }\n}`;
    case 'go-api':
      return `func (in ${N.Pascal}) validate() map[string]string {\n\terrs := map[string]string{}\n${req
        .map((f) =>
          f.type === 'text' || f.type === 'longtext'
            ? `\tif strings.TrimSpace(in.${pascalOf(f.name)}) == "" {\n\t\terrs["${f.name}"] = "required"\n\t}`
            : f.type === 'number' || f.type === 'money'
              ? `\tif in.${pascalOf(f.name)} < 0 {\n\t\terrs["${f.name}"] = "must be 0 or more"\n\t}`
              : `\t// check ${f.name}`
        )
        .join('\n')}\n\treturn errs\n}\n\nfunc writeError(w http.ResponseWriter, status int, msg string) {\n\twriteJSON(w, status, map[string]string{"error": msg})\n}`;
  }
}

function testCode(c: Ctx): { install: string; code: string; run: string } {
  const N = c.n;
  switch (lang(c)) {
    case 'express':
      return { install: 'npm install -D vitest supertest @types/supertest', run: 'npx vitest', code: `import request from 'supertest';\nimport { describe, expect, it } from 'vitest';\nimport { app } from '../src/app';\n\ndescribe('${path(c)}', () => {\n  it('rejects an invalid ${N.one} with 400', async () => {\n    const res = await request(app).post('${path(c)}').send({});\n    expect(res.status).toBe(400);\n  });\n\n  it('returns 404 for an unknown id', async () => {\n    const res = await request(app).get('${path(c)}/999999');\n    expect(res.status).toBe(404);\n  });\n});` };
    case 'nestjs':
      return { install: '# Nest ships Jest and supertest', run: 'npm run test:e2e', code: `it('POST /api/${N.kebabMany} rejects an empty body', () => {\n  return request(app.getHttpServer()).post('/api/${N.kebabMany}').send({}).expect(400);\n});\n\nit('GET /api/${N.kebabMany}/999999 is 404', () => {\n  return request(app.getHttpServer()).get('/api/${N.kebabMany}/999999').expect(404);\n});` };
    case 'fastapi':
      return { install: 'pip install pytest httpx', run: 'pytest', code: `from fastapi.testclient import TestClient\nfrom app.main import app\n\nclient = TestClient(app)\n\n\ndef test_rejects_invalid_${N.snake}():\n    assert client.post('${path(c)}/', json={}).status_code == 400\n\n\ndef test_unknown_id_is_404():\n    assert client.get('${path(c)}/999999').status_code == 404` };
    case 'django-rest':
      return { install: '# Django ships its test runner', run: 'python manage.py test', code: `from rest_framework.test import APITestCase\n\n\nclass ${N.Pascal}ApiTests(APITestCase):\n    def test_rejects_empty_body(self):\n        res = self.client.post('/api/${N.kebabMany}/', {}, format='json')\n        self.assertEqual(res.status_code, 400)\n\n    def test_unknown_id_is_404(self):\n        res = self.client.get('/api/${N.kebabMany}/999999/')\n        self.assertEqual(res.status_code, 404)` };
    case 'spring-boot':
      return { install: '# spring-boot-starter-test is already in pom.xml', run: './mvnw test', code: `@SpringBootTest\n@AutoConfigureMockMvc\nclass ${N.Pascal}ControllerTest {\n  @Autowired MockMvc mvc;\n\n  @Test\n  void rejectsEmptyBody() throws Exception {\n    mvc.perform(post("${path(c)}").contentType(MediaType.APPLICATION_JSON).content("{}"))\n      .andExpect(status().isBadRequest());\n  }\n\n  @Test\n  void unknownIdIs404() throws Exception {\n    mvc.perform(get("${path(c)}/999999")).andExpect(status().isNotFound());\n  }\n}` };
    case 'go-api':
      return { install: '# go test is built in', run: 'go test ./...', code: `func TestCreateRejectsEmptyBody(t *testing.T) {\n\th := newTestHandler(t)\n\treq := httptest.NewRequest(http.MethodPost, "${path(c)}", strings.NewReader("{}"))\n\trec := httptest.NewRecorder()\n\th.create(rec, req)\n\tif rec.Code != http.StatusBadRequest {\n\t\tt.Fatalf("want 400, got %d", rec.Code)\n\t}\n}` };
  }
}

const AUTH: Record<Lang, string> = {
  express: "import bcrypt from 'bcrypt';\nimport jwt from 'jsonwebtoken';\n\nrouter.post('/register', async (req, res) => {\n  const hash = await bcrypt.hash(req.body.password, 12);\n  // INSERT INTO users (email, password_hash) ... handle the unique email (409)\n});\n\nexport function requireUser(req, res, next) {\n  const token = req.headers.authorization?.replace('Bearer ', '');\n  try {\n    req.userId = (jwt.verify(token ?? '', process.env.JWT_SECRET!) as { sub: string }).sub;\n    next();\n  } catch {\n    res.status(401).json({ error: 'Sign in first' });\n  }\n}",
  nestjs: "// npm install @nestjs/jwt bcrypt\n@Injectable()\nexport class AuthService {\n  constructor(private prisma: PrismaService, private jwt: JwtService) {}\n\n  async login(email: string, password: string) {\n    const user = await this.prisma.user.findUnique({ where: { email } });\n    if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw new UnauthorizedException();\n    return { accessToken: await this.jwt.signAsync({ sub: user.id }) };\n  }\n}\n// protect routes with a guard that verifies the token and sets request.user",
  fastapi: "# pip install pyjwt \"pwdlib[argon2]\"\npassword_hash = PasswordHash.recommended()\n\n\ndef current_user(token: Annotated[str, Depends(oauth2_scheme)], session: SessionDep) -> User:\n    try:\n        payload = jwt.decode(token, settings.secret_key, algorithms=['HS256'])\n    except jwt.InvalidTokenError:\n        raise HTTPException(401, 'Sign in first')\n    user = session.get(User, int(payload['sub']))\n    if not user:\n        raise HTTPException(401, 'Sign in first')\n    return user",
  'django-rest': "# pip install djangorestframework-simplejwt\nREST_FRAMEWORK = {\n    'DEFAULT_AUTHENTICATION_CLASSES': ['rest_framework_simplejwt.authentication.JWTAuthentication'],\n    'DEFAULT_PERMISSION_CLASSES': ['rest_framework.permissions.IsAuthenticated'],\n}\n# urls: path('api/token/', TokenObtainPairView.as_view())\n# in the viewset: def get_queryset(self): return Model.objects.filter(owner=self.request.user)",
  'spring-boot': '// add spring-boot-starter-security and spring-boot-starter-oauth2-resource-server\n@Bean\nSecurityFilterChain api(HttpSecurity http) throws Exception {\n  return http\n    .csrf(c -> c.disable())\n    .authorizeHttpRequests(a -> a.requestMatchers("/api/auth/**", "/health").permitAll().anyRequest().authenticated())\n    .oauth2ResourceServer(o -> o.jwt(Customizer.withDefaults()))\n    .build();\n}\n// hash passwords with BCryptPasswordEncoder; never store them in plain text',
  'go-api': '// go get golang.org/x/crypto/bcrypt github.com/golang-jwt/jwt/v5\nfunc (h *Handler) requireUser(next http.HandlerFunc) http.HandlerFunc {\n\treturn func(w http.ResponseWriter, r *http.Request) {\n\t\traw := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")\n\t\ttok, err := jwt.Parse(raw, func(t *jwt.Token) (any, error) { return h.secret, nil }, jwt.WithValidMethods([]string{"HS256"}))\n\t\tif err != nil || !tok.Valid {\n\t\t\twriteError(w, http.StatusUnauthorized, "sign in first")\n\t\t\treturn\n\t\t}\n\t\tnext(w, r)\n\t}\n}',
};

const DOCKER: Record<Lang, string> = {
  express: 'FROM node:22-slim AS build\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci\nCOPY . .\nRUN npx tsc\n\nFROM node:22-slim\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci --omit=dev\nCOPY --from=build /app/dist ./dist\nUSER node\nCMD ["node", "dist/server.js"]',
  nestjs: 'FROM node:22-slim AS build\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci\nCOPY . .\nRUN npx prisma generate && npm run build\n\nFROM node:22-slim\nWORKDIR /app\nCOPY --from=build /app/node_modules ./node_modules\nCOPY --from=build /app/dist ./dist\nCOPY prisma ./prisma\nUSER node\nCMD ["node", "dist/main.js"]',
  fastapi: 'FROM python:3.12-slim\nWORKDIR /app\nCOPY requirements.txt .\nRUN pip install --no-cache-dir -r requirements.txt\nCOPY app ./app\nRUN useradd -m api\nUSER api\nCMD ["fastapi", "run", "app/main.py", "--port", "8000"]',
  'django-rest': 'FROM python:3.12-slim\nWORKDIR /app\nCOPY requirements.txt .\nRUN pip install --no-cache-dir -r requirements.txt gunicorn\nCOPY . .\nRUN useradd -m api\nUSER api\nCMD ["gunicorn", "config.wsgi", "--bind", "0.0.0.0:8000"]',
  'spring-boot': 'FROM eclipse-temurin:21-jdk AS build\nWORKDIR /app\nCOPY . .\nRUN ./mvnw -q package -DskipTests\n\nFROM eclipse-temurin:21-jre\nWORKDIR /app\nCOPY --from=build /app/target/*.jar app.jar\nUSER 1000\nCMD ["java", "-jar", "app.jar"]',
  'go-api': 'FROM golang:1.23 AS build\nWORKDIR /src\nCOPY go.* ./\nRUN go mod download\nCOPY . .\nRUN CGO_ENABLED=0 go build -o /api ./cmd/api\n\nFROM gcr.io/distroless/static\nCOPY --from=build /api /api\nUSER nonroot\nCMD ["/api"]',
};

const SRC: Record<Lang, string> = { express: 'src/**', nestjs: 'src/**', fastapi: 'app/**', 'django-rest': 'core/**', 'spring-boot': 'src/main/java/**', 'go-api': '**/*.go' };
const TEST_GLOB: Record<Lang, string> = { express: '**/*.test.ts', nestjs: 'test/**', fastapi: 'tests/**', 'django-rest': 'core/tests*', 'spring-boot': 'src/test/**', 'go-api': '**/*_test.go' };
const MIGRATION_GLOB: Record<Lang, string> = { express: 'migrations/**', nestjs: 'prisma/**', fastapi: 'app/**', 'django-rest': 'core/migrations/**', 'spring-boot': 'src/main/resources/db/migration/**', 'go-api': 'migrations/**' };
const TOPIC: Record<Lang, string> = {
  express: 'dev.backend-core.nodejs',
  nestjs: 'dev.backend-core.nodejs',
  fastapi: 'dev.backend-core.python-web-frameworks',
  'django-rest': 'dev.backend-core.python-web-frameworks',
  'spring-boot': 'dev.backend-core.java-spring',
  'go-api': 'dev.backend-core.go',
};

const curl = (c: Ctx) => `curl -i localhost:${PORT[lang(c)]}${path(c)}`;

// ── Stages ──────────────────────────────────────────────────────────────────

const setup: StageTemplate<Ctx> = {
  id: 'setup',
  minutes: [15, 15, 20, 10],
  build: (c) => ({
    title: 'Project setup and a health check',
    goal: `A ${c.stack.short} API starts with one command and answers GET /health; PostgreSQL runs locally; the code is on GitHub.`,
    steps: [
      { title: 'Create the project', detail: `Create the ${c.stack.label} project and start it in watch mode so it restarts on every save.`, code: SETUP[lang(c)] },
      { title: 'Run PostgreSQL locally', detail: 'Start PostgreSQL in Docker (or install it), create a database and keep its address in a DATABASE_URL environment variable in a .env file that git ignores.', code: 'docker run -d --name pg -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=app -p 5432:5432 postgres:16\n# .env\nDATABASE_URL=postgres://postgres:dev@localhost:5432/app' },
      { title: 'Add a health route', detail: 'Add GET /health returning {"status": "ok"}. Later it will also check the database; load balancers and hosts call it to know the API is alive.', code: HEALTH[lang(c)] },
      { title: 'Commit and push', detail: 'Add a .gitignore (dependencies, build output, .env), commit and push to a new public GitHub repository. Write one line in the README saying what the API is for.' },
    ],
    hints: ['Never commit .env; commit a .env.example with dummy values instead.', `Check it from the terminal: curl -i localhost:${PORT[lang(c)]}/health shows the status line and headers.`],
    acceptance: ['The API starts with one command.', 'GET /health returns 200 with {"status": "ok"}.', 'The database URL comes from the environment, not the code.', '.env is not in the repository.'],
    repo: { paths: ['.gitignore', SRC[lang(c)]] },
    self_check: ['Why read configuration from environment variables?', 'What should a health check test, and what should it not?'],
    commit: 'chore: project setup and health check',
    topics: [TOPIC[lang(c)], 'dev.dev-tools.git'],
  }),
};

const modelStage: StageTemplate<Ctx> = {
  id: 'model',
  minutes: [15, 20, 20],
  build: (c) => ({
    title: `Model the ${c.n.one} in the database`,
    goal: `A ${c.n.snakeMany} table exists, created by a migration that anyone can run.`,
    steps: [
      { title: 'Design the table', detail: `A ${c.n.one} has an id plus ${fieldList(c.fields)}. Decide each column's type, which are required (NOT NULL) and the allowed values. Add created_at so you can sort by newest.` },
      { title: 'Write the model and migration', detail: 'Describe the table in code and create it with a migration, so the schema lives in git and every machine gets the same database.', code: model(c) },
      { title: 'Seed sample rows', detail: `Insert three realistic ${c.n.many} (rupees for money, real-looking dates) with a seed script or SQL, then select them to check the types.`, code: `INSERT INTO ${c.n.snakeMany} (${c.fields.map(col).join(', ')})\nVALUES (${c.fields.map((f) => (f.type === 'number' ? '3' : f.type === 'money' ? '1200' : f.type === 'date' ? "'2026-10-05'" : f.type === 'boolean' ? 'true' : f.type === 'enum' ? `'${f.options?.[0]}'` : `'Sample ${f.label}'`)).join(', ')});` },
    ],
    hints: ['Use NUMERIC, not FLOAT, for money: floats cannot store 0.10 exactly.', 'Allowed values belong in the database too (a CHECK or an enum), not only in the API.'],
    acceptance: [`The ${c.n.snakeMany} table is created by a migration.`, 'Required columns are NOT NULL.', 'Sample rows can be inserted and selected.'],
    repo: { paths: [MIGRATION_GLOB[lang(c)]] },
    self_check: ['Why use migrations instead of creating tables by hand?', 'Which column would you index first, and why?'],
    commit: `feat: ${c.n.one} table and migration`,
    topics: ['dev.databases.sql', 'dev.databases.database-design'],
  }),
};

const crudStage: StageTemplate<Ctx> = {
  id: 'crud',
  minutes: [20, 25, 20, 15],
  build: (c) => ({
    title: `CRUD endpoints for ${c.n.many}`,
    goal: `${path(c)} supports list, read, create, update and delete with the right status codes.`,
    steps: [
      { title: 'Plan the endpoints', detail: `GET ${path(c)} (list), GET ${path(c)}/:id (one), POST (create, 201), PUT or PATCH /:id (update, 200), DELETE /:id (204). An unknown id is 404, never 500.` },
      { title: 'Implement them', detail: 'Write the handlers. Use parameterised queries or the ORM, never string concatenation, so user input cannot change the SQL.', code: crud(c) },
      { title: 'Add update', detail: `Add the update endpoint: load the ${c.n.one}, return 404 if it does not exist, apply the new values and return the saved row.` },
      { title: 'Try every route', detail: 'Call each endpoint with curl (or an HTTP client) and check the status code and body. Save the commands in the README.', code: `${curl(c)}\ncurl -i -X POST localhost:${PORT[lang(c)]}${path(c)} -H 'Content-Type: application/json' -d '${sampleJson(c)}'\ncurl -i localhost:${PORT[lang(c)]}${path(c)}/1\ncurl -i -X DELETE localhost:${PORT[lang(c)]}${path(c)}/1` },
    ],
    hints: ['201 Created for a new row, 204 No Content for a delete: clients rely on these.', 'Return the created row (with its id) from POST so the client does not need a second call.'],
    acceptance: ['All five operations work against the database.', 'Creating returns 201 and the new row.', 'An unknown id returns 404 with a JSON error.', 'No SQL is built by joining strings with user input.'],
    repo: { paths: [SRC[lang(c)]] },
    self_check: ['What is SQL injection and how do parameterised queries prevent it?', 'When would you use PATCH instead of PUT?'],
    commit: `feat: ${c.n.many} CRUD endpoints`,
    topics: ['dev.backend-core.rest-api-design', TOPIC[lang(c)]],
  }),
};

const validateStage: StageTemplate<Ctx> = {
  id: 'validation',
  minutes: [20, 20, 15],
  build: (c) => ({
    title: 'Validation and one error format',
    goal: `Bad input gets a 400 with a clear message per field; every error has the same JSON shape.`,
    steps: [
      { title: 'Validate the body', detail: `Check every field before it reaches the database: ${andList(c.fields.map((f) => (f.type === 'enum' ? `${f.label} is one of ${andList(f.options ?? [])}` : f.required ? `${f.label} is required` : `${f.label} is optional`)))}.`, code: validation(c) },
      { title: 'One error shape', detail: 'Return every error as {"error": "message", "details": {...}} with the right status: 400 invalid input, 401 not signed in, 404 not found, 409 conflict, 500 unexpected (logged, with no stack trace sent to the client).' },
      { title: 'Try the bad cases', detail: `Send an empty body, a wrong type (text where a number goes), an unknown ${enumField(c)?.label ?? 'field'} value and a malformed JSON body. Each must give a 400 with a useful message.` },
    ],
    hints: ['Validate at the edge (the request) and constrain in the database; both together catch everything.', 'Never echo internal error messages or SQL to the client.'],
    acceptance: ['Invalid input returns 400 with per-field details.', 'Malformed JSON returns 400, not 500.', 'All errors share one JSON shape.'],
    repo: { paths: [SRC[lang(c)]] },
    self_check: ['Why validate on the server even if the frontend validates too?', 'What is the difference between 400 and 422, and which do you use?'],
    commit: 'feat: input validation and error format',
    topics: ['dev.backend-core.rest-api-design'],
  }),
};

const listStage: StageTemplate<Ctx> = {
  id: 'list-queries',
  minutes: [20, 20, 15],
  build: (c) => {
    const ef = enumField(c);
    const nf = numberField(c) ?? c.fields.find((f) => f.type === 'date') ?? c.titleField;
    return {
      title: 'Pagination, filters and sorting',
      goal: `The list endpoint pages through results and filters and sorts on the server.`,
      steps: [
        { title: 'Paginate', detail: `Accept ?page and ?limit (default 20, maximum 100) and return {"items": [...], "page": 1, "total": 57}. Use LIMIT and OFFSET (or keyset pagination for very large tables).`, code: `SELECT * FROM ${c.n.snakeMany}\nORDER BY id DESC\nLIMIT $1 OFFSET $2;` },
        { title: ef ? `Filter by ${ef.label}` : 'Filter by search text', detail: ef ? `Accept ?${ef.name}=… and add a WHERE clause only when it is present. Reject values that are not allowed with 400.` : `Accept ?q=… and match the ${c.titleField.label} case-insensitively (ILIKE '%' || $1 || '%').` },
        { title: `Sort by ${nf.label}`, detail: `Accept ?sort=${nf.name} or ?sort=-${nf.name} (descending). Map allowed sort keys to column names with a fixed list; never put the raw parameter into SQL.` },
      ],
      hints: ['Whitelist sortable columns: ORDER BY cannot be parameterised, so free text there is an injection risk.', 'Add an index on the column you filter by most once the table grows.'],
      acceptance: ['?page and ?limit work and limit is capped.', 'Filtering returns only matching rows.', 'Sorting works both ways and rejects unknown keys.', 'The response includes the total count.'],
      repo: { paths: [SRC[lang(c)]] },
      self_check: ['Offset versus keyset pagination: when does offset get slow?', 'Why cap the page size?'],
      commit: 'feat: pagination, filtering and sorting',
      topics: ['dev.databases.sql', 'dev.backend-core.rest-api-design'],
    };
  },
};

const testStage: StageTemplate<Ctx> = {
  id: 'tests',
  minutes: [15, 25, 20],
  build: (c) => {
    const t = testCode(c);
    return {
      title: 'Automated API tests',
      goal: 'The main paths and error cases are covered by tests that run with one command against a test database.',
      steps: [
        { title: 'Set up tests', detail: `Install the test tools and point the tests at a separate test database (TEST_DATABASE_URL) so they never touch your data. Run them with: ${t.run}`, code: t.install },
        { title: 'Test the error cases', detail: `Start with the cases that break APIs: invalid body (400) and unknown id (404).`, code: t.code },
        { title: 'Test the happy path', detail: `Create ${an(c.n.one)}, read it back, update it, list it with a filter and delete it. Each test sets up its own data and cleans up after itself.` },
      ],
      hints: ['Tests that depend on each other fail randomly; give each test its own data.', 'Run the tests in CI later; keep them fast now.'],
      acceptance: ['Tests run with one command.', 'At least 6 tests cover create, read, update, delete, 400 and 404.', 'Tests use a separate database.'],
      repo: { paths: [TEST_GLOB[lang(c)]] },
      self_check: ['Unit test versus integration test: which are these, and why?', 'How do you keep tests independent of each other?'],
      commit: 'test: API tests for CRUD and errors',
      topics: ['dev.dev-tools.testing-fundamentals'],
    };
  },
};

const authStage: StageTemplate<Ctx> = {
  id: 'auth',
  minutes: [20, 25, 25, 15],
  build: (c) => ({
    title: 'Sign-up, log-in and private data',
    goal: `Users register and log in; every ${c.n.one} belongs to one user, and nobody can read or change someone else's.`,
    steps: [
      { title: 'Users table', detail: 'Add a users table (id, email unique, password_hash, created_at) and a user_id foreign key on the main table.', code: `CREATE TABLE users (\n  id BIGSERIAL PRIMARY KEY,\n  email TEXT NOT NULL UNIQUE,\n  password_hash TEXT NOT NULL,\n  created_at TIMESTAMPTZ NOT NULL DEFAULT now()\n);\nALTER TABLE ${c.n.snakeMany} ADD COLUMN user_id BIGINT REFERENCES users(id) ON DELETE CASCADE;` },
      { title: 'Register and log in', detail: 'POST /api/auth/register hashes the password (bcrypt or argon2) and returns 201, or 409 if the email exists. POST /api/auth/login checks the hash and returns a signed JWT (short expiry, secret from the environment).', code: AUTH[lang(c)] },
      { title: 'Protect the routes', detail: `Require a valid token on every ${path(c)} route. Read the user id from the token, never from the request body, and add WHERE user_id = … to every query.` },
      { title: 'Prove isolation', detail: `Create two users, add ${an(c.n.one)} as the first, and check the second gets 404 (not 403) for it: do not reveal that the row exists.` },
    ],
    hints: ['Use the same error for "unknown email" and "wrong password" so attackers cannot discover accounts.', 'Rate-limit the login route; it is the first thing attackers try.'],
    acceptance: ['Passwords are stored only as hashes.', 'Requests without a valid token get 401.', "A user can never see or change another user's data.", 'Duplicate email returns 409.'],
    repo: { paths: [SRC[lang(c)]] },
    self_check: ['Why hash passwords with bcrypt or argon2 instead of SHA-256?', 'Where would you store a JWT in a browser, and what are the risks?'],
    commit: 'feat: authentication and per-user data',
    topics: ['dev.backend-core.authentication', 'dev.backend-scale.web-security'],
  }),
};

function featureStage(i: 0 | 1 | 2): StageTemplate<Ctx> {
  return {
    id: `feature-${i + 1}`,
    minutes: [15, 25, 20],
    build: (c) => {
      const f = c.idea.features[i];
      return {
        title: upperFirst(f),
        goal: `The API can ${f}, through its own endpoint, with tests.`,
        steps: [
          { title: 'Design the endpoint', detail: `Decide the route (for example GET ${path(c)}/summary or POST ${path(c)}/:id/action), its inputs, its JSON response and its errors for "${f}". Write it in the README before coding.` },
          { title: 'Implement it in a service', detail: `Put the logic in a service function that takes plain inputs and returns plain data, and keep the handler thin. Push work to SQL where it helps (GROUP BY, SUM, date_trunc) instead of looping in code.`, code: `-- example of letting the database do the work\nSELECT ${enumField(c) ? col(enumField(c)!) : 'date_trunc(\'month\', created_at)'} AS bucket, COUNT(*) AS n${numberField(c) ? `, SUM(${col(numberField(c)!)}) AS total` : ''}\nFROM ${c.n.snakeMany}\nGROUP BY bucket\nORDER BY n DESC;` },
          { title: 'Test it', detail: `Write tests for an empty table, one ${c.n.one} and several, and for bad input. Check the numbers by hand for one case.` },
        ],
        hints: ['Return numbers as numbers, dates as ISO strings, and keep the shape stable.', 'If it is slow, look at EXPLAIN ANALYZE before adding caching.'],
        acceptance: [`The API can ${f}.`, 'The endpoint is documented in the README.', 'Tests cover empty, single and many rows.'],
        repo: { paths: [SRC[lang(c)]] },
        self_check: [`How did you design the endpoint for "${f}", and what alternatives did you consider?`, 'Why keep handlers thin and put logic in services?'],
        commit: `feat: ${lowerFirst(f).slice(0, 60)}`,
        topics: [TOPIC[lang(c)]],
      };
    },
  };
}

const dockerStage: StageTemplate<Ctx> = {
  id: 'docker-ci',
  minutes: [20, 20, 20],
  build: (c) => ({
    title: 'Docker and continuous integration',
    goal: 'The API and PostgreSQL start with docker compose up, and every push runs the tests in GitHub Actions.',
    steps: [
      { title: 'Dockerfile', detail: 'Build a small production image with a multi-stage Dockerfile, running as a non-root user. Add a .dockerignore for dependencies, .env and git files.', code: DOCKER[lang(c)] },
      { title: 'docker compose', detail: 'Run the API and PostgreSQL together with a named volume for the data and a health check on the database; the API waits for it.', code: `services:\n  db:\n    image: postgres:16\n    environment: { POSTGRES_PASSWORD: dev, POSTGRES_DB: app }\n    volumes: [pgdata:/var/lib/postgresql/data]\n    healthcheck: { test: ["CMD", "pg_isready", "-U", "postgres"], interval: 5s }\n  api:\n    build: .\n    ports: ["${PORT[lang(c)]}:${PORT[lang(c)]}"]\n    environment: { DATABASE_URL: "postgres://postgres:dev@db:5432/app" }\n    depends_on: { db: { condition: service_healthy } }\nvolumes:\n  pgdata:` },
      { title: 'CI pipeline', detail: 'Add a GitHub Actions workflow that starts a PostgreSQL service container, runs the migrations and the tests, and builds the Docker image on every push and pull request. Add the badge to the README.' },
    ],
    hints: ['Copy dependency files and install before copying the source, so Docker caches the slow layer.', 'Make CI fail once on purpose to prove it works.'],
    acceptance: ['docker compose up starts a working API with a database.', 'The image runs as a non-root user.', 'CI runs migrations and tests on every push.'],
    repo: { paths: ['Dockerfile', 'docker-compose.yml', '.github/workflows/*.yml'] },
    self_check: ['What does a multi-stage build save you?', 'What does your CI pipeline protect you from?'],
    commit: 'ci: docker compose and test pipeline',
    topics: ['dev.containers-ci.docker', 'dev.containers-ci.ci-cd'],
  }),
};

const hardenStage: StageTemplate<Ctx> = {
  id: 'hardening',
  minutes: [20, 20, 20],
  build: (c) => ({
    title: 'Docs, rate limits and caching',
    goal: 'The API is documented with OpenAPI, protected by rate limits, and the busiest read is cached safely.',
    steps: [
      { title: 'OpenAPI docs', detail: lang(c) === 'fastapi' ? 'FastAPI already serves the docs at /docs; add descriptions, examples and response models to every route.' : 'Generate an OpenAPI document (springdoc, @nestjs/swagger, drf-spectacular, a hand-written openapi.yaml for Express or Go) and serve interactive docs. Every route has an example request and response.' },
      { title: 'Rate limiting', detail: 'Limit requests per IP (and stricter on log-in): for example 100 per minute, returning 429 with a Retry-After header. Test it with a quick loop of curl calls.' },
      { title: 'Cache a hot read', detail: `Cache the busiest read (for example a feature summary) in memory or Redis for 30–60 seconds, and clear it when a ${c.n.one} changes. Measure the response time before and after.` },
    ],
    hints: ['Cache only what is safe to be slightly stale, and always per user for private data.', '429 responses must still use your JSON error shape.'],
    acceptance: ['Interactive API docs list every route with examples.', 'Too many requests get 429 with Retry-After.', 'The cached endpoint is faster and never serves stale data after a change.'],
    repo: { paths: [SRC[lang(c)]] },
    self_check: ['How do you invalidate a cache correctly?', 'Which endpoints need stricter rate limits, and why?'],
    commit: 'feat: OpenAPI docs, rate limiting and caching',
    topics: ['dev.backend-scale.caching', 'dev.backend-scale.web-security'],
  }),
};

const deployStage: StageTemplate<Ctx> = {
  id: 'deploy',
  minutes: [15, 20, 20],
  build: (c) => ({
    title: 'Deploy and document',
    goal: 'The API runs on a free host with a managed PostgreSQL database, and the README shows how to use it.',
    steps: [
      { title: 'Production settings', detail: 'Read the port, DATABASE_URL and secrets from the environment, turn off debug output, and run migrations as part of the release. Log one line per request (method, path, status, time).' },
      { title: 'Deploy', detail: `Create a free PostgreSQL database (Neon or the host's own), deploy the API on ${c.stack.host} from the GitHub repository and set the environment variables there. Call /health on the live address.` },
      { title: 'Write the README', detail: 'Add: what the API does, the live base address, an endpoint table (method, path, purpose), example curl calls, how to run it locally, the tech stack, and what you would build next.' },
    ],
    hints: ['Free hosts sleep when idle: the first request can take 30 seconds; say so in the README.', 'Never print secrets in logs, even at startup.'],
    acceptance: ['The API is live and /health returns 200.', 'Secrets live only in the host settings.', 'The README has an endpoint table and example calls.'],
    repo: { paths: ['README.md'], readme: ['Endpoints', 'Run locally'] },
    self_check: ['What happens between "git push" and the new version being live?', 'How would you roll back a bad release?'],
    commit: 'docs: README and deployment',
    topics: ['dev.dev-tools.deployment-basics'],
  }),
};

const STAGES: Record<ProjectLevel, StageTemplate<Ctx>[]> = {
  beginner: [setup, modelStage, crudStage, validateStage, listStage, testStage, deployStage],
  intermediate: [setup, modelStage, crudStage, validateStage, listStage, authStage, featureStage(0), testStage, deployStage],
  advanced: [setup, modelStage, crudStage, validateStage, listStage, authStage, featureStage(0), featureStage(1), featureStage(2), testStage, dockerStage, hardenStage],
};

const ALL: ProjectLevel[] = ['beginner', 'intermediate', 'advanced'];
const stack = (s: Omit<StackDef, 'kind' | 'levels' | 'roles'>): StackDef => ({ kind: 'backend', levels: ALL, roles: ['backend', 'fullstack'], ...s });

export const BACKEND = {
  stacks: [
    stack({ key: 'express', label: 'Node.js + Express + TypeScript + PostgreSQL', short: 'Express', tech: ['Node.js', 'Express', 'TypeScript', 'PostgreSQL'], skills: ['nodejs', 'rest-api-design', 'sql', 'typescript'], modules: ['dev.backend-core', 'dev.databases'], lang: 'ts', host: 'Render or Railway' }),
    stack({ key: 'nestjs', label: 'NestJS + Prisma + PostgreSQL', short: 'NestJS', tech: ['NestJS', 'TypeScript', 'Prisma', 'PostgreSQL'], skills: ['nodejs', 'typescript', 'orms', 'rest-api-design'], modules: ['dev.backend-core', 'dev.databases'], lang: 'ts', host: 'Render or Railway' }),
    stack({ key: 'fastapi', label: 'Python FastAPI + SQLModel + PostgreSQL', short: 'FastAPI', tech: ['Python', 'FastAPI', 'SQLModel', 'PostgreSQL'], skills: ['python', 'python-web-frameworks', 'rest-api-design', 'sql'], modules: ['dev.backend-core', 'dev.databases'], lang: 'python', host: 'Render or Railway' }),
    stack({ key: 'django-rest', label: 'Django + Django REST Framework + PostgreSQL', short: 'Django REST', tech: ['Python', 'Django', 'DRF', 'PostgreSQL'], skills: ['python', 'python-web-frameworks', 'orms', 'rest-api-design'], modules: ['dev.backend-core', 'dev.databases'], lang: 'python', host: 'Render or Railway' }),
    stack({ key: 'spring-boot', label: 'Java 21 + Spring Boot 3 + PostgreSQL', short: 'Spring Boot', tech: ['Java', 'Spring Boot', 'Spring Data JPA', 'PostgreSQL'], skills: ['java-spring', 'rest-api-design', 'sql', 'orms'], modules: ['dev.backend-core', 'dev.databases'], lang: 'java', host: 'Render or Railway' }),
    stack({ key: 'go-api', label: 'Go + net/http + PostgreSQL', short: 'Go', tech: ['Go', 'net/http', 'pgx', 'PostgreSQL'], skills: ['go', 'rest-api-design', 'sql'], modules: ['dev.backend-core', 'dev.databases'], lang: 'go', host: 'Fly.io or Render' }),
  ],
  plan: {
    kind: 'backend',
    stages: (level: ProjectLevel) => STAGES[level],
    outcome: (c: Ctx) =>
      `A deployed ${c.stack.short} REST API for ${c.n.many} on PostgreSQL with validation, pagination, filters and tests${c.level === 'beginner' ? '' : `, sign-up and log-in with per-user data, and an endpoint that can ${lowerFirst(c.idea.features[0])}`}${c.level === 'advanced' ? `, plus endpoints to ${lowerFirst(c.idea.features[1])} and ${lowerFirst(c.idea.features[2])}, Docker, CI, docs and rate limits` : ''}.`,
    readme: () => ['Live API', 'Endpoints', 'Example requests', 'Tech stack', 'Run locally', 'Tests', "What's next"],
    deploy: (c: Ctx) => [
      'Push the code to a public GitHub repository.',
      'Create a free managed PostgreSQL database and copy its connection string.',
      `Create a web service on ${c.stack.host} from the repository and set DATABASE_URL and secrets in its settings.`,
      'Run the migrations as part of the release, then call /health on the live address.',
      'Add the live base address and example curl calls to the README and your resume.',
    ],
    verbs: ['Built', 'Designed', 'Implemented', 'Secured', 'Tested', 'Deployed'],
  } satisfies KindPlan<Ctx>,
};
