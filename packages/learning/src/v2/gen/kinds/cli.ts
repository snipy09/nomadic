/**
 * Command-line projects: an app idea built as a terminal tool in Python
 * (Typer), Node.js (Commander + TypeScript) or Go (Cobra). Every level stores
 * data in a JSON file in the user's data folder, has add, list, edit, delete
 * and query commands, tests and a package others can install; intermediate
 * adds CSV export and import and one idea-specific command.
 */
import type { ProjectLevel } from '../../types';
import { an, andList, fieldList, lowerFirst, pascalOf, snakeOf, upperFirst } from '../names';
import type { Ctx, FieldDef, KindPlan, StackDef, StageTemplate } from '../types';

type Lang = 'python-cli' | 'node-cli' | 'go-cli';
const lang = (c: Ctx) => c.stack.key as Lang;
const cmd = (c: Ctx) => c.idea.key;
const pkg = (c: Ctx) => snakeOf(c.idea.key.replace(/-/g, '_'));
const flag = (f: FieldDef) => f.name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
const q = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const dq = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const enumField = (c: Ctx) => c.fields.find((f) => f.type === 'enum' || f.type === 'boolean');
const numberField = (c: Ctx) => c.fields.find((f) => f.type === 'number' || f.type === 'money');
/** The title field first, then other required fields, then optional ones (Python needs defaults last). */
const ordered = (c: Ctx) => [c.titleField, ...c.fields.filter((f) => f !== c.titleField && f.required && f.type !== 'boolean'), ...c.fields.filter((f) => f !== c.titleField && (!f.required || f.type === 'boolean'))];
const help = (f: FieldDef) => (f.type === 'money' ? `${f.label} in rupees` : f.type === 'date' ? `${f.label} (YYYY-MM-DD)` : f.type === 'enum' ? `${f.label}: ${(f.options ?? []).join(', ')}` : f.label);

const SRC: Record<Lang, string> = { 'python-cli': 'src/**', 'node-cli': 'src/**', 'go-cli': 'cmd/**' };
const TEST_GLOB: Record<Lang, string> = { 'python-cli': 'tests/**', 'node-cli': '**/*.test.ts', 'go-cli': '**/*_test.go' };
const TOPIC: Record<Lang, string> = { 'python-cli': 'dev.backend-core.python', 'node-cli': 'dev.backend-core.nodejs', 'go-cli': 'dev.backend-core.go' };

const PY_T: Record<FieldDef['type'], string> = { text: 'str', longtext: 'str', number: 'int', money: 'float', date: 'str', enum: 'str', boolean: 'bool' };
const TS_T: Record<FieldDef['type'], string> = { text: 'string', longtext: 'string', number: 'number', money: 'number', date: 'string', enum: 'string', boolean: 'boolean' };
const GO_T: Record<FieldDef['type'], string> = { text: 'string', longtext: 'string', number: 'int', money: 'float64', date: 'string', enum: 'string', boolean: 'bool' };

// ── Code per stack ──────────────────────────────────────────────────────────

function setupCode(c: Ctx): string {
  switch (lang(c)) {
    case 'python-cli':
      return `mkdir ${cmd(c)} && cd ${cmd(c)}\npython -m venv .venv\nsource .venv/bin/activate   # Windows: .venv\\Scripts\\activate\npip install typer rich platformdirs\n\n# pyproject.toml\n[project]\nname = "${cmd(c)}"\nversion = "0.1.0"\nrequires-python = ">=3.10"\ndependencies = ["typer", "rich", "platformdirs"]\n\n[project.scripts]\n${cmd(c)} = "${pkg(c)}.main:app"\n\n# src/${pkg(c)}/main.py holds: app = typer.Typer(no_args_is_help=True)\npip install -e .\n${cmd(c)} --help`;
    case 'node-cli':
      return `mkdir ${cmd(c)} && cd ${cmd(c)}\nnpm init -y\nnpm install commander env-paths\nnpm install -D typescript tsx @types/node vitest\nnpx tsc --init\n\n# package.json\n"type": "module",\n"bin": { "${cmd(c)}": "dist/cli.js" },\n"scripts": { "build": "tsc", "dev": "tsx src/cli.ts" }\n\n# src/cli.ts starts with: #!/usr/bin/env node\nnpm run build && npm link\n${cmd(c)} --help`;
    case 'go-cli':
      return `mkdir ${cmd(c)} && cd ${cmd(c)}\ngo mod init example.com/${cmd(c)}\ngo install github.com/spf13/cobra-cli@latest\ncobra-cli init\ncobra-cli add add\ncobra-cli add list\ngo run . --help`;
  }
}

