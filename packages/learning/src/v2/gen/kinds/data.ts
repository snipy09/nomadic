/**
 * Data analysis projects: a public dataset (described in words, no links)
 * analysed in pandas, in SQL (DuckDB or PostgreSQL) or in a spreadsheet with a
 * BI dashboard. Every project gets the data, cleans it and answers the idea's
 * questions in two groups; intermediate adds exploration, statistical checks
 * and a report or dashboard; advanced adds a refresh pipeline, a published
 * app and reproducibility.
 *
 * Datasets have no structured columns, so code uses clearly named
 * placeholders (group_col, value_col, …) that the step text says to replace.
 */
import type { ProjectLevel } from '../../types';
import { clip, lowerFirst } from '../names';
import type { DataCtx, KindPlan, StackDef, StageTemplate } from '../types';

type Tool = 'pandas' | 'sql' | 'sheets';
const tool = (c: DataCtx): Tool => (c.stack.key === 'sql-analysis' ? 'sql' : c.stack.key === 'sheets-dashboard' ? 'sheets' : 'pandas');
const pick = <T>(c: DataCtx, v: Record<Tool, T>): T => v[tool(c)];

/** "ipl_matches" */
const slug = (c: DataCtx) => c.idea.key.replace(/-/g, '_');
const rawCsv = (c: DataCtx) => `data/raw/${slug(c)}.csv`;
/** A single-quoted Python string literal. */
const py = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
/** Text for a code comment: one line, clipped. */
const cmt = (s: string) => clip(s.replace(/\s+/g, ' ').trim(), 100);

// ── Questions ───────────────────────────────────────────────────────────────

type QKind = 'trend' | 'compare' | 'rank' | 'spread' | 'relation';

/** What shape of answer a question needs, from its wording. */
export function questionKind(q: string): QKind {
  const s = q.toLowerCase();
  if (/\b(over (the )?(years|time|seasons|months|decades?)|across (the )?(years|seasons|months|decades)|trends?|changed|grown|growth|by year|per year|each year|year on year|seasonal|month by month)\b/.test(s)) return 'trend';
  if (/\b(outliers?|distribution|spread|vary|varies|variation|range|skewed?|typical)\b/.test(s)) return 'spread';
  if (/\b(relationship|correlat\w*|how much does|how much do|holding|depends? on|affects?|impact|associated|linked)\b/.test(s)) return 'relation';
  if (/^(does|do|is|are|did|can|has|have|will)\b|\b(chance|likely|likelihood|favour|favours|differ|differs|versus|vs|compared|more than|less than)\b/.test(s)) return 'compare';
  return 'rank';
}

const CHART: Record<QKind, string> = {
  trend: 'a line chart with time on the x-axis (one line per group at most five groups)',
  compare: 'a bar chart of the rate or average per group, sorted, with the overall value as a dashed reference line',
  rank: 'a horizontal bar chart of the top 10, sorted, with the group size shown so small groups do not mislead',
  spread: 'a box plot per group (median and quartiles), plus a table of the rows outside the normal range',
  relation: 'a scatter plot with a trend line (use a hexbin or a sample when there are many points)',
};

const SHAPE: Record<QKind, string> = {
  trend: 'a change-over-time question',
  compare: 'a comparison question',
  rank: 'a ranking question',
  spread: 'a distribution and outlier question',
  relation: 'a relationship question',
};

const FALLBACK_Q = 'Which segment drives the answers above most, and does it hold in every year or region?';

function questionGroups(c: DataCtx): [string[], string[]] {
  const qs = c.idea.questions.length ? c.idea.questions : [FALLBACK_Q];
  const h = Math.max(1, Math.ceil(qs.length / 2));
  const a = qs.slice(0, Math.min(h, 3));
  const b = qs.slice(h, h + 3);
  return [a, b.length ? b : [FALLBACK_Q]];
}

function pandasAnswer(k: QKind, q: string, fig: string): string {
  const head = `# ${cmt(q)}\n`;
  const save = `ax.set_title('Replace with the answer in one line')\nplt.tight_layout()\nplt.savefig('figures/${fig}.png', dpi=150)`;
  switch (k) {
    case 'trend':
      return `${head}TIME, VALUE = 'year_col', 'value_col'  # e.g. df['year'] = df['date_col'].dt.year

trend = df.groupby(TIME)[VALUE].agg(['mean', 'size'])
trend['change'] = trend['mean'].diff()
display(trend)

ax = trend['mean'].plot(marker='o', figsize=(8, 4))
ax.set_ylabel(f'Average {VALUE}')
${save}`;
    case 'compare':
      return `${head}GROUP = 'group_col'
df['hit'] = df['outcome_col'] == 'outcome_value'  # the yes/no the question is about

rates = df.groupby(GROUP)['hit'].agg(rate='mean', n='size').query('n >= 20')
rates = rates.sort_values('rate')
display(rates)

overall = df['hit'].mean()
ax = rates['rate'].plot.barh(figsize=(8, 5))
ax.axvline(overall, ls='--', c='grey', label=f'overall {overall:.0%}')
ax.legend()
${save}`;
    case 'spread':
      return `${head}GROUP, VALUE = 'group_col', 'value_col'

q1, q3 = df[VALUE].quantile([0.25, 0.75])
low, high = q1 - 1.5 * (q3 - q1), q3 + 1.5 * (q3 - q1)
outliers = df[(df[VALUE] < low) | (df[VALUE] > high)]
print(f'{len(outliers)} rows outside {low:,.0f} to {high:,.0f}')
display(outliers.sort_values(VALUE).tail(10))

top = df[GROUP].value_counts().index[:10]
sub = df[df[GROUP].isin(top)]
order = sub.groupby(GROUP)[VALUE].median().sort_values().index
ax = sns.boxplot(data=sub, x=VALUE, y=GROUP, order=order, showfliers=False)
${save}`;
    case 'relation':
      return `${head}import statsmodels.formula.api as smf

X, Y, CONTROL = 'x_col', 'y_col', 'control_col'  # CONTROL: the column held constant

print(df[[X, Y]].corr(method='spearman'))
fit = smf.ols(f'{Y} ~ {X} + {CONTROL}', data=df).fit()
print(fit.params[X], fit.conf_int().loc[X].tolist())  # effect of +1 X, others fixed

sample = df.sample(min(len(df), 2000), random_state=42)
ax = sns.regplot(data=sample, x=X, y=Y, scatter_kws={'alpha': 0.3})
${save}`;
    default:
      return `${head}GROUP, VALUE = 'group_col', 'value_col'  # pick from df.columns
MIN_N = 20  # ignore groups too small to trust

table = (df.groupby(GROUP)[VALUE]
           .agg(mean='mean', n='size')
           .query('n >= @MIN_N')
           .sort_values('mean', ascending=False)
           .head(10))
display(table)

ax = table['mean'].sort_values().plot.barh(figsize=(8, 5))
ax.set_xlabel(f'Average {VALUE}')
${save}`;
  }
}

