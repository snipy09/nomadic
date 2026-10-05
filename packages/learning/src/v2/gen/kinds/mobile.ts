/**
 * Mobile projects: an app idea built as an Android-first phone app in React
 * Native (Expo), Flutter or Kotlin with Jetpack Compose. Every level stores
 * data on the phone in SQLite, has list, form and detail screens, tests and a
 * release build; intermediate adds syncing with a REST API and one feature;
 * advanced adds all three features and accessibility, theming and reminders.
 */
import type { ProjectLevel } from '../../types';
import { an, andList, fieldList, lowerFirst, snakeOf, tsType, upperFirst } from '../names';
import type { Ctx, FieldDef, KindPlan, StackDef, StageTemplate } from '../types';

type Lang = 'react-native' | 'flutter' | 'android-compose';
const lang = (c: Ctx) => c.stack.key as Lang;
const col = (f: FieldDef) => snakeOf(f.name);
const q = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const dq = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const enumField = (c: Ctx) => c.fields.find((f) => f.type === 'enum' || f.type === 'boolean');
const numberField = (c: Ctx) => c.fields.find((f) => f.type === 'number' || f.type === 'money');
const SQLITE: Record<FieldDef['type'], string> = { text: 'TEXT', longtext: 'TEXT', number: 'INTEGER', money: 'REAL', date: 'TEXT', enum: 'TEXT', boolean: 'INTEGER' };

const DART: Record<FieldDef['type'], string> = { text: 'String', longtext: 'String', number: 'int', money: 'double', date: 'String', enum: 'String', boolean: 'bool' };
const KOTLIN: Record<FieldDef['type'], string> = { text: 'String', longtext: 'String', number: 'Int', money: 'Double', date: 'String', enum: 'String', boolean: 'Boolean' };

const SRC: Record<Lang, string> = { 'react-native': 'app/**', flutter: 'lib/**', 'android-compose': 'app/src/main/**' };
const TEST_GLOB: Record<Lang, string> = { 'react-native': '**/*.test.tsx', flutter: 'test/**', 'android-compose': 'app/src/*Test/**' };
const RUN: Record<Lang, string> = { 'react-native': 'npx expo start', flutter: 'flutter run', 'android-compose': 'the Run button in Android Studio' };

function createTable(c: Ctx): string {
  return `CREATE TABLE IF NOT EXISTS ${c.n.snakeMany} (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n${c.fields.map((f) => `  ${col(f)} ${SQLITE[f.type]}${f.required ? ' NOT NULL' : ''}`).join(',\n')}\n)`;
}

// ── Code per stack ──────────────────────────────────────────────────────────

const SETUP: Record<Lang, string> = {
  'react-native': 'npx create-expo-app@latest app --template default\ncd app\nnpx expo install expo-sqlite\nnpx expo start\n# scan the QR code with Expo Go on your phone, or press a for an Android emulator',
  flutter: 'flutter doctor          # fix anything it reports first\nflutter create app\ncd app\nflutter pub add sqflite path\nflutter run             # with a phone connected (USB debugging on) or an emulator',
  'android-compose': '# Android Studio: New Project > Empty Activity (Jetpack Compose), Kotlin, minimum SDK 26\n# app/build.gradle.kts: add the KSP plugin, then\nimplementation("androidx.room:room-runtime:2.6.1")\nimplementation("androidx.room:room-ktx:2.6.1")\nksp("androidx.room:room-compiler:2.6.1")\nimplementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.6")\nimplementation("androidx.navigation:navigation-compose:2.8.2")',
};

function model(c: Ctx): string {
  const N = c.n;
  switch (lang(c)) {
    case 'react-native':
      return `// lib/db.ts\nimport * as SQLite from 'expo-sqlite';\n\nexport type ${N.Pascal} = {\n  id: number;\n${c.fields.map((f) => `  ${col(f)}: ${f.type === 'boolean' ? 'number /* 0 or 1 */' : tsType(f)}${f.required || f.type === 'boolean' ? '' : ' | null'};`).join('\n')}\n};\n\nexport const db = SQLite.openDatabaseSync('app.db');\ndb.execSync(\`${createTable(c)}\`);\n\nexport const list${N.PascalMany} = () =>\n  db.getAllAsync<${N.Pascal}>('SELECT * FROM ${N.snakeMany} ORDER BY id DESC');\n\nexport const add${N.Pascal} = (x: Omit<${N.Pascal}, 'id'>) =>\n  db.runAsync(\n    'INSERT INTO ${N.snakeMany} (${c.fields.map(col).join(', ')}) VALUES (${c.fields.map(() => '?').join(', ')})',\n    ${c.fields.map((f) => `x.${col(f)}`).join(', ')}\n  );\n\nexport const delete${N.Pascal} = (id: number) => db.runAsync('DELETE FROM ${N.snakeMany} WHERE id = ?', id);`;
    case 'flutter':
      return `// lib/${N.snake}.dart\nclass ${N.Pascal} {\n  final int? id;\n${c.fields.map((f) => `  final ${DART[f.type]}${f.required || f.type === 'boolean' ? '' : '?'} ${f.name};`).join('\n')}\n\n  const ${N.Pascal}({this.id, ${c.fields.map((f) => `${f.required || f.type === 'boolean' ? 'required ' : ''}this.${f.name}`).join(', ')}});\n\n  Map<String, Object?> toMap() => {\n        'id': id,\n${c.fields.map((f) => `        '${col(f)}': ${f.type === 'boolean' ? `${f.name} ? 1 : 0` : f.name},`).join('\n')}\n      };\n\n  factory ${N.Pascal}.fromMap(Map<String, Object?> m) => ${N.Pascal}(\n        id: m['id'] as int,\n${c.fields.map((f) => `        ${f.name}: ${f.type === 'boolean' ? `m['${col(f)}'] == 1` : f.type === 'money' ? `(m['${col(f)}'] as num${f.required ? '' : '?'})${f.required ? '' : '?'}.toDouble()` : `m['${col(f)}'] as ${DART[f.type]}${f.required ? '' : '?'}`},`).join('\n')}\n      );\n}`;
    case 'android-compose':
      return `@Entity(tableName = "${N.snakeMany}")\ndata class ${N.Pascal}(\n  @PrimaryKey(autoGenerate = true) val id: Long = 0,\n${c.fields.map((f) => `  @ColumnInfo(name = "${col(f)}") val ${f.name}: ${KOTLIN[f.type]}${f.required || f.type === 'boolean' ? '' : '?'}${f.type === 'boolean' ? ' = false' : f.required ? '' : ' = null'},`).join('\n')}\n)\n\n@Dao\ninterface ${N.Pascal}Dao {\n  @Query("SELECT * FROM ${N.snakeMany} ORDER BY id DESC")\n  fun all(): Flow<List<${N.Pascal}>>\n\n  @Query("SELECT * FROM ${N.snakeMany} WHERE id = :id")\n  suspend fun byId(id: Long): ${N.Pascal}?\n\n  @Upsert\n  suspend fun save(item: ${N.Pascal})\n\n  @Delete\n  suspend fun delete(item: ${N.Pascal})\n}\n\n@Database(entities = [${N.Pascal}::class], version = 1)\nabstract class AppDatabase : RoomDatabase() {\n  abstract fun ${N.camel}Dao(): ${N.Pascal}Dao\n}`;
  }
}