function storeCode(c: Ctx): string {
  const N = c.n;
  const fs = ordered(c);
  switch (lang(c)) {
    case 'python-cli':
      return `# src/${pkg(c)}/store.py\nimport json\nimport os\nfrom dataclasses import asdict, dataclass\nfrom pathlib import Path\n\nfrom platformdirs import user_data_path\n\nDATA = Path(os.environ.get('${pkg(c).toUpperCase()}_DATA', user_data_path('${cmd(c)}'))) / '${N.snakeMany}.json'\n\n\n@dataclass\nclass ${N.Pascal}:\n    id: int\n${fs.map((f) => `    ${snakeOf(f.name)}: ${PY_T[f.type]}${f.required && f.type !== 'boolean' ? '' : f.type === 'boolean' ? ' = False' : ' | None = None'}`).join('\n')}\n\n\ndef load() -> list[${N.Pascal}]:\n    if not DATA.exists():\n        return []\n    return [${N.Pascal}(**row) for row in json.loads(DATA.read_text(encoding='utf-8'))]\n\n\ndef save(items: list[${N.Pascal}]) -> None:\n    DATA.parent.mkdir(parents=True, exist_ok=True)\n    tmp = DATA.with_suffix('.tmp')\n    tmp.write_text(json.dumps([asdict(x) for x in items], indent=2, ensure_ascii=False), encoding='utf-8')\n    tmp.replace(DATA)  # atomic: a crash never leaves half a file\n\n\ndef next_id(items: list[${N.Pascal}]) -> int:\n    return max((x.id for x in items), default=0) + 1`;
    case 'node-cli':
      return `// src/store.ts\nimport { mkdir, readFile, rename, writeFile } from 'node:fs/promises';\nimport { join } from 'node:path';\nimport envPaths from 'env-paths';\n\nexport type ${N.Pascal} = {\n  id: number;\n${fs.map((f) => `  ${f.name}${f.required || f.type === 'boolean' ? '' : '?'}: ${TS_T[f.type]};`).join('\n')}\n};\n\nconst dir = process.env.${pkg(c).toUpperCase()}_DATA ?? envPaths('${cmd(c)}', { suffix: '' }).data;\nconst file = join(dir, '${N.kebabMany}.json');\n\nexport async function load(): Promise<${N.Pascal}[]> {\n  try {\n    return JSON.parse(await readFile(file, 'utf8'));\n  } catch (e) {\n    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];\n    throw e;\n  }\n}\n\nexport async function save(items: ${N.Pascal}[]): Promise<void> {\n  await mkdir(dir, { recursive: true });\n  await writeFile(file + '.tmp', JSON.stringify(items, null, 2));\n  await rename(file + '.tmp', file); // atomic: a crash never leaves half a file\n}\n\nexport const nextId = (items: ${N.Pascal}[]) => Math.max(0, ...items.map((x) => x.id)) + 1;`;
    case 'go-cli':
      return `// internal/store/store.go\ntype ${N.Pascal} struct {\n\tID int \`json:"id"\`\n${fs.map((f) => `\t${pascalOf(f.name)} ${f.required || f.type === 'boolean' ? '' : '*'}${GO_T[f.type]} \`json:"${snakeOf(f.name)}${f.required || f.type === 'boolean' ? '' : ',omitempty'}"\``).join('\n')}\n}\n\nfunc path() (string, error) {\n\tif d := os.Getenv("${pkg(c).toUpperCase()}_DATA"); d != "" {\n\t\treturn filepath.Join(d, "${N.snakeMany}.json"), nil\n\t}\n\td, err := os.UserConfigDir()\n\treturn filepath.Join(d, "${cmd(c)}", "${N.snakeMany}.json"), err\n}\n\nfunc Load() ([]${N.Pascal}, error) {\n\tp, err := path()\n\tif err != nil {\n\t\treturn nil, err\n\t}\n\tb, err := os.ReadFile(p)\n\tif errors.Is(err, fs.ErrNotExist) {\n\t\treturn nil, nil\n\t}\n\tvar items []${N.Pascal}\n\treturn items, json.Unmarshal(b, &items)\n}\n\nfunc Save(items []${N.Pascal}) error {\n\tp, err := path()\n\tif err != nil {\n\t\treturn err\n\t}\n\tos.MkdirAll(filepath.Dir(p), 0o755)\n\tb, _ := json.MarshalIndent(items, "", "  ")\n\tif err := os.WriteFile(p+".tmp", b, 0o644); err != nil {\n\t\treturn err\n\t}\n\treturn os.Rename(p+".tmp", p) // atomic: a crash never leaves half a file\n}\n\nfunc NextID(items []${N.Pascal}) int {\n\tn := 0\n\tfor _, x := range items {\n\t\tn = max(n, x.ID)\n\t}\n\treturn n + 1\n}`;
  }
}