function sqlAnswer(k: QKind, q: string): string {
  const head = `-- ${cmt(q)}\n`;
  switch (k) {
    case 'trend':
      return `${head}WITH per_period AS (
  SELECT year_col, AVG(value_col) AS avg_value, COUNT(*) AS n
  FROM clean
  GROUP BY year_col
)
SELECT year_col,
       ROUND(avg_value::numeric, 2) AS avg_value,
       n,
       ROUND((avg_value - LAG(avg_value) OVER (ORDER BY year_col))::numeric, 2) AS change
FROM per_period
ORDER BY year_col;`;
    case 'compare':
      return `${head}SELECT group_col,
       ROUND(AVG(CASE WHEN outcome_col = 'outcome_value' THEN 1.0 ELSE 0 END)::numeric, 3) AS rate,
       COUNT(*) AS n
FROM clean
GROUP BY group_col
HAVING COUNT(*) >= 20
ORDER BY rate DESC;

-- The overall rate, for the reference line
SELECT ROUND(AVG(CASE WHEN outcome_col = 'outcome_value' THEN 1.0 ELSE 0 END)::numeric, 3) AS overall
FROM clean;`;
    case 'spread':
      return `${head}WITH b AS (
  SELECT percentile_cont(0.25) WITHIN GROUP (ORDER BY value_col) AS q1,
         percentile_cont(0.75) WITHIN GROUP (ORDER BY value_col) AS q3
  FROM clean
)
SELECT clean.*
FROM clean, b
WHERE value_col < q1 - 1.5 * (q3 - q1) OR value_col > q3 + 1.5 * (q3 - q1)
ORDER BY value_col DESC
LIMIT 50;

SELECT group_col, COUNT(*) AS n,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY value_col) AS median
FROM clean
GROUP BY group_col
ORDER BY median;`;
    case 'relation':
      return `${head}SELECT ROUND(corr(x_col, y_col)::numeric, 3) AS r, COUNT(*) AS n
FROM clean;

-- Hold control_col roughly constant: compare inside its quartiles
WITH banded AS (
  SELECT *, NTILE(4) OVER (ORDER BY control_col) AS band
  FROM clean
)
SELECT band, x_col, ROUND(AVG(y_col)::numeric, 2) AS avg_y, COUNT(*) AS n
FROM banded
GROUP BY band, x_col
ORDER BY band, x_col;`;
    default:
      return `${head}SELECT group_col,
       ROUND(AVG(value_col)::numeric, 2) AS avg_value,
       COUNT(*) AS n
FROM clean
GROUP BY group_col
HAVING COUNT(*) >= 20
ORDER BY avg_value DESC
LIMIT 10;`;
  }
}

function sheetsAnswer(k: QKind, q: string): string {
  const head = `Q: ${cmt(q)}\n`;
  switch (k) {
    case 'trend':
      return `${head}A2  =SORT(UNIQUE(data[year_col]))
B2  =AVERAGEIFS(data[value_col], data[year_col], A2)   (fill down)
C2  =COUNTIFS(data[year_col], A2)                      (fill down)
D3  =B3-B2                                             (change, fill down)

Chart: select A:B > Insert > Line chart. Title = the answer.`;
    case 'compare':
      return `${head}A2  =SORT(UNIQUE(data[group_col]))
B2  =COUNTIFS(data[group_col], A2, data[outcome_col], "outcome_value") / COUNTIFS(data[group_col], A2)
C2  =COUNTIFS(data[group_col], A2)                     (keep rows with C >= 20)
F1  =COUNTIFS(data[outcome_col], "outcome_value") / ROWS(data)   (overall rate)

Format B as %, sort by B, Insert > Bar chart.`;
    case 'spread':
      return `${head}H1  =QUARTILE.INC(data[value_col], 1)
H2  =QUARTILE.INC(data[value_col], 3)
H3  =H1 - 1.5 * (H2 - H1)      (lower fence)
H4  =H2 + 1.5 * (H2 - H1)      (upper fence)
Flag column in the data table:  =OR(E2 < $H$3, E2 > $H$4)

Pivot: rows = group_col, values = MEDIAN and COUNT of value_col.
Excel: Insert > Statistic chart > Box and Whisker.`;
    case 'relation':
      return `${head}=CORREL(data[x_col], data[y_col])
=SLOPE(data[y_col], data[x_col])        (change in y per +1 x)
=RSQ(data[y_col], data[x_col])

Holding another column constant: put x and control side by side, then
=LINEST(data[y_col], data[[x_col]:[control_col]])
Chart: Insert > Scatter, then add a linear trendline.`;
    default:
      return `${head}A2  =SORT(UNIQUE(data[group_col]))
B2  =AVERAGEIFS(data[value_col], data[group_col], A2)   (fill down)
C2  =COUNTIFS(data[group_col], A2)                      (fill down)

Or a pivot table: rows = group_col, values = Average and Count of value_col.
Filter Count >= 20, sort by Average, keep the top 10, Insert > Bar chart.`;
  }
}

function answerStep(c: DataCtx, q: string, n: number): { title: string; detail: string; code: string } {
  const k = questionKind(q);
  const how = pick(c, {
    pandas: 'Replace the placeholder column names with real ones from df.columns.',
    sql: `Save the query as sql/q${n}.sql, run it in the notebook with run(...) and plot the result DataFrame.`,
    sheets: 'Work on a new sheet named after the question; replace the placeholder column names with your table columns.',
  });
  return {
    title: clip(`Q${n}: ${q}`, 115),
    detail: clip(`This is ${SHAPE[k]}, so the right chart is ${CHART[k]}. ${how} Write the answer as one sentence with a number in it (for example "56% of matches…"), not "see chart".`, 880),
    code: pick(c, { pandas: pandasAnswer(k, q, `q${n}`), sql: sqlAnswer(k, q), sheets: sheetsAnswer(k, q) }),
  };
}

// ── Stages ──────────────────────────────────────────────────────────────────

const TOPICS = {
  load: (c: DataCtx) => pick(c, { pandas: ['dev.data-analysis.pandas'], sql: ['dev.databases.sql'], sheets: ['dev.data-analysis.excel'] }),
  clean: (c: DataCtx) => pick(c, { pandas: ['dev.data-analysis.data-cleaning', 'dev.data-analysis.pandas'], sql: ['dev.data-analysis.data-cleaning', 'dev.databases.sql'], sheets: ['dev.data-analysis.data-cleaning', 'dev.data-analysis.excel'] }),
  answer: (c: DataCtx) => pick(c, { pandas: ['dev.data-analysis.pandas', 'dev.data-communication.data-visualization'], sql: ['dev.databases.advanced-sql', 'dev.data-communication.data-visualization'], sheets: ['dev.data-analysis.excel', 'dev.data-communication.data-visualization'] }),
};

const workFile = (c: DataCtx) => pick(c, { pandas: 'analysis.ipynb', sql: 'analysis.ipynb', sheets: `workbook/${slug(c)}.xlsx` });