function flutterDb(c: Ctx): string {
  const N = c.n;
  return `// lib/db.dart\nimport 'package:path/path.dart';\nimport 'package:sqflite/sqflite.dart';\nimport '${N.snake}.dart';\n\nFuture<Database> openAppDb() async => openDatabase(\n      join(await getDatabasesPath(), 'app.db'),\n      version: 1,\n      onCreate: (db, version) => db.execute('''\n${createTable(c)}\n'''),\n    );\n\nFuture<List<${N.Pascal}>> list${N.PascalMany}(Database db) async =>\n    (await db.query('${N.snakeMany}', orderBy: 'id DESC')).map(${N.Pascal}.fromMap).toList();\n\nFuture<int> add${N.Pascal}(Database db, ${N.Pascal} x) => db.insert('${N.snakeMany}', x.toMap()..remove('id'));`;
}

function listScreen(c: Ctx): string {
  const N = c.n;
  const t = c.titleField;
  const extra = c.fields.find((f) => f !== t && f.type !== 'longtext' && f.type !== 'boolean');
  switch (lang(c)) {
    case 'react-native':
      return `// app/index.tsx\nimport { useCallback, useState } from 'react';\nimport { FlatList, Pressable, Text, View } from 'react-native';\nimport { Link, useFocusEffect } from 'expo-router';\nimport { list${N.PascalMany}, type ${N.Pascal} } from '../lib/db';\n\nexport default function ${N.PascalMany}Screen() {\n  const [items, setItems] = useState<${N.Pascal}[] | null>(null);\n  const [error, setError] = useState(false);\n\n  useFocusEffect(\n    useCallback(() => {\n      list${N.PascalMany}().then(setItems).catch(() => setError(true));\n    }, [])\n  );\n\n  if (error) return <Text>Could not read your ${N.many}. Restart the app.</Text>;\n  if (!items) return <Text>Loading…</Text>;\n  return (\n    <View style={{ flex: 1 }}>\n      <FlatList\n        data={items}\n        keyExtractor={(x) => String(x.id)}\n        ListEmptyComponent={<Text>No ${N.many} yet. Tap + to add one.</Text>}\n        renderItem={({ item }) => (\n          <Link href={\`/${N.kebabMany}/\${item.id}\`} asChild>\n            <Pressable style={{ padding: 16 }} accessibilityRole="button">\n              <Text style={{ fontSize: 16 }}>{item.${col(t)}}</Text>${extra ? `\n              <Text style={{ opacity: 0.6 }}>{String(item.${col(extra)} ?? '')}</Text>` : ''}\n            </Pressable>\n          </Link>\n        )}\n      />\n      <Link href="/new" style={{ position: 'absolute', right: 24, bottom: 24, fontSize: 32 }} accessibilityLabel="Add ${N.one}">+</Link>\n    </View>\n  );\n}`;
    case 'flutter':
      return `class ${N.PascalMany}Screen extends StatefulWidget {\n  const ${N.PascalMany}Screen({super.key, required this.db});\n  final Database db;\n\n  @override\n  State<${N.PascalMany}Screen> createState() => _${N.PascalMany}ScreenState();\n}\n\nclass _${N.PascalMany}ScreenState extends State<${N.PascalMany}Screen> {\n  late Future<List<${N.Pascal}>> _items = list${N.PascalMany}(widget.db);\n\n  void _reload() => setState(() => _items = list${N.PascalMany}(widget.db));\n\n  @override\n  Widget build(BuildContext context) {\n    return Scaffold(\n      appBar: AppBar(title: const Text('${N.Many.replace(/'/g, "\\'")}')),\n      floatingActionButton: FloatingActionButton(\n        tooltip: 'Add ${N.one}',\n        onPressed: () async {\n          await Navigator.push(context, MaterialPageRoute(builder: (_) => ${N.Pascal}FormScreen(db: widget.db)));\n          _reload();\n        },\n        child: const Icon(Icons.add),\n      ),\n      body: FutureBuilder(\n        future: _items,\n        builder: (context, snap) {\n          if (snap.hasError) return const Center(child: Text('Could not read your ${N.many}.'));\n          if (!snap.hasData) return const Center(child: CircularProgressIndicator());\n          final items = snap.data!;\n          if (items.isEmpty) return const Center(child: Text('No ${N.many} yet. Tap + to add one.'));\n          return ListView.builder(\n            itemCount: items.length,\n            itemBuilder: (_, i) => ListTile(\n              title: Text(items[i].${t.name}${t.required ? '' : " ?? ''"}),${extra ? `\n              subtitle: Text('\${items[i].${extra.name}${extra.required ? '' : " ?? ''"}}'),` : ''}\n            ),\n          );\n        },\n      ),\n    );\n  }\n}`;
    case 'android-compose':
      return `class ${N.PascalMany}ViewModel(private val dao: ${N.Pascal}Dao) : ViewModel() {\n  val items: StateFlow<List<${N.Pascal}>?> = dao.all()\n    .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)\n}\n\n@Composable\nfun ${N.PascalMany}Screen(vm: ${N.PascalMany}ViewModel, onAdd: () -> Unit, onOpen: (Long) -> Unit) {\n  val items by vm.items.collectAsStateWithLifecycle()\n  Scaffold(\n    floatingActionButton = {\n      FloatingActionButton(onClick = onAdd) { Icon(Icons.Default.Add, contentDescription = "Add ${N.one}") }\n    }\n  ) { padding ->\n    when {\n      items == null -> Box(Modifier.fillMaxSize(), Alignment.Center) { CircularProgressIndicator() }\n      items!!.isEmpty() -> Box(Modifier.fillMaxSize().padding(padding), Alignment.Center) { Text("No ${N.many} yet. Tap + to add one.") }\n      else -> LazyColumn(contentPadding = padding) {\n        items(items!!, key = { it.id }) { item ->\n          ListItem(\n            headlineContent = { Text(item.${t.name}${t.required ? '' : ' ?: ""'}) },${extra ? `\n            supportingContent = { Text(item.${extra.name}${extra.required ? '' : '?'}.toString()${extra.required ? '' : ' ?: ""'}) },` : ''}\n            modifier = Modifier.clickable { onOpen(item.id) }\n          )\n        }\n      }\n    }\n  }\n}`;
  }
}