function addCode(c: Ctx): string {
  const N = c.n;
  const t = c.titleField;
  const rest = ordered(c).slice(1);
  switch (lang(c)) {
    case 'python-cli':
      return `# src/${pkg(c)}/main.py\n@app.command()\ndef add(\n    ${snakeOf(t.name)}: Annotated[str, typer.Argument(help=${q(upperFirst(t.label))})],\n${rest
        .map((f) => {
          const name = snakeOf(f.name);
          const h = `help=${q(upperFirst(help(f)))}`;
          if (f.type === 'boolean') return `    ${name}: Annotated[bool, typer.Option(${h})] = False,`;
          const extra = f.type === 'enum' ? `click_type=click.Choice([${(f.options ?? []).map(q).join(', ')}]), ` : f.type === 'number' || f.type === 'money' ? 'min=0, ' : '';
          const ty = f.type === 'enum' || f.type === 'date' || f.type === 'text' || f.type === 'longtext' ? 'str' : PY_T[f.type];
          return f.required ? `    ${name}: Annotated[${ty}, typer.Option(${extra}${h})],` : `    ${name}: Annotated[${ty} | None, typer.Option(${extra}${h})] = None,`;
        })
        .join('\n')}\n):\n    """Add ${an(N.one)}."""\n    items = store.load()\n    item = store.${N.Pascal}(id=store.next_id(items), ${ordered(c).map((f) => `${snakeOf(f.name)}=${snakeOf(f.name)}`).join(', ')})\n    store.save([*items, item])\n    console.print(f'Added ${N.one} [bold]{item.id}[/bold]')`;
    case 'node-cli':
      return `// src/cli.ts\nprogram\n  .command('add')\n  .description('Add ${an(N.one)}')\n  .argument('<${flag(t)}>', ${q(upperFirst(t.label))})\n${rest
        .map((f) => {
          if (f.type === 'enum') return `  .addOption(new Option('--${flag(f)} <value>', ${q(upperFirst(f.label))}).choices([${(f.options ?? []).map(q).join(', ')}])${f.required ? '.makeOptionMandatory()' : ''})`;
          if (f.type === 'boolean') return `  .option('--${flag(f)}', ${q(upperFirst(f.label))}, false)`;
          const parse = f.type === 'number' || f.type === 'money' ? ', parseAmount' : f.type === 'date' ? ', parseDate' : '';
          return `  .${f.required ? 'requiredOption' : 'option'}('--${flag(f)} <value>', ${q(upperFirst(help(f)))}${parse})`;
        })
        .join('\n')}\n  .action(async (${t.name}: string, opts) => {\n    const items = await load();\n    const item: ${N.Pascal} = { id: nextId(items), ${t.name}, ...opts };\n    await save([...items, item]);\n    console.log('Added ${N.one} ' + item.id);\n  });\n\nfunction parseAmount(v: string) {\n  const n = Number(v);\n  if (!Number.isFinite(n) || n < 0) throw new InvalidArgumentError('Use a number, 0 or more.');\n  return n;\n}\n\nfunction parseDate(v: string) {\n  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) throw new InvalidArgumentError('Use YYYY-MM-DD.');\n  return v;\n}`;
    case 'go-cli':
      return `// cmd/add.go\nvar addCmd = &cobra.Command{\n\tUse:   "add ${t.name.toUpperCase()}",\n\tShort: "Add ${an(N.one)}",\n\tArgs:  cobra.ExactArgs(1),\n\tRunE: func(cmd *cobra.Command, args []string) error {\n\t\titems, err := store.Load()\n\t\tif err != nil {\n\t\t\treturn err\n\t\t}\n\t\titem := store.${N.Pascal}{ID: store.NextID(items), ${pascalOf(t.name)}: ${t.required ? 'args[0]' : '&args[0]'}}\n\t\t// read each flag with cmd.Flags().GetString / GetFloat64 / GetBool, validate, set it on item\n\t\tif err := store.Save(append(items, item)); err != nil {\n\t\t\treturn err\n\t\t}\n\t\tfmt.Fprintf(cmd.OutOrStdout(), "Added ${N.one} %d\\n", item.ID)\n\t\treturn nil\n\t},\n}\n\nfunc init() {\n\trootCmd.AddCommand(addCmd)\n${rest
        .map((f) => {
          const kind = f.type === 'number' ? 'Int' : f.type === 'money' ? 'Float64' : f.type === 'boolean' ? 'Bool' : 'String';
          const def = f.type === 'number' || f.type === 'money' ? '0' : f.type === 'boolean' ? 'false' : '""';
          return `\taddCmd.Flags().${kind}(${dq(flag(f))}, ${def}, ${dq(help(f))})${f.required && f.type !== 'boolean' ? `\n\taddCmd.MarkFlagRequired(${dq(flag(f))})` : ''}`;
        })
        .join('\n')}\n}`;
  }
}