const getData: StageTemplate<DataCtx> = {
  id: 'get-data',
  minutes: [15, 15, 20, 20, 10],
  build: (c) => ({
    title: 'Get the data and take a first look',
    goal: `The ${c.idea.title} dataset is downloaded, loaded with ${c.stack.short} and described: rows, columns, types and obvious problems.`,
    steps: [
      {
        title: 'Set up the project',
        detail: pick(c, {
          pandas: 'Create a folder with data/raw, data/processed and figures, a virtual environment and JupyterLab. Add data/raw to .gitignore: raw downloads stay on your computer and the README says how to get them.',
          sql: 'Create a folder with data/raw, sql and figures, a virtual environment with DuckDB (a fast SQL database in one file, no server) and JupyterLab. Every query you keep goes in sql/ as a .sql file. PostgreSQL works too; the notes say where syntax differs.',
          sheets: 'Use Excel (desktop or the free web version) or Google Sheets. Make a project folder with workbook/ and screenshots/, and a GitHub repository for the README, the exported workbook and screenshots.',
        }),
        code: pick(c, {
          pandas: 'python -m venv .venv\n# Windows: .venv\\Scripts\\activate   macOS/Linux: source .venv/bin/activate\npip install pandas pyarrow matplotlib seaborn statsmodels scipy jupyterlab\nmkdir data data/raw data/processed figures\necho "data/raw/" >> .gitignore\njupyter lab',
          sql: 'python -m venv .venv\n# Windows: .venv\\Scripts\\activate   macOS/Linux: source .venv/bin/activate\npip install duckdb pandas matplotlib seaborn scipy jupyterlab\nmkdir data data/raw sql figures\necho "data/raw/" >> .gitignore\necho "*.duckdb" >> .gitignore\njupyter lab',
          sheets: 'mkdir workbook screenshots\ngit init\necho "~$*" >> .gitignore   # Excel lock files\ngit add .\ngit commit -m "chore: project folders"',
        }),
      },
      {
        title: 'Download the dataset',
        detail: clip(`${c.idea.source} Save the file(s) in ${tool(c) === 'sheets' ? 'the project folder' : 'data/raw'} and rename the main one to ${slug(c)}.csv. Note the source name, the date you downloaded it and its licence in a "Data" section of the README.`, 880),
      },
      {
        title: 'Load it',
        detail: pick(c, {
          pandas: 'Create analysis.ipynb in the project root and load the CSV. If there is more than one file, load each one and write down which column joins them.',
          sql: 'Create analysis.ipynb, load the CSV into a DuckDB table called raw and add a small run() helper that returns a pandas DataFrame, so every query result can be plotted.',
          sheets: 'Excel: Data > From Text/CSV > Load. Google Sheets: File > Import > Upload, "Insert new sheet". Then turn the range into a table (Excel: Ctrl+T; Sheets: Format > Convert to table) and name it data, so formulas can say data[column].',
        }),
        code: pick(c, {
          pandas: `import pandas as pd\nimport matplotlib.pyplot as plt\nimport seaborn as sns\n\nsns.set_theme(style='whitegrid')\ndf = pd.read_csv('${rawCsv(c)}', low_memory=False)\nprint(df.shape)\ndf.head()`,
          sql: `import duckdb\n\ncon = duckdb.connect('data/${slug(c)}.duckdb')\ncon.execute("CREATE OR REPLACE TABLE raw AS SELECT * FROM read_csv_auto('${rawCsv(c)}')")\n\ndef run(sql: str):\n    return con.sql(sql).df()\n\nrun('SELECT COUNT(*) AS n_rows FROM raw')`,
          sheets: 'Rows:              =ROWS(data)\nColumns:           =COLUMNS(data)\nBlank cells:       =COUNTBLANK(data[column_name])\nDistinct values:   =COUNTA(UNIQUE(data[column_name]))\nSmallest, largest: =MIN(data[column_name])   =MAX(data[column_name])',
        }),
      },
      {
        title: 'First look: shape, types and gaps',
        detail: clip(`Check what one row is against the description: ${c.idea.dataset} For every column note its type, how many values are missing and anything odd (numbers stored as text, dates in two formats, "NA" strings, impossible values). This list drives the cleaning stage.`, 880),
        code: pick(c, {
          pandas: "df.info()\ndisplay(df.describe(include='all').T)\n\nmissing = df.isna().mean().sort_values(ascending=False)\ndisplay(missing[missing > 0].to_frame('share_missing'))\nprint('duplicate rows:', df.duplicated().sum())",
          sql: "run('DESCRIBE raw')\nrun('SUMMARIZE raw')   # min, max, distinct and null share per column\nrun('SELECT * FROM raw USING SAMPLE 10')\nrun('SELECT COUNT(*) - COUNT(DISTINCT raw) AS duplicate_rows FROM raw')",
          sheets: 'Add a "profile" sheet with one row per column:\nA: column name   B: =COUNTBLANK(data[col])   C: =COUNTA(UNIQUE(data[col]))\nD: =MIN(data[col])   E: =MAX(data[col])\nUse a filter on each header to scan for odd values ("NA", "-", 0).',
        }),
      },
      {
        title: 'Commit',
        detail: `Write a "Data" section in README.md (what one row is, where it came from, how many rows) and commit ${tool(c) === 'sheets' ? 'the README' : 'the notebook and README'}. Never commit the raw data if it is large or its licence forbids it.`,
        code: 'git add .\ngit commit -m "chore: load the dataset and first look"',
      },
    ],
    hints: [
      'If the file will not load, check the encoding (try encoding="latin-1") and the separator before anything else.',
      'Write down the row count now; every later step should be able to explain why rows were removed.',
    ],
    acceptance: [
      `The dataset loads in ${c.stack.short} without errors.`,
      'The README says what one row is, where the data came from and how many rows there are.',
      'A list of data problems to fix (types, gaps, duplicates) exists in the notebook or workbook.',
    ],
    repo: { paths: [workFile(c), 'README.md'], readme: ['Data'] },
    self_check: ['What exactly is one row in this dataset, and why does that matter for every average you compute?', 'Which column worries you most, and why?'],
    commit: 'chore: load the dataset and first look',
    topics: TOPICS.load(c),
  }),
};

const clean: StageTemplate<DataCtx> = {
  id: 'clean',
  minutes: [20, 20, 20, 15],
  build: (c) => ({
    title: 'Clean the data',
    goal: 'Column names, types, missing values, duplicates and outliers are handled on purpose, and every change is counted.',
    steps: [
      {
        title: 'Names, types and duplicates',
        detail: pick(c, {
          pandas: 'Make column names snake_case, parse dates, turn numbers stored as text into numbers (strip commas and currency signs first) and drop exact duplicate rows. Print how many rows each step removed.',
          sql: 'Build a clean table from raw with SELECT DISTINCT, trimmed lower-case text, numbers cast safely and parsed dates. TRY_CAST and TRY_STRPTIME are DuckDB; in PostgreSQL use CAST inside a CASE with a regex check and TO_DATE.',
          sheets: 'Excel: Data > Get Data > Launch Power Query editor: Use first row as headers, Change type per column, Transform > Trim, Remove duplicates, Close and Load. Google Sheets: Data > Data cleanup > Trim whitespace and Remove duplicates, then Format > Number per column.',
        }),
        code: pick(c, {
          pandas: "df.columns = (df.columns.str.strip().str.lower()\n                .str.replace(r'[^a-z0-9]+', '_', regex=True).str.strip('_'))\n\nbefore = len(df)\ndf = df.drop_duplicates()\nprint('duplicates removed:', before - len(df))\n\nDATES = []    # e.g. ['date']\nNUMBERS = []  # numbers read as text, e.g. ['price']\nfor col in DATES:\n    df[col] = pd.to_datetime(df[col], errors='coerce', dayfirst=True)\nfor col in NUMBERS:\n    df[col] = pd.to_numeric(df[col].astype(str).str.replace(r'[^0-9.]', '', regex=True), errors='coerce')",
          sql: "-- sql/02_clean.sql (DuckDB)\nCREATE OR REPLACE TABLE clean AS\nSELECT DISTINCT\n  TRIM(LOWER(category_col))                         AS category_col,\n  TRY_CAST(REPLACE(number_col, ',', '') AS DOUBLE)  AS number_col,\n  TRY_STRPTIME(date_col, '%d-%m-%Y')::DATE          AS date_col,\n  * EXCLUDE (category_col, number_col, date_col)\nFROM raw;\n\nSELECT (SELECT COUNT(*) FROM raw) AS raw_rows,\n       (SELECT COUNT(*) FROM clean) AS clean_rows;",
          sheets: 'Helper columns when a value needs fixing (then paste as values):\nText:    =TRIM(LOWER(B2))\nNumber:  =IFERROR(VALUE(SUBSTITUTE(SUBSTITUTE(D2, ",", ""), "₹", "")), "")\nDate:    =IFERROR(DATEVALUE(C2), "")\nCheck:   =ROWS(data) before and after Remove duplicates',
        }),
      },
      {
        title: 'Missing values',
        detail: 'Decide per column, and write the reason next to it: drop the row (the value is essential, few rows), fill (a sensible default such as "unknown" for a category) or keep it missing (most analyses skip it). Never fill a number with 0 unless 0 is the truth.',
        code: pick(c, {
          pandas: "missing = df.isna().sum()\ndisplay(missing[missing > 0])\n\n# Decide per column and say why in a markdown cell\ndf = df.dropna(subset=['key_col'])            # essential: drop\ndf['category_col'] = df['category_col'].fillna('unknown')  # category: label it",
          sql: "SELECT COUNT(*) - COUNT(key_col) AS key_missing,\n       COUNT(*) - COUNT(category_col) AS category_missing\nFROM clean;\n\nDELETE FROM clean WHERE key_col IS NULL;\nUPDATE clean SET category_col = 'unknown' WHERE category_col IS NULL;",
          sheets: 'Count gaps per column:  =COUNTBLANK(data[col])\nFill a category gap:    =IF(B2 = "", "unknown", B2)\nFilter a column on (Blanks) to see and delete rows missing an essential value.',
        }),
      },
      {
        title: 'Outliers and impossible values',
        detail: 'Separate impossible values (negative prices, dates in the future, a score above the maximum) from rare but real ones. Remove or fix the impossible ones; flag the rare ones with an is_outlier column instead of deleting them, so the analysis can be run with and without them.',
        code: pick(c, {
          pandas: "VALUE = 'value_col'\nimpossible = df[VALUE] < 0\nprint('impossible:', impossible.sum())\ndf = df[~impossible]\n\nq1, q3 = df[VALUE].quantile([0.25, 0.75])\nfence = 1.5 * (q3 - q1)\ndf['is_outlier'] = ~df[VALUE].between(q1 - fence, q3 + fence)\nprint(df['is_outlier'].mean())",
          sql: "DELETE FROM clean WHERE value_col < 0;  -- impossible\n\nALTER TABLE clean ADD COLUMN is_outlier BOOLEAN;\nUPDATE clean SET is_outlier = value_col > (\n  SELECT percentile_cont(0.99) WITHIN GROUP (ORDER BY value_col) FROM clean\n);",
          sheets: 'Impossible:  filter value_col for < 0 and fix or delete\nFlag column: =OR(E2 < QUARTILE.INC(data[value_col], 1) - 1.5 * (QUARTILE.INC(data[value_col], 3) - QUARTILE.INC(data[value_col], 1)), E2 > QUARTILE.INC(data[value_col], 3) + 1.5 * (QUARTILE.INC(data[value_col], 3) - QUARTILE.INC(data[value_col], 1)))',
        }),
      },
      {
        title: 'Save the clean data and a cleaning log',
        detail: pick(c, {
          pandas: 'Save the clean table to data/processed/clean.parquet (types survive, unlike CSV) and add a markdown cell listing every change with the row count after it.',
          sql: 'Keep the clean table in the DuckDB file and the cleaning SQL in sql/02_clean.sql, so running the files in order rebuilds it. Add a cleaning log to the README.',
          sheets: 'Keep the raw import on its own sheet (never edit it) and the cleaned table on a "clean" sheet. Add a "log" sheet listing every change with the row count after it.',
        }),
        code: pick(c, {
          pandas: "df.to_parquet('data/processed/clean.parquet', index=False)\nprint(len(df), 'rows saved')",
          sql: "run('SELECT COUNT(*) AS rows, COUNT(*) FILTER (WHERE is_outlier) AS outliers FROM clean')",
          sheets: 'log sheet columns: Step | What changed | Why | Rows after',
        }),
      },
    ],
    hints: [
      'Clean in code (or Power Query) rather than by hand, so you can re-run it when the data changes.',
      'Look at ten random rows after cleaning; summary numbers hide broken text.',
    ],
    acceptance: [
      'Every column has the right type (numbers are numbers, dates are dates).',
      'Duplicates are removed and the count is recorded.',
      'Each column with missing values has a written decision.',
      'Outliers are flagged, not silently deleted.',
    ],
    repo: { paths: pick(c, { pandas: ['analysis.ipynb'], sql: ['sql/*.sql'], sheets: ['workbook/*.xlsx'] }) },
    self_check: ['Why flag outliers instead of deleting them?', 'Give one case where filling missing numbers with the average would mislead.'],
    commit: 'feat: clean the data with a cleaning log',
    topics: TOPICS.clean(c),
  }),
};