function formCode(c: Ctx): string {
  const N = c.n;
  switch (lang(c)) {
    case 'react-native':
      return `// lib/problems.ts: the form's fields and rules, outside the screen so they are easy to test\nexport type Field = { key: string; label: string; kind: 'text' | 'number' | 'date' | 'choice' | 'switch'; required?: boolean; options?: string[] };\nexport const FIELDS: Field[] = [\n${c.fields
        .map((f) => `  { key: ${q(col(f))}, label: ${q(upperFirst(f.label))}, kind: '${f.type === 'enum' ? 'choice' : f.type === 'boolean' ? 'switch' : f.type === 'number' || f.type === 'money' ? 'number' : f.type === 'date' ? 'date' : 'text'}'${f.required ? ', required: true' : ''}${f.type === 'enum' ? `, options: [${(f.options ?? []).map(q).join(', ')}]` : ''} },`)
        .join('\n')}\n];\n\nexport function problems(v: Record<string, string>) {\n  const out: Record<string, string> = {};\n  for (const f of FIELDS) {\n    const x = (v[f.key] ?? '').trim();\n    if (f.required && !x) out[f.key] = f.label + ' is required';\n    else if (f.kind === 'number' && x && !(Number(x) >= 0)) out[f.key] = 'Enter a number, 0 or more';\n    else if (f.kind === 'date' && x && !/^\\d{4}-\\d{2}-\\d{2}$/.test(x)) out[f.key] = 'Use YYYY-MM-DD';\n  }\n  return out;\n}\n// app/new.tsx: render a TextInput per text/number/date field (keyboardType="decimal-pad" for numbers),\n// a row of Pressable chips for a choice, and a Switch for yes/no. Show problems()[key] under\n// each field, and call add${N.Pascal}() then router.back() only when there are none.`;
    case 'flutter':
      return `// inside a Form(key: _form, child: ListView(children: [...]))\n${c.fields
        .map((f) => {
          const label = dq(upperFirst(f.label));
          if (f.type === 'enum')
            return `DropdownButtonFormField<String>(\n  decoration: InputDecoration(labelText: ${label}),\n  value: _${f.name},\n  items: [${(f.options ?? []).map((o) => `'${o}'`).join(', ')}].map((o) => DropdownMenuItem(value: o, child: Text(o))).toList(),\n  onChanged: (v) => setState(() => _${f.name} = v),${f.required ? "\n  validator: (v) => v == null ? 'Choose one' : null," : ''}\n),`;
          if (f.type === 'boolean') return `SwitchListTile(\n  title: Text(${label}),\n  value: _${f.name},\n  onChanged: (v) => setState(() => _${f.name} = v),\n),`;
          const num = f.type === 'number' || f.type === 'money';
          const check = num
            ? `(v) => ${f.required ? "(v ?? '').isEmpty ? 'Required' : " : "(v ?? '').isEmpty ? null : "}(num.tryParse(v!) ?? -1) < 0 ? 'Enter a number, 0 or more' : null`
            : f.type === 'date'
              ? `(v) => ${f.required ? "(v ?? '').isEmpty ? 'Required' : " : "(v ?? '').isEmpty ? null : "}DateTime.tryParse(v!) == null ? 'Use YYYY-MM-DD' : null`
              : f.required
                ? "(v) => (v ?? '').trim().isEmpty ? 'Required' : null"
                : 'null';
          return `TextFormField(\n  controller: _${f.name},\n  decoration: InputDecoration(labelText: ${label}${f.type === 'date' ? ", hintText: 'YYYY-MM-DD'" : ''}),${num ? '\n  keyboardType: const TextInputType.numberWithOptions(decimal: true),' : ''}${f.type === 'longtext' ? '\n  maxLines: 4,' : ''}\n  validator: ${check},\n),`;
        })
        .join('\n')}\nFilledButton(\n  onPressed: () async {\n    if (!_form.currentState!.validate()) return;\n    await add${N.Pascal}(widget.db, _build());\n    if (context.mounted) Navigator.pop(context);\n  },\n  child: const Text('Save'),\n),`;
    case 'android-compose':
      return `@Composable\nfun ${N.Pascal}Form(onSave: (${N.Pascal}) -> Unit) {\n${c.fields
        .map((f) => `  var ${f.name} by rememberSaveable { mutableStateOf(${f.type === 'boolean' ? 'false' : f.type === 'enum' ? `"${f.options?.[0] ?? ''}"` : '""'}) }`)
        .join('\n')}\n  var tried by rememberSaveable { mutableStateOf(false) }\n${c.fields
        .filter((f) => f.required && f.type !== 'boolean' && f.type !== 'enum')
        .map((f) => `  val ${f.name}Error = tried && ${f.type === 'number' || f.type === 'money' ? `(${f.name}.toDoubleOrNull() ?: -1.0) < 0` : `${f.name}.isBlank()`}`)
        .join('\n')}\n\n  Column(Modifier.padding(16.dp).verticalScroll(rememberScrollState())) {\n${c.fields
        .map((f) => {
          const label = dq(upperFirst(f.label));
          if (f.type === 'boolean') return `    Row(verticalAlignment = Alignment.CenterVertically) {\n      Text(${label}, Modifier.weight(1f))\n      Switch(checked = ${f.name}, onCheckedChange = { ${f.name} = it })\n    }`;
          if (f.type === 'enum') return `    Row { listOf(${(f.options ?? []).map((o) => dq(o)).join(', ')}).forEach { o -> FilterChip(selected = ${f.name} == o, onClick = { ${f.name} = o }, label = { Text(o) }) } }`;
          const err = f.required ? `,\n      isError = ${f.name}Error,\n      supportingText = { if (${f.name}Error) Text("${f.type === 'number' || f.type === 'money' ? 'Enter a number, 0 or more' : 'Required'}") }` : '';
          const kb = f.type === 'number' || f.type === 'money' ? ',\n      keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal)' : '';
          return `    OutlinedTextField(\n      value = ${f.name}, onValueChange = { ${f.name} = it },\n      label = { Text(${label}) }${err}${kb}\n    )`;
        })
        .join('\n')}\n    Button(onClick = { tried = true /* if no field has an error, build the ${N.one} and call onSave */ }) { Text("Save") }\n  }\n}`;
  }
}