function listCode(c: Ctx): string {
  const N = c.n;
  const shown = [c.titleField, ...c.fields.filter((f) => f !== c.titleField && f.type !== 'longtext')].slice(0, 4);
  switch (lang(c)) {
    case 'python-cli':
      return `@app.command('list')\ndef list_${N.snakeMany}():\n    """List ${N.many}, newest first."""\n    items = sorted(store.load(), key=lambda x: x.id, reverse=True)\n    if not items:\n        console.print('No ${N.many} yet. Add one with: ${cmd(c)} add')\n        raise typer.Exit()\n    table = Table('ID', ${shown.map((f) => q(upperFirst(f.label))).join(', ')})\n    for x in items:\n        table.add_row(str(x.id), ${shown.map((f) => { const v = `x.${snakeOf(f.name)}`; const opt = !f.required && f.type !== 'boolean'; return f.type === 'money' ? (opt ? `f'₹{${v}:,.2f}' if ${v} is not None else ''` : `f'₹{${v}:,.2f}'`) : opt ? `str(${v} if ${v} is not None else '')` : `str(${v})`; }).join(', ')})\n    console.print(table)`;
    case 'node-cli':
      return `program\n  .command('list')\n  .description('List ${N.many}, newest first')\n  .option('--json', 'Print JSON for scripts')\n  .action(async (opts) => {\n    const items = (await load()).sort((a, b) => b.id - a.id);\n    if (opts.json) return console.log(JSON.stringify(items, null, 2));\n    if (!items.length) return console.log('No ${N.many} yet. Add one with: ${cmd(c)} add');\n    const rupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });\n    console.table(\n      items.map((x) => ({ id: x.id, ${shown.map((f) => `${f.name}: ${f.type === 'money' ? `x.${f.name} == null ? '' : rupees.format(x.${f.name})` : `x.${f.name} ?? ''`}`).join(', ')} }))\n    );\n  });`;
    case 'go-cli':
      return `// cmd/list.go\nRunE: func(cmd *cobra.Command, args []string) error {\n\titems, err := store.Load()\n\tif err != nil {\n\t\treturn err\n\t}\n\tif len(items) == 0 {\n\t\tfmt.Fprintln(cmd.OutOrStdout(), "No ${N.many} yet. Add one with: ${cmd(c)} add")\n\t\treturn nil\n\t}\n\tsort.Slice(items, func(i, j int) bool { return items[i].ID > items[j].ID })\n\tw := tabwriter.NewWriter(cmd.OutOrStdout(), 0, 0, 2, ' ', 0)\n\tfmt.Fprintln(w, "ID\\t${shown.map((f) => upperFirst(f.label).replace(/"/g, '')).join('\\t')}")\n\tfor _, x := range items {\n\t\tfmt.Fprintf(w, "%d${shown.map(() => '\\t%v').join('')}\\n", x.ID, ${shown.map((f) => (f.required || f.type === 'boolean' ? `x.${pascalOf(f.name)}` : `deref(x.${pascalOf(f.name)})`)).join(', ')})\n\t}\n\treturn w.Flush()\n},${shown.some((f) => !f.required && f.type !== 'boolean') ? '\n\n// deref returns the value, or "" for an empty optional field\nfunc deref[T any](p *T) any {\n\tif p == nil {\n\t\treturn ""\n\t}\n\treturn *p\n}' : ''}`;
  }
}