const explore: StageTemplate<DataCtx> = {
  id: 'explore',
  minutes: [20, 20, 15],
  build: (c) => ({
    title: 'Explore before answering',
    goal: 'You know how each important column is distributed and which columns move together, and you have written hypotheses for the questions.',
    steps: [
      {
        title: 'Distributions',
        detail: 'Plot every numeric column as a histogram and count the top values of each category column. Note skew (a long right tail means medians beat averages), spikes at round numbers and categories that should be merged (spelling variants).',
        code: pick(c, {
          pandas: "num = df.select_dtypes('number').columns\ncat = df.select_dtypes(exclude='number').columns\n\ndf[num].hist(bins=30, figsize=(12, 8))\nplt.tight_layout()\nplt.savefig('figures/distributions.png', dpi=150)\n\nfor col in cat[:6]:\n    display(df[col].value_counts(dropna=False).head(10))",
          sql: "-- Histogram of a number in bins of 100 (change the width to suit)\nSELECT FLOOR(value_col / 100) * 100 AS bin, COUNT(*) AS n\nFROM clean\nGROUP BY bin\nORDER BY bin;\n\n-- Top values of a category\nSELECT category_col, COUNT(*) AS n\nFROM clean\nGROUP BY category_col\nORDER BY n DESC\nLIMIT 10;",
          sheets: 'Numbers: select the column > Insert > Chart > Histogram.\nCategories: pivot table with rows = category_col, values = COUNTA, sorted descending.\nA quick frequency table:  =COUNTIFS(data[value_col], ">=" & A2, data[value_col], "<" & A3)',
        }),
      },
      {
        title: 'Relationships',
        detail: 'Check which numeric columns move together (Spearman correlation copes with skew) and how a key number differs across the main category. Correlation is a lead to investigate, not an answer.',
        code: pick(c, {
          pandas: "corr = df[num].corr(method='spearman')\nsns.heatmap(corr, annot=True, fmt='.2f', cmap='vlag', center=0)\nplt.tight_layout()\nplt.savefig('figures/correlations.png', dpi=150)\n\ndisplay(df.groupby('category_col')['value_col'].describe())",
          sql: 'SELECT corr(x_col, y_col) AS r FROM clean;\n\nSELECT category_col, COUNT(*) AS n,\n       AVG(value_col) AS mean,\n       percentile_cont(0.5) WITHIN GROUP (ORDER BY value_col) AS median\nFROM clean\nGROUP BY category_col\nORDER BY median DESC;',
          sheets: 'Correlation between two columns:  =CORREL(data[x_col], data[y_col])\nA small matrix: one CORREL per pair, then Format > Conditional formatting > Color scale.',
        }),
      },
      {
        title: 'Write hypotheses',
        detail: clip(`For each question, write what you expect to find and why, before computing it. The questions: ${c.idea.questions.map((q, i) => `(${i + 1}) ${q}`).join(' ')}`, 880),
      },
    ],
    hints: ['Use a log scale when a histogram is one tall bar and a long tail.', 'Merge category spellings (for example "Bengaluru" and "Bangalore") before grouping.'],
    acceptance: ['Every numeric column has a histogram.', 'A correlation table or matrix is saved.', 'Each question has a written hypothesis.'],
    repo: { paths: pick(c, { pandas: ['analysis.ipynb', 'figures/*.png'], sql: ['analysis.ipynb', 'sql/*.sql'], sheets: ['workbook/*.xlsx'] }) },
    self_check: ['When is the median a better summary than the mean?', 'Why write a hypothesis before looking at the answer?'],
    commit: 'feat: exploratory analysis and hypotheses',
    topics: ['dev.data-analysis.statistics', 'dev.data-communication.data-visualization'],
  }),
};