function testCode(c: Ctx): { setup: string; code: string } {
  const N = c.n;
  const req = c.fields.find((f) => f.required && f.type !== 'boolean' && f.type !== 'enum') ?? c.titleField;
  switch (lang(c)) {
    case 'react-native':
      return { setup: 'npx expo install jest-expo jest @testing-library/react-native -- --save-dev\n# package.json: "jest": { "preset": "jest-expo" }, "test": "jest"', code: `// lib/problems.test.ts: test the rules as plain functions first\nimport { problems } from './problems';\n\nit('requires the ${req.label}', () => {\n  expect(problems({})).toHaveProperty(${q(col(req))});\n});\n\n// app/new.test.tsx\nit('shows an error instead of saving an empty form', async () => {\n  render(<New${N.Pascal}Screen />);\n  fireEvent.press(screen.getByText('Save'));\n  expect(await screen.findByText(${q(`${upperFirst(req.label)} is required`)})).toBeOnTheScreen();\n});` };
    case 'flutter':
      return { setup: '# flutter_test is already in dev_dependencies\nflutter test', code: `testWidgets('an empty form shows Required and does not save', (tester) async {\n  await tester.pumpWidget(MaterialApp(home: ${N.Pascal}FormScreen(db: fakeDb)));\n  await tester.tap(find.text('Save'));\n  await tester.pump();\n  expect(find.text('Required'), findsWidgets);\n});\n\ntest('${N.Pascal} survives a round trip through a map', () {\n  final x = ${N.Pascal}.fromMap({...sample.toMap(), 'id': 1});\n  expect(x.${c.titleField.name}, sample.${c.titleField.name});\n});` };
    case 'android-compose':
      return { setup: '// androidTestImplementation("androidx.compose.ui:ui-test-junit4")\n// testImplementation("androidx.room:room-testing:2.6.1")\n./gradlew connectedAndroidTest', code: `@get:Rule val rule = createComposeRule()\n\n@Test\nfun emptyFormShowsAnError() {\n  rule.setContent { ${N.Pascal}Form(onSave = { fail("must not save") }) }\n  rule.onNodeWithText("Save").performClick()\n  rule.onAllNodesWithText("Required").onFirst().assertIsDisplayed()\n}\n\n// Room: build an in-memory database, save ${an(N.one)}, read all() and check it is first` };
  }
}