function testCode(c: Ctx): { run: string; code: string } {
  const N = c.n;
  const env = `${pkg(c).toUpperCase()}_DATA`;
  const reqArgs = ordered(c)
    .slice(1)
    .filter((f) => f.required && f.type !== 'boolean')
    .map((f) => `--${flag(f)}=${f.type === 'number' || f.type === 'money' ? '3' : f.type === 'date' ? '2026-10-05' : f.type === 'enum' ? (f.options?.[0] ?? '').replace(/ /g, '_') : 'x'}`);
  const argsPy = ['add', 'Test', ...reqArgs].map((a) => q(a.replace(/_/g, ' '))).join(', ');
  switch (lang(c)) {
    case 'python-cli':
      return { run: 'pytest', code: `# tests/test_cli.py (pip install pytest)\nfrom typer.testing import CliRunner\n\nfrom ${pkg(c)}.main import app\n\nrunner = CliRunner()\n\n\ndef test_add_then_list(tmp_path, monkeypatch):\n    monkeypatch.setattr('${pkg(c)}.store.DATA', tmp_path / 'data.json')\n    assert runner.invoke(app, [${argsPy}]).exit_code == 0\n    result = runner.invoke(app, ['list'])\n    assert 'Test' in result.output\n\n\ndef test_delete_unknown_id_fails(tmp_path, monkeypatch):\n    monkeypatch.setattr('${pkg(c)}.store.DATA', tmp_path / 'data.json')\n    result = runner.invoke(app, ['delete', '99', '--yes'])\n    assert result.exit_code == 1\n    assert 'No ${N.one} 99' in result.output` };
    case 'node-cli':
      return { run: 'npx vitest', code: `// src/cli.test.ts: run the real command in a temporary data folder\nimport { execFileSync } from 'node:child_process';\nimport { mkdtempSync } from 'node:fs';\nimport { tmpdir } from 'node:os';\nimport { join } from 'node:path';\nimport { expect, it } from 'vitest';\n\nconst run = (args: string[], dir: string) =>\n  execFileSync('npx', ['tsx', 'src/cli.ts', ...args], { env: { ...process.env, ${env}: dir }, encoding: 'utf8' });\n\nit('adds ${an(N.one)} and lists it', () => {\n  const dir = mkdtempSync(join(tmpdir(), '${cmd(c)}-'));\n  run([${['add', 'Test', ...reqArgs].map((a) => q(a.replace(/_/g, ' '))).join(', ')}], dir);\n  expect(run(['list', '--json'], dir)).toContain('Test');\n});` };
    case 'go-cli':
      return { run: 'go test ./...', code: `func TestAddThenList(t *testing.T) {\n\tt.Setenv("${env}", t.TempDir())\n\tout := new(bytes.Buffer)\n\trootCmd.SetOut(out)\n\trootCmd.SetArgs([]string{${['add', 'Test', ...reqArgs].map((a) => dq(a.replace(/_/g, ' '))).join(', ')}})\n\tif err := rootCmd.Execute(); err != nil {\n\t\tt.Fatal(err)\n\t}\n\trootCmd.SetArgs([]string{"list"})\n\tif err := rootCmd.Execute(); err != nil {\n\t\tt.Fatal(err)\n\t}\n\tif !strings.Contains(out.String(), "Test") {\n\t\tt.Fatalf("list did not show the new ${N.one}: %s", out)\n\t}\n}` };
  }
}

const PUBLISH: Record<Lang, (c: Ctx) => string> = {
  'python-cli': (c) => `pip install build twine\npython -m build                 # dist/*.whl and dist/*.tar.gz\npipx install dist/*.whl         # install like a user would\n${cmd(c)} --help\ntwine upload -r testpypi dist/*  # optional: publish to TestPyPI first`,
  'node-cli': (c) => `npm run build\nnpm pack                        # look inside the tarball: only dist/, README and package.json\nnpm install -g ./${cmd(c)}-0.1.0.tgz\n${cmd(c)} --help\n# package.json "files": ["dist"]; publish with: npm publish --access public`,
  'go-cli': (c) => `go install .                    # puts ${cmd(c)} in $(go env GOPATH)/bin\n${cmd(c)} --help\n# release binaries for Windows, macOS and Linux with GoReleaser:\ngo install github.com/goreleaser/goreleaser/v2@latest\ngoreleaser init\ngoreleaser release --snapshot --clean   # try it locally first`,
};

// ── Stages ──────────────────────────────────────────────────────────────────

const setup: StageTemplate<Ctx> = {
  id: 'setup',
  minutes: [20, 15, 10],
  build: (c) => ({
    title: `${upperFirst(an(cmd(c)))} command that prints help`,
    goal: `Typing ${cmd(c)} --help in any terminal shows the tool's commands, and the code is on GitHub.`,
    steps: [
      { title: 'Create the project', detail: `Create a ${c.stack.label} project whose installed command is called ${cmd(c)}, and install it on your machine in development mode so edits take effect at once.`, code: setupCode(c) },
      { title: 'Plan the commands', detail: `Write the commands in the README before coding: add, list, show, edit, delete and search for ${c.n.many}. Each has a one-line description that will appear in --help.` },
      { title: 'Commit and push', detail: 'Add a .gitignore for the language (virtual environments, node_modules, build output), commit and push to a new public GitHub repository.' },
    ],
    hints: ['Running with no arguments should print help, not an error.', 'Keep the command name short and lower case; people will type it a lot.'],
    acceptance: [`${cmd(c)} --help works from any folder.`, 'Every planned command is listed in the README.', 'The project is on GitHub.'],
    repo: { paths: [SRC[lang(c)], 'README.md'] },
    self_check: ['What happens when you type a command name in a terminal: how does the shell find it?', 'What makes a command-line tool pleasant to use?'],
    commit: 'chore: project setup and help output',
    topics: ['dev.dev-tools.cli-basics', TOPIC[lang(c)]],
  }),
};