function answerStage(index: 0 | 1): StageTemplate<DataCtx> {
  return {
    id: `questions-${index + 1}`,
    minutes: [20, 20, 20, 15],
    build: (c) => {
      const groups = questionGroups(c);
      const qs = groups[index];
      const start = index === 0 ? 1 : groups[0].length + 1;
      const end = start + qs.length - 1;
      const steps = qs.map((q, i) => answerStep(c, q, start + i));
      if (steps.length < 3) {
        const q = qs[qs.length - 1];
        steps.push({
          title: 'Check the answers hold up',
          detail: `Re-run Q${end} on two halves of the data (for example before and after a middle year, or two regions) and once without the flagged outliers. If the answer flips, say so: that is a finding too. Question: "${clip(q, 200)}"`,
          code: pick(c, {
            pandas: "for name, part in [('with outliers', df), ('without outliers', df[~df['is_outlier']])]:\n    print(name, part.groupby('group_col')['value_col'].mean().round(2).head(), sep='\\n')",
            sql: "SELECT is_outlier, group_col, ROUND(AVG(value_col)::numeric, 2) AS avg_value, COUNT(*) AS n\nFROM clean\nGROUP BY is_outlier, group_col\nORDER BY group_col, is_outlier;",
            sheets: 'Add the is_outlier flag as a pivot filter and compare the table with the flag on and off.',
          }),
        });
      }
      return {
        title: qs.length === 1 ? `Answer question ${start}` : `Answer questions ${start} to ${end}`,
        goal: `Each question has a query or calculation, the right chart and a one-sentence answer with a number in it.`,
        steps: [
          ...steps,
          {
            title: 'Polish the charts and write the answers',
            detail: `For each chart: the title states the answer, axes have units (₹, %, count), groups are sorted, and small groups are left out or marked. Under each chart write the answer, the number behind it and one caveat (sample size, missing data, what the data cannot show).`,
          },
        ],
        hints: [
          'A chart title like "Chasing teams win 56% at this venue" beats "Win rate by venue".',
          'Always show n (how many rows sit behind each bar); a 100% rate from 3 matches means nothing.',
        ],
        acceptance: [
          `Questions ${start} to ${end} each have a query or formula that produces the answer.`,
          'Each answer is one sentence with a number, under a chart that suits the question.',
          'Groups with too few rows are filtered or flagged.',
          'Charts have titles, axis labels and units.',
        ],
        repo: { paths: pick(c, { pandas: ['analysis.ipynb', 'figures/*.png'], sql: ['sql/*.sql', 'figures/*.png'], sheets: ['workbook/*.xlsx', 'screenshots/*.png'] }) },
        self_check: [`Why did you pick that chart type for Q${start}?`, 'Which answer are you least sure about, and what would make you surer?'],
        commit: `feat: answer questions ${start} to ${end}`,
        topics: TOPICS.answer(c),
      };
    },
  };
}

const stats: StageTemplate<DataCtx> = {
  id: 'stats',
  minutes: [15, 20, 20, 15],
  build: (c) => ({
    title: 'Check the findings with statistics',
    goal: 'The main findings come with a 95% confidence interval or a test, so you can say which differences are real and which could be noise.',
    steps: [
      {
        title: 'Pick the claims to check',
        detail: 'List the two or three findings you will lead with. For each, write it as a comparison: "group A has a higher rate or average than group B", or "x is linked to y". Those are the ones that need numbers behind them.',
      },
      {
        title: 'Confidence intervals',
        detail: 'Add a 95% confidence interval to each rate or average you report. Wide intervals mean "we cannot tell yet"; overlapping intervals are a warning sign.',
        code: pick(c, {
          pandas: "from statsmodels.stats.proportion import proportion_confint\n\nhits, n = int(df['hit'].sum()), len(df)\nlow, high = proportion_confint(hits, n, alpha=0.05, method='wilson')\nprint(f'{hits / n:.1%} (95% CI {low:.1%} to {high:.1%}), n = {n}')\n\nm = df['value_col'].agg(['mean', 'std', 'count'])\nmargin = 1.96 * m['std'] / m['count'] ** 0.5\nprint(f\"{m['mean']:.2f} ± {margin:.2f}\")",
          sql: "WITH g AS (\n  SELECT group_col,\n         AVG(CASE WHEN outcome_col = 'outcome_value' THEN 1.0 ELSE 0 END) AS p,\n         COUNT(*) AS n\n  FROM clean\n  GROUP BY group_col\n)\nSELECT group_col, n, ROUND(p, 3) AS p,\n       ROUND(p - 1.96 * SQRT(p * (1 - p) / n), 3) AS low,\n       ROUND(p + 1.96 * SQRT(p * (1 - p) / n), 3) AS high\nFROM g\nORDER BY p DESC;",
          sheets: 'Average and its 95% margin for group "A":\n=AVERAGEIFS(data[value_col], data[group_col], "A")\n=CONFIDENCE.T(0.05, STDEV.S(FILTER(data[value_col], data[group_col] = "A")), COUNTIFS(data[group_col], "A"))\nShare p (B2) from n rows (C2), margin:  =1.96 * SQRT(B2 * (1 - B2) / C2)',
        }),
      },
      {
        title: 'Test the key difference',
        detail: pick(c, {
          pandas: "Use a two-proportion z-test for rates and Welch's t-test for averages (it does not assume equal variances). Report the size of the gap first and the p-value second.",
          sql: "SQL gives you the group counts; run the test in the notebook on the query result with scipy (Welch's t-test for averages, a chi-square test for rates).",
          sheets: "Use T.TEST with type 3 (Welch, unequal variances) for two averages. For rates, compare the confidence intervals from the previous step.",
        }),
        code: pick(c, {
          pandas: "from scipy import stats\nfrom statsmodels.stats.proportion import proportions_ztest\n\na = df[df['group_col'] == 'A']   # the two groups you compare\nb = df[df['group_col'] == 'B']\nz, p = proportions_ztest([a['hit'].sum(), b['hit'].sum()], [len(a), len(b)])\nprint(f'rates {a.hit.mean():.1%} vs {b.hit.mean():.1%}, p = {p:.3f}')\n\nt, p = stats.ttest_ind(a['value_col'].dropna(), b['value_col'].dropna(), equal_var=False)\nprint(f'means {a.value_col.mean():.2f} vs {b.value_col.mean():.2f}, p = {p:.3f}')",
          sql: "from scipy import stats\n\nt = run(\"SELECT group_col, value_col FROM clean WHERE group_col IN ('A', 'B')\")\na = t.loc[t.group_col == 'A', 'value_col'].dropna()\nb = t.loc[t.group_col == 'B', 'value_col'].dropna()\nprint(stats.ttest_ind(a, b, equal_var=False))\n\ncounts = run(\"SELECT group_col, outcome_col = 'outcome_value' AS hit, COUNT(*) AS n FROM clean GROUP BY ALL\")\nprint(stats.chi2_contingency(counts.pivot(index='group_col', columns='hit', values='n').fillna(0)))",
          sheets: '=T.TEST(FILTER(data[value_col], data[group_col] = "A"), FILTER(data[value_col], data[group_col] = "B"), 2, 3)\nA result below 0.05 means a gap this large would be unusual if the groups were truly the same.',
        }),
      },
      {
        title: 'Write the caveats',
        detail: 'For each finding note: how many rows it rests on, whether it is a correlation (not a cause), what is missing from the data, and how many comparisons you tried (test 20 things and one will look significant by chance).',
      },
    ],
    hints: ['A tiny p-value on a tiny gap is still a tiny gap: lead with the effect size.', 'With many groups, compare the top one with the rest, not every pair.'],
    acceptance: [
      'Each headline finding has a 95% interval or a test result next to it.',
      'Effect sizes are stated in plain units (percentage points, rupees, runs).',
      'Caveats are written for every headline finding.',
    ],
    repo: { paths: pick(c, { pandas: ['analysis.ipynb'], sql: ['analysis.ipynb', 'sql/*.sql'], sheets: ['workbook/*.xlsx'] }) },
    self_check: ['What does a 95% confidence interval actually mean?', 'Why can a correlation in this data not prove a cause?'],
    commit: 'feat: confidence intervals and tests for key findings',
    topics: ['dev.data-analysis.statistics'],
  }),
};