const RELEASE: Record<Lang, string> = {
  'react-native': 'npm install -g eas-cli\neas login\neas build:configure\neas build -p android --profile preview   # an installable APK\n# eas.json "preview": { "android": { "buildType": "apk" } }',
  flutter: 'flutter build apk --release        # build/app/outputs/flutter-apk/app-release.apk\nflutter build appbundle --release  # for the Play Store\n# sign with your own upload key: android/key.properties (never commit it)',
  'android-compose': './gradlew assembleRelease   # signed with your release key from Build > Generate Signed Bundle / APK\n./gradlew bundleRelease     # app bundle for the Play Store\n# keep the keystore and its passwords out of git',
};

const SYNC: Record<Lang, string> = {
  'react-native': "const API = process.env.EXPO_PUBLIC_API_BASE; // set in .env, e.g. your laptop's LAN address\n\nexport async function pull() {\n  const ctrl = new AbortController();\n  const t = setTimeout(() => ctrl.abort(), 8000);\n  try {\n    const res = await fetch(`${API}/api/items`, { signal: ctrl.signal });\n    if (!res.ok) throw new Error('HTTP ' + res.status);\n    const rows = await res.json();\n    await db.withTransactionAsync(async () => {\n      // upsert each row into SQLite so the list works offline\n    });\n    return { ok: true as const };\n  } catch {\n    return { ok: false as const }; // keep showing the cached rows\n  } finally {\n    clearTimeout(t);\n  }\n}",
  flutter: "// flutter pub add http\nconst apiBase = String.fromEnvironment('API_BASE'); // flutter run --dart-define=API_BASE=...\n\nFuture<bool> pull(Database db) async {\n  try {\n    final res = await http.get(Uri.parse('$apiBase/api/items')).timeout(const Duration(seconds: 8));\n    if (res.statusCode != 200) return false;\n    final rows = (jsonDecode(res.body) as List).cast<Map<String, Object?>>();\n    await db.transaction((txn) async {\n      for (final r in rows) {\n        await txn.insert('items', r, conflictAlgorithm: ConflictAlgorithm.replace);\n      }\n    });\n    return true;\n  } catch (_) {\n    return false; // offline: keep showing the cached rows\n  }\n}",
  'android-compose': '// Retrofit + kotlinx.serialization; base URL from BuildConfig.API_BASE\ninterface Api {\n  @GET("api/items") suspend fun items(): List<ItemDto>\n}\n\nclass Repository(private val api: Api, private val dao: ItemDao) {\n  val items = dao.all() // the screen always reads the local database\n\n  suspend fun refresh(): Result<Unit> = runCatching {\n    val remote = api.items()\n    dao.upsertAll(remote.map { it.toEntity() })\n  }\n}\n// <uses-permission android:name="android.permission.INTERNET" /> in the manifest',
};

/** Catalogue topics that teach the UI layer (the catalogue has no Flutter or Android modules yet). */
const TOPIC: Record<Lang, string[]> = { 'react-native': ['dev.react.react'], flutter: [], 'android-compose': [] };

// ── Stages ──────────────────────────────────────────────────────────────────

const setup: StageTemplate<Ctx> = {
  id: 'setup',
  minutes: [20, 15, 15],
  build: (c) => ({
    title: 'Run an app on your phone',
    goal: `A new ${c.stack.short} app runs on a real Android phone or an emulator, reloads when you save, and is on GitHub.`,
    steps: [
      { title: 'Create the app', detail: `Install the tools (${lang(c) === 'react-native' ? 'Node.js and the Expo Go app on your phone' : lang(c) === 'flutter' ? 'the Flutter SDK and Android Studio for the SDK and emulator' : 'Android Studio with an emulator image'}) and create the project.`, code: SETUP[lang(c)] },
      { title: 'See it on a device', detail: `Start it with ${RUN[lang(c)]}. Change the title text, save, and watch the app update. If the phone cannot connect, put both on the same Wi-Fi or use an emulator.` },
      { title: 'Commit and push', detail: `Name the app after the idea (${c.idea.title}), commit and push to a new public GitHub repository with a README line on how to run it.` },
    ],
    hints: ['A real phone is faster than an emulator on most laptops; turn on developer options and USB debugging.', 'Read the first red error line carefully; most setup errors name the missing tool.'],
    acceptance: ['The app runs on a phone or emulator.', 'Saving a file updates the running app.', 'The project is on GitHub with a README.'],
    repo: { paths: [SRC[lang(c)], 'README.md'] },
    self_check: [lang(c) === 'react-native' ? 'What does Expo add on top of React Native?' : lang(c) === 'flutter' ? 'What is the difference between hot reload and hot restart?' : 'What is a composable function, and when does it run again?', 'How does your code get from the laptop onto the phone while developing?'],
    commit: 'chore: new app running on device',
    topics: [...TOPIC[lang(c)], 'dev.dev-tools.git'],
  }),
};