const storeStage: StageTemplate<Ctx> = {
  id: 'storage',
  minutes: [15, 25, 15],
  build: (c) => ({
    title: `Save ${c.n.many} to a file`,
    goal: `${upperFirst(c.n.many)} are kept in a JSON file in the user's data folder, written safely so a crash never corrupts it.`,
    steps: [
      { title: 'Design the record', detail: `${upperFirst(an(c.n.one))} has a numeric id plus ${fieldList(c.fields)}. Dates are YYYY-MM-DD text; money is a number of rupees.` },
      { title: 'Write the store', detail: 'Load returns an empty list when the file does not exist yet. Save writes to a temporary file and renames it over the real one, which is atomic. An environment variable can point at another folder, which tests will use.', code: storeCode(c) },
      { title: 'Try it', detail: 'Call save with two records from a scratch script, open the JSON file to check it, then load it back. Delete the file and check load returns an empty list.' },
    ],
    hints: ["Store data in the user's data or config folder, never next to the program.", 'Write JSON with indentation so people can read and fix it by hand.'],
    acceptance: ['Records survive between runs.', 'A missing file means an empty list, not a crash.', 'Writes go through a temporary file and a rename.'],
    repo: { paths: [SRC[lang(c)]] },
    self_check: ['Why write to a temporary file and rename it?', 'When would you switch from a JSON file to SQLite?'],
    commit: `feat: ${c.n.one} storage`,
    topics: [TOPIC[lang(c)]],
  }),
};

const addListStage: StageTemplate<Ctx> = {
  id: 'add-list',
  minutes: [25, 20, 10],
  build: (c) => ({
    title: 'The add and list commands',
    goal: `${cmd(c)} add creates ${an(c.n.one)} from arguments and options with clear errors, and ${cmd(c)} list shows them as a table.`,
    steps: [
      { title: 'The add command', detail: `The ${c.titleField.label} is the argument; the other fields are options (${andList(ordered(c).slice(1).map((f) => `--${flag(f)}`))}). Wrong types, unknown choices and bad dates are rejected with a message that says what to type instead.`, code: addCode(c) },
      { title: 'The list command', detail: `Show the newest ${c.n.many} first in an aligned table, money as rupees, and a helpful line when there are none.`, code: listCode(c) },
      { title: 'Try the errors', detail: `Run add with no arguments, a text value where a number goes${enumField(c)?.type === 'enum' ? ` and an unknown ${enumField(c)!.label}` : ''}. Each must exit with a non-zero code and a one-line message, never a stack trace.` },
    ],
    hints: ['Exit code 0 means success; anything else means failure. Scripts depend on this.', 'Print data to standard output and messages about problems to standard error.'],
    acceptance: [`add saves ${an(c.n.one)} with every field.`, 'Invalid input exits non-zero with a clear message.', 'list shows a readable table, newest first.'],
    repo: { paths: [SRC[lang(c)]] },
    self_check: ['Arguments versus options: how did you decide which is which?', 'Why do exit codes matter?'],
    commit: 'feat: add and list commands',
    topics: ['dev.dev-tools.cli-basics', TOPIC[lang(c)]],
  }),
};

const editStage: StageTemplate<Ctx> = {
  id: 'edit-delete',
  minutes: [20, 15, 15],
  build: (c) => ({
    title: 'The show, edit and delete commands',
    goal: `Any ${c.n.one} can be shown, changed field by field, or deleted after a confirmation.`,
    steps: [
      { title: 'show and edit', detail: `${cmd(c)} show ID prints every field. ${cmd(c)} edit ID --${flag(c.titleField)} "…" changes only the options given and validates them like add. An unknown id prints "No ${c.n.one} ID" and exits with 1.` },
      { title: 'delete with confirmation', detail: `${cmd(c)} delete ID asks "Delete ${c.n.one} ID? [y/N]" and does nothing unless the answer is yes. --yes skips the question for scripts.` },
      { title: 'Shared helpers', detail: 'Move "find by id or fail" and the field validation into one place used by add, edit and delete, so the rules cannot drift apart.' },
    ],
    hints: ['Default destructive prompts to No.', 'When standard input is not a terminal (a script), refuse to delete without --yes.'],
    acceptance: ['show prints every field.', 'edit changes only the given fields and validates them.', 'delete asks first; --yes skips the question.', 'Unknown ids exit with code 1 and a clear message.'],
    repo: { paths: [SRC[lang(c)]] },
    self_check: ['Why default a delete prompt to No?', 'How do you make a command safe to use in scripts?'],
    commit: 'feat: show, edit and delete commands',
    topics: [TOPIC[lang(c)]],
  }),
};