const report: StageTemplate<DataCtx> = {
  id: 'report',
  minutes: [20, 25, 20, 15],
  build: (c) => {
    const sheets = tool(c) === 'sheets';
    return {
      title: sheets ? 'Build the dashboard' : 'Write the report',
      goal: sheets
        ? 'An interactive dashboard answers the questions at a glance, with filters and three to five headline insights.'
        : 'A short report tells the story in three to five insights, each with a chart, a number and a caveat.',
      steps: [
        {
          title: 'Choose the three to five insights',
          detail: 'Rank your answers by how surprising and useful they are to someone who cares about this topic (a team analyst, a buyer, a manager). Keep three to five; cut the rest to an appendix.',
        },
        sheets
          ? {
              title: 'Connect the data and add measures',
              detail: 'Power BI Desktop: Get data > Excel workbook > the clean table, then add measures. Looker Studio: add a data source from Google Sheets > the clean sheet, then add calculated fields. Measures beat pre-computed cells: they follow the filters.',
              code: 'Power BI (DAX measures)\nRows = COUNTROWS(data)\nAverage value = AVERAGE(data[value_col])\nHit rate = DIVIDE(CALCULATE(COUNTROWS(data), data[outcome_col] = "outcome_value"), COUNTROWS(data))\n\nLooker Studio (calculated field)\nHit rate = SUM(CASE WHEN outcome_col = "outcome_value" THEN 1 ELSE 0 END) / COUNT(outcome_col)',
            }
          : {
              title: 'Write the report',
              detail: 'Create report.ipynb (or REPORT.md): a two-line summary at the top, then one section per insight with a headline sentence, the chart, the number with its interval, why it matters and a caveat. End with what the data cannot tell you. Hide code in the exported version.',
              code: '# REPORT.md outline\n## Summary (two lines)\n## 1. <headline with a number>\n![chart](figures/q1.png)\nWhat it shows, n, 95% interval. Why it matters. Caveat.\n## 2. …\n## What this data cannot tell us\n## Method (data source, cleaning, tests)',
            },
        sheets
          ? {
              title: 'Lay out the dashboard',
              detail: 'Top row: three or four KPI cards. Below: one chart per insight, titled with the answer. Add slicers or filter controls for the main category and the time column. Keep one accent colour for the thing to notice and grey for everything else.',
            }
          : {
              title: 'Make the charts presentation-ready',
              detail: 'Same colours for the same group across charts, one highlight colour for the point of the chart and grey for the rest, labelled values instead of gridlines where possible, readable at phone width. Re-save every figure at 150 dpi.',
              code: "PALETTE = {'highlight': '#2338E0', 'rest': '#B8BCC8'}\ncolors = [PALETTE['highlight'] if g == 'group to notice' else PALETTE['rest'] for g in table.index]\nax = table['mean'].plot.barh(color=colors)\nax.bar_label(ax.containers[0], fmt='%.1f')\nsns.despine()",
            },
        {
          title: sheets ? 'Publish and capture' : 'Export and share',
          detail: sheets
            ? 'Looker Studio: Share > anyone with the link can view. Power BI: publish to your workspace and export to PDF. Save screenshots of every page in screenshots/ and put the link and the images in the README.'
            : 'Export the report to HTML without code cells and link it from the README. Ask a friend to read it for two minutes and tell you the main point; if they cannot, rewrite the summary.',
          code: sheets ? undefined : 'jupyter nbconvert --to html --no-input report.ipynb',
        },
      ],
      hints: ['Write the headline first, then build the chart that proves it.', 'One idea per chart; if a chart needs a paragraph to explain, split it.'],
      acceptance: [
        'Three to five insights, each with a headline that contains a number.',
        'Every insight has a chart and a caveat.',
        sheets ? 'The dashboard has KPI cards and at least one working filter.' : 'The report opens without running code (HTML or Markdown).',
        'The README links to the report or dashboard.',
      ],
      repo: { paths: sheets ? ['screenshots/*.png', 'README.md'] : ['report.ipynb', 'README.md'], readme: ['Key findings'] },
      self_check: ['Which insight would you lead with in an interview, and why that one?', 'What would you change in the analysis if the audience were a manager rather than an analyst?'],
      commit: sheets ? 'feat: dashboard with KPIs, charts and filters' : 'docs: report with key insights',
      topics: sheets ? ['dev.data-communication.bi-tools', 'dev.data-communication.data-storytelling'] : ['dev.data-communication.data-storytelling', 'dev.data-communication.data-visualization'],
    };
  },
};

const share: StageTemplate<DataCtx> = {
  id: 'share',
  minutes: [20, 20, 15],
  build: (c) => ({
    title: c.level === 'beginner' ? 'Share your findings' : 'Publish the project',
    goal: 'The repository explains the project in one minute: the question, the data, the answers with charts, and how to reproduce them.',
    steps: [
      {
        title: c.level === 'beginner' ? (tool(c) === 'sheets' ? 'Build a summary sheet' : 'Write the findings') : 'Tidy the work',
        detail:
          c.level === 'beginner'
            ? tool(c) === 'sheets'
              ? 'Add a "Summary" sheet as the first tab: the questions on the left, the answer to each in one sentence, and the matching chart next to it. Freeze the header and hide helper columns.'
              : 'Add a "Findings" section at the top of the notebook: one sentence with a number per question and the chart that shows it. Restart the kernel and run all cells to prove it runs top to bottom.'
            : 'Remove dead cells or sheets, name files in order, restart and run everything from scratch, and check every figure in figures/ or screenshots/ is current.',
      },
      {
        title: 'Write the README',
        detail: `Sections: what you analysed and why (one line), the data and how to get it (${clip(lowerFirst(c.idea.source), 120)}), key findings with two or three charts, how to run it, and what you would analyse next.`,
        code: `# ${c.idea.title}\n\n${clip(c.idea.pitch, 200)}\n\n## Key findings\n1. … (one sentence with a number)\n![Q1](figures/q1.png)\n\n## Data\nWhat one row is, source, download date, rows after cleaning.\n\n## How to run\n${tool(c) === 'sheets' ? 'Open the workbook in workbook/ or the dashboard link.' : 'pip install -r requirements.txt, then open analysis.ipynb'}\n\n## Next`,
      },
      {
        title: 'Push and pin',
        detail: 'Push to a public GitHub repository, add a one-line description and topics (data-analysis, the domain), and pin it on your profile. Put the repository link on your resume with the single most interesting finding.',
        code: `${tool(c) === 'sheets' ? '' : 'pip freeze > requirements.txt\n'}git add .\ngit commit -m "docs: README with key findings"\ngit push`,
      },
    ],
    hints: ['Recruiters read the first screen of the README only: findings go above the method.', 'Check the charts render on GitHub (relative image paths, committed files).'],
    acceptance: ['The README states the key findings with numbers and charts.', 'The README says how to get the data without committing large raw files.', 'The project is public on GitHub.'],
    repo: { paths: ['README.md', tool(c) === 'sheets' ? 'workbook/*.xlsx' : 'figures/*.png'], readme: ['Key findings', 'Data'] },
    self_check: ['Explain the project and its main finding in thirty seconds.', 'What would you analyse next with one more week?'],
    commit: 'docs: README with key findings',
    topics: ['dev.data-communication.data-storytelling'],
  }),
};