const modelStage: StageTemplate<Ctx> = {
  id: 'storage',
  minutes: [15, 25, 15],
  build: (c) => ({
    title: `Store ${c.n.many} on the phone`,
    goal: `${upperFirst(c.n.many)} are saved in a SQLite database on the phone and survive closing the app.`,
    steps: [
      { title: 'Design the data', detail: `${upperFirst(an(c.n.one))} has an id plus ${fieldList(c.fields)}. SQLite has no date or yes/no type: store dates as YYYY-MM-DD text and yes/no as 0 or 1.` },
      { title: lang(c) === 'android-compose' ? 'Entity, DAO and database' : 'Type and database', detail: lang(c) === 'android-compose' ? 'Describe the table with Room. The DAO returns a Flow, so the screen updates by itself whenever the data changes.' : 'Write the type for one row and open the database, creating the table on first run.', code: model(c) },
      lang(c) === 'flutter'
        ? { title: 'Open the database and prove it persists', detail: `Open the database once at start-up and pass it to the screens. Insert two ${c.n.many}, print them, then remove that code, fully close the app and open it again: the rows must still be there.`, code: flutterDb(c) }
        : { title: 'Prove it persists', detail: `Insert two ${c.n.many} from code on start-up, print them, then remove that code, fully close the app and open it again: the rows must still be there.` },
    ],
    hints: ['Never build SQL by joining strings with user input; use ? placeholders.', 'Changing the table later needs a migration (a version bump), so think about the columns now.'],
    acceptance: [`${upperFirst(c.n.many)} are saved in SQLite with every field.`, 'Data survives closing and reopening the app.', 'Queries use placeholders, not string joining.'],
    repo: { paths: [SRC[lang(c)]] },
    self_check: ['Why store data on the phone instead of only on a server?', 'What happens to your table when you ship a new version with an extra column?'],
    commit: `feat: ${c.n.one} storage`,
    topics: ['dev.databases.sql', 'dev.databases.database-design'],
  }),
};

const listStage: StageTemplate<Ctx> = {
  id: 'list-screen',
  minutes: [25, 15, 15],
  build: (c) => ({
    title: `The ${c.n.many} list`,
    goal: `The home screen lists ${c.n.many}, newest first, with loading and empty states and a button to add one.`,
    steps: [
      { title: 'Build the list screen', detail: `Read the rows when the screen opens (and again when you come back to it) and show the ${c.titleField.label} as the main line. Use a lazy list so 1,000 rows still scroll smoothly.`, code: listScreen(c) },
      { title: 'Empty and error states', detail: `With no data, show a friendly line that says how to add the first ${c.n.one}. If the database read fails, say so instead of showing a blank screen.` },
      { title: 'Check it on a small phone', detail: 'Try a long title, a large system font size and dark mode. Text must wrap and stay readable; tap targets must be at least 48 dp.' },
    ],
    hints: ['Give every list row a stable key (the id) so scrolling and updates stay correct.', 'Format money as rupees, for example ₹1,200.'],
    acceptance: [`${upperFirst(c.n.many)} show newest first.`, 'The empty state explains how to add one.', 'The list refreshes after adding an item.', 'It works with large fonts and dark mode.'],
    repo: { paths: [SRC[lang(c)]] },
    self_check: ['Why use a lazy list instead of rendering every row?', 'How does the list know to refresh after you add something?'],
    commit: `feat: ${c.n.many} list screen`,
    topics: TOPIC[lang(c)],
  }),
};

const formStage: StageTemplate<Ctx> = {
  id: 'form-screen',
  minutes: [25, 20, 15],
  build: (c) => ({
    title: `Add ${an(c.n.one)}`,
    goal: `A form screen adds ${an(c.n.one)} with the right keyboard per field, clear errors and no lost input.`,
    steps: [
      { title: 'Build the form', detail: `One input per field: ${andList(c.fields.map((f) => `${f.label} (${f.type === 'enum' ? 'choice' : f.type === 'boolean' ? 'switch' : f.type === 'number' || f.type === 'money' ? 'number keyboard' : f.type === 'date' ? 'date' : 'text'})`))}. Validate on Save and show the error under each field.`, code: formCode(c) },
      { title: 'Save and go back', detail: `On a valid Save, insert the ${c.n.one}, go back to the list and show it at the top. Disable Save while writing so a double tap cannot add it twice.` },
      { title: 'Respect the keyboard', detail: 'Make the form scroll so the keyboard never hides the field being typed in, and let the Next key move to the next field. Rotate the phone: typed values must stay.' },
    ],
    hints: ['Store what the user typed in state that survives rotation (rememberSaveable, controllers, component state).', 'Test with an empty form, spaces only and a negative number.'],
    acceptance: [`A valid ${c.n.one} is saved and appears in the list.`, 'Each invalid field shows its own message.', 'The keyboard never covers the active field.', 'Rotating the phone keeps the typed values.'],
    repo: { paths: [SRC[lang(c)]] },
    self_check: ['Where does form state live, and what survives a rotation?', 'How do you choose the keyboard type for each field?'],
    commit: `feat: add ${c.n.one} form`,
    topics: TOPIC[lang(c)],
  }),
};

const detailStage: StageTemplate<Ctx> = {
  id: 'detail-screen',
  minutes: [20, 20, 15],
  build: (c) => ({
    title: 'Details, edit and delete',
    goal: `Tapping ${an(c.n.one)} opens its details, which can be edited or deleted after a confirmation.`,
    steps: [
      { title: 'Detail screen with navigation', detail: `Navigate from a list row to a detail screen, passing only the id, and load the ${c.n.one} there. Show every field with its label; show "Not set" for empty optional fields.` },
      { title: 'Edit', detail: 'Reuse the form screen for editing: open it filled in, and update the row instead of inserting a new one. The list shows the change when you return.' },
      { title: 'Delete with a confirmation', detail: `Add Delete with a dialog ("Delete this ${c.n.one}? This cannot be undone.") and go back to the list after deleting. Optionally offer Undo in a snackbar for a few seconds.` },
    ],
    hints: ['Pass ids between screens, not whole objects; the screen loads fresh data.', 'The system back button must work on every screen.'],
    acceptance: [`Tapping a row opens its details.`, 'Editing updates the same row.', 'Deleting asks first and returns to the list.', 'Back works everywhere.'],
    repo: { paths: [SRC[lang(c)]] },
    self_check: ['Why pass an id to the detail screen instead of the whole object?', 'How did you reuse the form for both adding and editing?'],
    commit: `feat: ${c.n.one} details, edit and delete`,
    topics: TOPIC[lang(c)],
  }),
};