const queryStage: StageTemplate<Ctx> = {
  id: 'query',
  minutes: [20, 15, 15],
  build: (c) => {
    const ef = enumField(c);
    const nf = numberField(c) ?? c.fields.find((f) => f.type === 'date');
    return {
      title: 'Search, filter, sort and JSON output',
      goal: `list can search, filter and sort, and print JSON for other programs.`,
      steps: [
        { title: 'Search and filter', detail: `Add --search TEXT (case-insensitive match on the ${c.titleField.label})${ef ? ` and --${flag(ef)} VALUE` : ''} to list. Filters combine: both must match.` },
        { title: 'Sort and limit', detail: `Add --sort ${nf ? flag(nf) : 'id'} (and -${nf ? flag(nf) : 'id'} for descending) from a fixed list of allowed keys, and --limit N.` },
        { title: 'Machine-readable output', detail: `Add --json to print the matching records as JSON, so people can pipe it into other tools, for example: ${cmd(c)} list --json | jq length` },
      ],
      hints: ['Keep human output pretty and JSON output stable; scripts break when JSON changes.', 'Test filters on an empty list and on no matches.'],
      acceptance: ['--search and filters narrow the list.', 'Sorting works both ways and rejects unknown keys.', '--json prints valid JSON only.'],
      repo: { paths: [SRC[lang(c)]] },
      self_check: ['Why offer JSON output in a command-line tool?', 'What does it mean for output to be a stable interface?'],
      commit: 'feat: search, filters, sorting and JSON output',
      topics: [TOPIC[lang(c)]],
    };
  },
};

const csvStage: StageTemplate<Ctx> = {
  id: 'export-import',
  minutes: [20, 20, 15],
  build: (c) => ({
    title: 'Export and import CSV',
    goal: `${upperFirst(c.n.many)} can be exported to CSV for a spreadsheet and imported back, with bad rows reported instead of crashing.`,
    steps: [
      { title: 'export', detail: `${cmd(c)} export FILE.csv writes a header row (${c.fields.map((f) => snakeOf(f.name)).join(', ')}) and one row per ${c.n.one}, using the language's CSV library so commas and quotes inside text are handled.` },
      { title: 'import', detail: `${cmd(c)} import FILE.csv validates every row with the same rules as add, skips bad rows, and prints a summary: "Imported 18, skipped 2 (row 5: amount is not a number …)". --dry-run checks without saving.` },
      { title: 'Round trip', detail: 'Export, open the file in a spreadsheet, edit two rows, import into an empty data folder and compare. Then try a file with a broken row.' },
    ],
    hints: ['Never build CSV by joining strings with commas.', 'Read files as UTF-8 so names in Hindi or Tamil survive.'],
    acceptance: ['export writes a valid CSV with a header.', 'import adds valid rows and reports bad ones by row number.', '--dry-run changes nothing.'],
    repo: { paths: [SRC[lang(c)]] },
    self_check: ['What goes wrong when CSV is built by joining strings?', 'Why offer a dry run?'],
    commit: 'feat: CSV export and import',
    topics: [TOPIC[lang(c)]],
  }),
};

const featureStage: StageTemplate<Ctx> = {
  id: 'feature-1',
  minutes: [15, 25, 15],
  build: (c) => {
    const f = c.idea.features[0];
    return {
      title: upperFirst(f),
      goal: `A new command lets the tool ${f}.`,
      steps: [
        { title: 'Design the command', detail: `Choose the command name and options for "${f}" and write its --help text and two example calls in the README first.` },
        { title: 'Build it as a plain function', detail: `Put the logic in a function that takes the list of ${c.n.many} and returns the result, and keep the command a thin layer that parses options and prints.` },
        { title: 'Test it', detail: `Test the function with no ${c.n.many}, one, and several, including edge cases such as equal values and missing optional fields.` },
      ],
      hints: ['A pure function (input in, result out) is the easiest code to test.', 'Offer --json here too.'],
      acceptance: [`The tool can ${f}.`, 'The command has help text and examples.', 'The logic has unit tests.'],
      repo: { paths: [SRC[lang(c)], TEST_GLOB[lang(c)]] },
      self_check: [`Explain how "${f}" works, from options to output.`, 'Why separate the logic from argument parsing?'],
      commit: `feat: ${lowerFirst(f).slice(0, 60)}`,
      topics: [TOPIC[lang(c)]],
    };
  },
};

const testStage: StageTemplate<Ctx> = {
  id: 'tests',
  minutes: [15, 25, 15],
  build: (c) => {
    const t = testCode(c);
    return {
      title: 'Automated tests',
      goal: `The commands are tested end to end in a temporary data folder with one command: ${t.run}.`,
      steps: [
        { title: 'Isolate the data', detail: 'Point the tool at a temporary folder in every test (through the environment variable or by patching the path), so tests never touch your real data and can run in any order.' },
        { title: 'Test the commands', detail: 'Run the real commands with arguments and check the output and exit code: add then list, unknown id, invalid input.', code: t.code },
        { title: 'Run in CI', detail: 'Add a GitHub Actions workflow that runs the tests on Windows, macOS and Linux, because paths and line endings differ between them.' },
      ],
      hints: ['Test exit codes as well as output.', 'Windows paths use backslashes; build paths with the language path library, never by hand.'],
      acceptance: ['Tests run with one command.', 'Tests use a temporary data folder.', 'CI runs the tests on three operating systems.'],
      repo: { paths: [TEST_GLOB[lang(c)], '.github/workflows/*.yml'] },
      self_check: ['How do you test a program that reads and writes files?', 'Which bugs only appear on one operating system?'],
      commit: 'test: command tests and CI',
      topics: ['dev.dev-tools.testing-fundamentals'],
    };
  },
};