const pipeline: StageTemplate<DataCtx> = {
  id: 'pipeline',
  minutes: [20, 25, 20, 20],
  build: (c) => {
    const sql = tool(c) === 'sql';
    return {
      title: 'Automate the analysis',
      goal: 'One command rebuilds the clean data, every answer table and every chart from the raw files, with checks that stop on bad data.',
      steps: [
        {
          title: sql ? 'Order the SQL files' : 'Move the logic out of the notebook',
          detail: sql
            ? 'Name the files so they sort in run order: 01_load.sql, 02_clean.sql, then q1.sql, q2.sql… Each answer file holds one SELECT. The notebook becomes a viewer that reads the outputs.'
            : 'Move cleaning into src/analysis.py as clean(df) -> DataFrame and each answer into a function that returns a table. The notebook imports them, so the notebook and the pipeline always agree.',
          code: sql
            ? `-- sql/01_load.sql\nCREATE OR REPLACE TABLE raw AS\nSELECT * FROM read_csv_auto('${rawCsv(c)}');`
            : "# src/analysis.py\nimport pandas as pd\n\ndef clean(df: pd.DataFrame) -> pd.DataFrame:\n    df = df.copy()\n    df.columns = df.columns.str.strip().str.lower().str.replace(r'[^a-z0-9]+', '_', regex=True)\n    df = df.drop_duplicates()\n    # … the rest of your cleaning steps\n    return df\n\ndef answers(df: pd.DataFrame) -> dict[str, pd.DataFrame]:\n    return {\n        'q1': df.groupby('group_col')['value_col'].agg(['mean', 'size']),\n        # 'q2': …\n    }",
        },
        {
          title: 'Write the pipeline script',
          detail: 'One script reads the raw data, runs every step and writes outputs to output/: the clean table, one CSV per question and the charts. Running it twice gives the same result.',
          code: sql
            ? `# pipeline.py\nfrom pathlib import Path\nimport duckdb\n\nOUT = Path('output')\n\ndef main() -> None:\n    OUT.mkdir(exist_ok=True)\n    con = duckdb.connect('data/${slug(c)}.duckdb')\n    for path in sorted(Path('sql').glob('*.sql')):\n        sql = path.read_text()\n        if path.stem[0].isdigit():      # 01_load, 02_clean: build steps\n            con.execute(sql)\n        else:                           # q1, q2…: answers to CSV\n            con.sql(sql).write_csv(str(OUT / f'{path.stem}.csv'))\n        print('ran', path.name)\n\nif __name__ == '__main__':\n    main()`
            : `# src/pipeline.py\nfrom pathlib import Path\nimport pandas as pd\nfrom analysis import answers, clean\n\nRAW = Path('${rawCsv(c)}')\nOUT = Path('output')\n\ndef main() -> None:\n    OUT.mkdir(exist_ok=True)\n    df = clean(pd.read_csv(RAW, low_memory=False))\n    df.to_parquet(OUT / 'clean.parquet', index=False)\n    for name, table in answers(df).items():\n        table.to_csv(OUT / f'{name}.csv')\n    print(f'{len(df)} rows, outputs in {OUT}/')\n\nif __name__ == '__main__':\n    main()`,
        },
        {
          title: 'Add data checks',
          detail: 'Fail loudly when the input changes shape: expected columns present, row count in a sane range, no missing keys, values inside known limits. A pipeline that silently produces wrong charts is worse than one that stops.',
          code: sql
            ? "-- sql/03_checks.sql: each query must return 0 rows\nSELECT 'missing key' AS problem, COUNT(*) AS n FROM clean WHERE key_col IS NULL HAVING COUNT(*) > 0\nUNION ALL\nSELECT 'negative value', COUNT(*) FROM clean WHERE value_col < 0 HAVING COUNT(*) > 0;\n-- in pipeline.py: rows = con.sql(sql).fetchall(); if rows: raise SystemExit(rows)"
            : "def check(df: pd.DataFrame) -> None:\n    expected = {'key_col', 'group_col', 'value_col'}\n    missing = expected - set(df.columns)\n    assert not missing, f'missing columns: {missing}'\n    assert 100 <= len(df) <= 5_000_000, f'odd row count: {len(df)}'\n    assert df['key_col'].notna().all(), 'missing keys'\n    assert (df['value_col'].dropna() >= 0).all(), 'negative values'",
        },
        {
          title: 'Refresh on new data',
          detail: clip(`Document the refresh: drop a newer download into data/raw (${clip(c.idea.source, 160)}) and run the pipeline. If the source offers a command-line download (the Kaggle CLI does, with an API token stored as a secret), add a scheduled GitHub Actions job that downloads and runs it weekly.`, 880),
          code: sql ? 'python pipeline.py' : 'python src/pipeline.py',
        },
      ],
      hints: ['Keep paths relative to the project root and run from there.', 'Write outputs to a fresh folder so stale files cannot hide a failed step.'],
      acceptance: [
        'One command rebuilds every output from the raw data.',
        'Running it twice gives identical outputs.',
        'Bad input (a missing column, negative values) stops the run with a clear message.',
      ],
      repo: { paths: sql ? ['pipeline.py', 'sql/*.sql'] : ['src/pipeline.py', 'src/analysis.py'] },
      self_check: ['Why should the notebook import the same functions the pipeline runs?', 'Which data check would have caught the worst problem you found while cleaning?'],
      commit: 'feat: reproducible analysis pipeline with data checks',
      topics: ['dev.ml-ops.data-pipelines'],
    };
  },
};

const app: StageTemplate<DataCtx> = {
  id: 'app',
  minutes: [20, 25, 20, 15],
  build: (c) => {
    const sql = tool(c) === 'sql';
    return {
      title: 'Publish an interactive app',
      goal: 'A small Streamlit app lets anyone filter the data and see the answers, and it is live on a free host.',
      steps: [
        {
          title: 'Plan the app',
          detail: 'One page: the headline findings at the top, a sidebar filter for the main category and the time range, then one chart per question that follows the filters. Sketch it first; it should fit on one laptop screen.',
        },
        {
          title: 'Build it',
          detail: 'Read the pipeline outputs (never the raw data), cache the load, filter in the sidebar and draw the charts. Run it locally and click through every filter combination, including one that leaves no rows.',
          code: `# app.py  (pip install streamlit)\nimport ${sql ? 'duckdb\nimport ' : ''}pandas as pd\nimport streamlit as st\n\nst.set_page_config(page_title=${py(clip(c.idea.title, 60))}, layout='wide')\n\n@st.cache_data\ndef load() -> pd.DataFrame:\n    ${sql ? `con = duckdb.connect('data/${slug(c)}.duckdb', read_only=True)\n    return con.sql('SELECT * FROM clean').df()` : "return pd.read_parquet('output/clean.parquet')"}\n\ndf = load()\nGROUP = 'group_col'  # the column users filter by\nchosen = st.sidebar.multiselect('Filter', sorted(df[GROUP].dropna().unique()))\nview = df[df[GROUP].isin(chosen)] if chosen else df\n\nst.title(${py(clip(c.idea.title, 60))})\nif view.empty:\n    st.info('No rows match these filters.')\n    st.stop()\nst.metric('Rows', f'{len(view):,}')\nst.bar_chart(view.groupby(GROUP)['value_col'].mean().sort_values().tail(10))`,
        },
        {
          title: 'Deploy it',
          detail: `Deploy on ${c.stack.host}: connect the GitHub repository, choose app.py and add requirements.txt. Commit a small processed file the app reads (a sample if the full data is over about 50 MB), never the raw download.`,
          code: 'streamlit run app.py\n# local: http://localhost:8501',
        },
        {
          title: 'Link it everywhere',
          detail: 'Put the live link at the top of the README and in the repository description, with a screenshot. Open it on a phone and fix anything that does not fit.',
        },
      ],
      hints: ['@st.cache_data stops the data reloading on every click.', 'Keep the app to what the analysis supports; do not add charts you have not checked.'],
      acceptance: ['The app runs locally with one command.', 'Filters change every chart, and an empty selection shows a message.', 'The app is live and linked from the README.'],
      repo: { paths: ['app.py', 'requirements.txt'] },
      self_check: ['Why does the app read pipeline outputs instead of the raw data?', 'What happens to the app when the data is refreshed?'],
      commit: 'feat: interactive Streamlit app',
      topics: ['dev.data-communication.data-visualization', 'dev.dev-tools.deployment-basics'],
    };
  },
};