const syncStage: StageTemplate<Ctx> = {
  id: 'sync',
  minutes: [20, 25, 20],
  build: (c) => ({
    title: 'Sync with a REST API',
    goal: `The app loads ${c.n.many} from a REST API into its local database, shows cached data offline and tells the user when it cannot reach the server.`,
    steps: [
      { title: 'Have an API to talk to', detail: `Use the API from a backend project of yours (for example a ${c.idea.title} API), or run a simple JSON server on your laptop. An emulator reaches your laptop at 10.0.2.2; a real phone needs the laptop's Wi-Fi address.` },
      { title: 'Pull into the local database', detail: 'Fetch with a timeout, write the rows into SQLite in one transaction, and let the screens keep reading the local database. That makes the app work offline for free.', code: SYNC[lang(c)] },
      { title: 'Pull to refresh and offline state', detail: 'Add pull to refresh on the list. When the fetch fails, keep the cached rows and show a small "Offline: showing saved data" banner instead of an error screen.' },
    ],
    hints: ['Android blocks plain HTTP by default; use HTTPS in production and allow cleartext only for your debug build.', 'Never put API keys in the app; anyone can unpack an APK.'],
    acceptance: ['The list loads data from the API.', 'Turning on aeroplane mode still shows the saved data.', 'A failed refresh shows a clear, non-blocking message.'],
    repo: { paths: [SRC[lang(c)]] },
    self_check: ['Why read from the local database instead of straight from the network?', 'What happens if the same row changes on the phone and on the server?'],
    commit: 'feat: sync with the REST API',
    topics: ['dev.backend-core.rest-api-design', 'dev.dev-tools.http-fundamentals'],
  }),
};

function featureStage(i: 0 | 1 | 2): StageTemplate<Ctx> {
  return {
    id: `feature-${i + 1}`,
    minutes: [15, 25, 15],
    build: (c) => {
      const f = c.idea.features[i];
      const ef = enumField(c);
      const nf = numberField(c);
      return {
        title: upperFirst(f),
        goal: `The app can ${f}, in a way that feels natural on a phone.`,
        steps: [
          { title: 'Design it for a small screen', detail: `Sketch where "${f}" lives: its own tab, a section on the list screen or an action on the detail screen. Decide what it shows with no data, one ${c.n.one} and many.` },
          { title: 'Build it', detail: `Compute what it needs with a SQL query on the local database${ef ? ` (for example grouping by ${ef.label})` : ''}${nf ? ` or summing ${nf.label}` : ''}, keep the logic in a plain function, and build the screen around it.` },
          { title: 'Test it', detail: 'Unit-test the plain function with empty, single and many rows, and try the screen on a small phone with a large font size.' },
        ],
        hints: ['Keep logic out of UI code so it is easy to test.', 'Heavy work belongs off the main thread; the UI must never freeze.'],
        acceptance: [`The app can ${f}.`, 'Empty and loading states are handled.', 'The logic has unit tests.'],
        repo: { paths: [SRC[lang(c)], TEST_GLOB[lang(c)]] },
        self_check: [`How did you fit "${f}" on a small screen?`, 'What runs on the main thread in your app, and what does not?'],
        commit: `feat: ${lowerFirst(f).slice(0, 60)}`,
        topics: TOPIC[lang(c)],
      };
    },
  };
}

const polishStage: StageTemplate<Ctx> = {
  id: 'polish',
  minutes: [20, 20, 20],
  build: (c) => ({
    title: 'Accessibility, theme and reminders',
    goal: 'The app works with a screen reader and large fonts, follows the system theme, and can remind the user at a chosen time.',
    steps: [
      { title: 'Accessibility pass', detail: 'Turn on TalkBack and use every screen without looking: every button and icon has a spoken label, the order makes sense, and nothing relies on colour alone. Check 200% font size.' },
      { title: 'Light and dark theme', detail: 'Define colours once in a theme and follow the system light or dark setting. Check contrast in both (4.5:1 for text).' },
      { title: 'A local reminder', detail: `Let the user pick a time for a daily reminder about their ${c.n.many} with a local notification (${lang(c) === 'react-native' ? 'expo-notifications' : lang(c) === 'flutter' ? 'flutter_local_notifications' : 'WorkManager or AlarmManager plus NotificationCompat'}). Ask for notification permission only when they turn it on.` },
    ],
    hints: ['Ask for a permission at the moment it is needed, with a sentence explaining why.', 'Use the Accessibility Scanner app to find small tap targets and low contrast.'],
    acceptance: ['Every control has a spoken label.', 'The app follows the system theme with readable contrast.', 'The reminder fires at the chosen time and can be turned off.'],
    repo: { paths: [SRC[lang(c)]] },
    self_check: ['How did you test the app with a screen reader?', 'When and how does your app ask for notification permission?'],
    commit: 'feat: accessibility, theming and reminders',
    topics: TOPIC[lang(c)],
  }),
};