const packageStage: StageTemplate<Ctx> = {
  id: 'package',
  minutes: [20, 15, 15],
  build: (c) => ({
    title: 'Package it for others',
    goal: `Anyone can install ${cmd(c)} with one command, and the README shows what it does in under a minute.`,
    steps: [
      { title: 'Build an installable package', detail: 'Build the package and install it the way a user would (not from your source folder), then run it from another directory.', code: PUBLISH[lang(c)](c) },
      { title: 'Version and changelog', detail: 'Set version 1.0.0, add --version, and start a CHANGELOG.md. Tag the release in git (v1.0.0) and create a GitHub release.' },
      { title: 'README that sells it', detail: 'Write: what it does in one line, install command, a short recorded terminal session or a code block of example commands with their output, every command with one example, and where the data is stored.' },
    ],
    hints: ['Record a terminal demo with asciinema or a GIF tool; it explains a CLI faster than text.', 'Follow semantic versioning: breaking changes bump the major number.'],
    acceptance: ['The tool installs with one documented command.', '--version prints the version.', 'The README shows example commands and output.'],
    repo: { paths: ['README.md', 'CHANGELOG.md'], readme: ['Install', 'Usage'] },
    self_check: ['What is semantic versioning?', 'How does someone on another computer get and run your tool?'],
    commit: 'chore: package, version 1.0.0 and README',
    topics: ['dev.dev-tools.deployment-basics'],
  }),
};

const STAGES: Record<ProjectLevel, StageTemplate<Ctx>[]> = {
  beginner: [setup, storeStage, addListStage, editStage, queryStage, testStage, packageStage],
  intermediate: [setup, storeStage, addListStage, editStage, queryStage, csvStage, featureStage, testStage, packageStage],
  advanced: [],
};

const LEVELS: ProjectLevel[] = ['beginner', 'intermediate'];
const stack = (s: Omit<StackDef, 'kind' | 'levels' | 'roles'>): StackDef => ({ kind: 'cli', levels: LEVELS, roles: ['backend', 'devops'], ...s });

export const CLI = {
  stacks: [
    stack({ key: 'python-cli', label: 'Python + Typer + Rich', short: 'Python CLI', tech: ['Python', 'Typer', 'Rich', 'pytest'], skills: ['python', 'cli-basics', 'testing-fundamentals', 'git'], modules: ['dev.dev-tools'], lang: 'python', host: 'PyPI (or TestPyPI) and GitHub releases' }),
    stack({ key: 'node-cli', label: 'Node.js + TypeScript + Commander', short: 'Node.js CLI', tech: ['Node.js', 'TypeScript', 'Commander', 'Vitest'], skills: ['nodejs', 'typescript', 'cli-basics', 'testing-fundamentals'], modules: ['dev.dev-tools', 'dev.javascript'], lang: 'ts', host: 'npm and GitHub releases' }),
    stack({ key: 'go-cli', label: 'Go + Cobra', short: 'Go CLI', tech: ['Go', 'Cobra', 'GoReleaser'], skills: ['go', 'cli-basics', 'testing-fundamentals', 'git'], modules: ['dev.dev-tools'], lang: 'go', host: 'GitHub releases (GoReleaser binaries)' }),
  ],
  plan: {
    kind: 'cli',
    stages: (level: ProjectLevel) => STAGES[level],
    outcome: (c: Ctx) =>
      `An installable ${c.stack.short} tool, ${cmd(c)}, that manages ${c.n.many} from the terminal with add, list, show, edit, delete, search and JSON output, safe file storage, clear errors and exit codes, tests on three operating systems and a versioned release${c.level === 'intermediate' ? `, plus CSV export and import and a command to ${lowerFirst(c.idea.features[0])}` : ''}.`,
    readme: () => ['Install', 'Usage', 'Commands', 'Where data is stored', 'Development', 'Tests', 'Changelog'],
    deploy: (c: Ctx) => [
      'Push the code to a public GitHub repository.',
      'Build the package and install it from the built file, not the source folder.',
      `Tag v1.0.0 and publish on ${c.stack.host}.`,
      'Add the one-line install command and a terminal demo to the README.',
      'Put the install command and repository link on your resume.',
    ],
    verbs: ['Built', 'Designed', 'Packaged', 'Published', 'Tested', 'Automated'],
  } satisfies KindPlan<Ctx>,
};