const repro: StageTemplate<DataCtx> = {
  id: 'reproducible',
  minutes: [15, 20, 20, 15],
  build: (c) => {
    const sql = tool(c) === 'sql';
    return {
      title: 'Make it reproducible',
      goal: 'A stranger can clone the repository, get the data, run one command and get your exact results; CI proves it on every push.',
      steps: [
        {
          title: 'Pin the environment',
          detail: 'List the packages you use with exact versions in requirements.txt (not your whole machine), and the Python version in the README. Create a fresh virtual environment from it and run everything to prove it is complete.',
          code: sql
            ? 'duckdb==1.*\npandas==2.*\nmatplotlib==3.*\nseaborn==0.13.*\nscipy==1.*\nstreamlit==1.*\npytest==8.*\n# then: pip freeze, and pin the exact versions you tested with'
            : 'pandas==2.*\npyarrow\nmatplotlib==3.*\nseaborn==0.13.*\nscipy==1.*\nstatsmodels==0.14.*\nstreamlit==1.*\npytest==8.*\n# then: pip freeze, and pin the exact versions you tested with',
        },
        {
          title: 'Test the cleaning',
          detail: 'Write pytest tests for the cleaning on a tiny hand-made table: duplicates go, text numbers become numbers, bad dates become missing, negative values are removed. These run in CI without the real data.',
          code: sql
            ? "# tests/test_clean.py\nimport duckdb\nfrom pathlib import Path\n\ndef test_clean_removes_duplicates_and_negatives():\n    con = duckdb.connect()\n    con.execute(\"CREATE TABLE raw AS SELECT * FROM (VALUES ('a', '1,200', '01-10-2026'), ('a', '1,200', '01-10-2026'), ('b', '-5', 'x')) t(category_col, number_col, date_col)\")\n    con.execute(Path('sql/02_clean.sql').read_text())\n    assert con.sql('SELECT COUNT(*) FROM clean').fetchone()[0] == 2\n    assert con.sql('SELECT MAX(number_col) FROM clean').fetchone()[0] == 1200"
            : "# tests/test_clean.py\nimport pandas as pd\nfrom src.analysis import clean\n\ndef test_clean_drops_duplicates_and_fixes_names():\n    raw = pd.DataFrame({'Group Col': ['a', 'a', 'b'], 'Value Col': [1, 1, 2]})\n    out = clean(raw)\n    assert list(out.columns) == ['group_col', 'value_col']\n    assert len(out) == 2",
        },
        {
          title: 'Run checks in CI',
          detail: 'Add a GitHub Actions workflow that installs requirements.txt and runs pytest on every push. Add the badge to the README.',
          code: '# .github/workflows/ci.yml\nname: ci\non: [push, pull_request]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-python@v5\n        with: { python-version: "3.12", cache: pip }\n      - run: pip install -r requirements.txt\n      - run: pytest -q',
        },
        {
          title: 'Finish the README',
          detail: `Sections: key findings with charts and the live app link, the data (what a row is and how to get it without a link in the code), how to reproduce (create the environment, download the data to data/raw, run ${sql ? 'python pipeline.py' : 'python src/pipeline.py'}, then streamlit run app.py), project structure, limitations and next steps.`,
        },
      ],
      hints: ['Test in a fresh clone in a new folder: missing files show up immediately.', 'If tests import src, add an empty src/__init__.py and run pytest from the root.'],
      acceptance: [
        'requirements.txt installs cleanly in a fresh environment.',
        'At least three cleaning tests pass locally and in CI.',
        'The README explains how to get the data and reproduce every result.',
      ],
      repo: { paths: ['requirements.txt', 'tests/*.py', '.github/workflows/*.yml', 'README.md'], readme: ['Key findings', 'Data', 'Reproduce'] },
      self_check: ['What could make your results differ on someone else\'s machine?', 'Why test the cleaning code rather than the charts?'],
      commit: 'ci: pinned environment, cleaning tests and CI',
      topics: ['dev.dev-tools.testing-fundamentals', 'dev.containers-ci.ci-cd'],
    };
  },
};

const STAGES: Record<ProjectLevel, StageTemplate<DataCtx>[]> = {
  beginner: [getData, clean, explore, answerStage(0), answerStage(1), share],
  intermediate: [getData, clean, explore, answerStage(0), answerStage(1), stats, report, share],
  advanced: [getData, clean, explore, answerStage(0), answerStage(1), stats, report, pipeline, app, repro],
};

const stack = (s: Omit<StackDef, 'kind'>): StackDef => ({ kind: 'data', ...s });

export const DATA = {
  stacks: [
    stack({
      key: 'pandas-notebook',
      label: 'Python + pandas + Jupyter (matplotlib and seaborn)',
      short: 'pandas',
      tech: ['Python', 'pandas', 'Jupyter', 'matplotlib', 'seaborn'],
      skills: ['python', 'pandas', 'numpy', 'data-cleaning', 'data-visualization', 'statistics'],
      roles: ['data-analyst', 'data-ml'],
      modules: ['dev.data-analysis', 'dev.data-communication'],
      levels: ['beginner', 'intermediate', 'advanced'],
      lang: 'python',
      host: 'Streamlit Community Cloud',
    }),
    stack({
      key: 'sql-analysis',
      label: 'SQL (DuckDB or PostgreSQL) with a Jupyter notebook',
      short: 'SQL',
      tech: ['SQL', 'DuckDB', 'PostgreSQL', 'Python', 'Jupyter'],
      skills: ['sql', 'advanced-sql', 'data-cleaning', 'statistics', 'data-visualization'],
      roles: ['data-analyst'],
      modules: ['dev.databases', 'dev.data-analysis'],
      levels: ['beginner', 'intermediate', 'advanced'],
      lang: 'sql',
      host: 'Streamlit Community Cloud',
    }),
    stack({
      key: 'sheets-dashboard',
      label: 'Excel or Google Sheets + Power BI or Looker Studio',
      short: 'Sheets + BI',
      tech: ['Excel', 'Google Sheets', 'Power BI', 'Looker Studio'],
      skills: ['excel', 'bi-tools', 'data-visualization', 'data-storytelling', 'data-cleaning'],
      roles: ['data-analyst', 'product-manager'],
      modules: ['dev.data-analysis', 'dev.data-communication'],
      levels: ['beginner', 'intermediate'],
      lang: 'excel',
      host: 'Looker Studio or the Power BI service',
    }),
  ],
  plan: {
    kind: 'data',
    stages: (level: ProjectLevel) => STAGES[level],
    outcome: (c: DataCtx) =>
      clip(
        `A ${c.stack.short} analysis of ${lowerFirst(c.idea.title)} that cleans a real public dataset and answers ${c.idea.questions.length} questions with charts and one-line findings${
          c.level === 'beginner'
            ? ', written up in a clear README'
            : c.level === 'intermediate'
              ? `, checked with confidence intervals and presented as ${tool(c) === 'sheets' ? 'an interactive dashboard' : 'a short report'}`
              : ', checked with statistics, rebuilt by a one-command pipeline with data checks and tests, and published as a live Streamlit app'
        }.`,
        500
      ),
    readme: (c: DataCtx) =>
      c.level === 'advanced'
        ? ['Key findings', 'Live app', 'Data', 'Reproduce', 'Project structure', 'Limitations', 'Next steps']
        : ['Key findings', 'Data', 'How to run', 'Method', 'Limitations', 'Next steps'],
    deploy: (c: DataCtx) =>
      tool(c) === 'sheets'
        ? [
            'Export the workbook into workbook/ and commit it with the README.',
            'Share the dashboard as view-only (Looker Studio: anyone with the link; Power BI: publish and export a PDF).',
            'Add screenshots of every dashboard page to screenshots/ and the README.',
            'Put the dashboard link and the top finding on your resume.',
          ]
        : [
            'Push the notebook, SQL or scripts, figures and README to a public GitHub repository.',
            'Keep raw data out of git; the README explains how to download it.',
            c.level === 'advanced' ? `Deploy app.py on ${c.stack.host} and add the live link to the README.` : 'Export the notebook or report to HTML so it reads without running code.',
            'Add the repository link and your most interesting finding to your resume.',
          ],
    verbs: ['Analysed', 'Cleaned', 'Visualised', 'Quantified', 'Identified', 'Automated', 'Presented'],
  } satisfies KindPlan<DataCtx>,
};