const testStage: StageTemplate<Ctx> = {
  id: 'tests',
  minutes: [15, 25, 15],
  build: (c) => {
    const t = testCode(c);
    return {
      title: 'Automated tests',
      goal: 'The data rules and the main form are covered by tests that run with one command.',
      steps: [
        { title: 'Set up testing', detail: 'Add the test tools and check one empty test passes.', code: t.setup },
        { title: 'Test the form and the data', detail: `Test that an empty form shows errors and does not save, and that ${an(c.n.one)} survives a save and a read.`, code: t.code },
        { title: 'Run before every push', detail: 'Add the test command to the README and run it before each push (or in a GitHub Actions workflow).' },
      ],
      hints: ['Move validation into a plain function; plain functions are the easiest thing to test.', 'Use an in-memory or temporary database in tests.'],
      acceptance: ['Tests run with one command.', 'An empty form is tested.', 'Saving and reading back is tested.'],
      repo: { paths: [TEST_GLOB[lang(c)]] },
      self_check: ['What is the difference between a unit test and a UI test on mobile?', 'Which bug would your tests have caught?'],
      commit: 'test: form and storage tests',
      topics: ['dev.dev-tools.testing-fundamentals'],
    };
  },
};

const releaseStage: StageTemplate<Ctx> = {
  id: 'release',
  minutes: [15, 20, 15],
  build: (c) => ({
    title: 'Release build and showcase',
    goal: 'An installable, signed Android build exists, and the README shows the app with screenshots and a download.',
    steps: [
      { title: 'Icon, name and version', detail: `Set the app name ("${c.idea.title}"), an icon, a splash screen and version 1.0.0. Remove debug logging and test data.` },
      { title: 'Build a signed release', detail: 'Build a release APK (to share) or app bundle (for the Play Store), signed with your own key that never goes into git. Install it on a phone and try every screen.', code: RELEASE[lang(c)] },
      { title: 'Showcase', detail: 'Add three phone screenshots and a 20-second screen recording to the README, attach the APK to a GitHub release, and describe the architecture in three lines.' },
    ],
    hints: ['Back up your signing key: losing it means you cannot update the app on the Play Store.', 'Test the release build, not only the debug build: they behave differently.'],
    acceptance: ['A signed release build installs and runs.', 'The README has screenshots and a download link.', 'The signing key is not in the repository.'],
    repo: { paths: ['README.md'], readme: ['Screenshots', 'Download'] },
    self_check: ['What is the difference between a debug and a release build?', 'What does app signing protect against?'],
    commit: 'chore: release build and README',
    topics: ['dev.dev-tools.deployment-basics'],
  }),
};

const STAGES: Record<ProjectLevel, StageTemplate<Ctx>[]> = {
  beginner: [setup, modelStage, listStage, formStage, detailStage, testStage, releaseStage],
  intermediate: [setup, modelStage, listStage, formStage, detailStage, syncStage, featureStage(0), testStage, releaseStage],
  advanced: [setup, modelStage, listStage, formStage, detailStage, syncStage, featureStage(0), featureStage(1), featureStage(2), polishStage, testStage, releaseStage],
};

const ALL: ProjectLevel[] = ['beginner', 'intermediate', 'advanced'];
const stack = (s: Omit<StackDef, 'kind' | 'levels' | 'roles' | 'host'>): StackDef => ({ kind: 'mobile', levels: ALL, roles: ['frontend', 'fullstack'], host: 'a GitHub release (APK) or the Google Play internal testing track', ...s });

export const MOBILE = {
  stacks: [
    stack({ key: 'react-native', label: 'React Native (Expo) + TypeScript + SQLite', short: 'React Native', tech: ['React Native', 'Expo', 'TypeScript', 'SQLite'], skills: ['react', 'typescript', 'javascript', 'sql'], modules: ['dev.javascript', 'dev.react'], lang: 'tsx' }),
    stack({ key: 'flutter', label: 'Flutter + Dart + sqflite', short: 'Flutter', tech: ['Flutter', 'Dart', 'SQLite'], skills: ['programming-fundamentals', 'oop', 'sql', 'rest-api-design'], modules: ['dev.dev-tools'], lang: 'dart' }),
    stack({ key: 'android-compose', label: 'Kotlin + Jetpack Compose + Room', short: 'Android', tech: ['Kotlin', 'Jetpack Compose', 'Room', 'Android'], skills: ['programming-fundamentals', 'oop', 'sql', 'rest-api-design'], modules: ['dev.dev-tools'], lang: 'kotlin' }),
  ],
  plan: {
    kind: 'mobile',
    stages: (level: ProjectLevel) => STAGES[level],
    outcome: (c: Ctx) =>
      `A ${c.stack.short} Android app for ${c.n.many} that stores data on the phone, with list, form and detail screens, validation, tests and a signed release build${c.level === 'beginner' ? '' : `, syncing with a REST API and working offline, and a way to ${lowerFirst(c.idea.features[0])}`}${c.level === 'advanced' ? `, plus ${lowerFirst(c.idea.features[1])}, ${lowerFirst(c.idea.features[2])}, screen-reader support, dark mode and reminders` : ''}.`,
    readme: () => ['Screenshots', 'Download', 'Features', 'Architecture', 'Tech stack', 'Run locally', 'Tests', "What's next"],
    deploy: (c: Ctx) => [
      'Push the code to a public GitHub repository (without the signing key).',
      'Build a signed release APK or app bundle and install it on a real phone.',
      `Publish it as ${c.stack.host}.`,
      'Add screenshots, a short screen recording and the download link to the README.',
      'Put the download link and one screenshot on your resume or portfolio.',
    ],
    verbs: ['Built', 'Designed', 'Shipped', 'Implemented', 'Tested', 'Published'],
  } satisfies KindPlan<Ctx>,
};
