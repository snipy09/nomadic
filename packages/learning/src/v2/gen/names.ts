/** Naming helpers for generated projects: entity names in every case a stack needs. */
import type { AppIdea, Ctx, FieldDef, FieldType, Names, StackDef } from './types';
import type { ProjectLevel } from '../types';

const words = (s: string) => s.trim().toLowerCase().split(/[\s_-]+/).filter(Boolean);
const cap = (w: string) => (w ? w[0].toUpperCase() + w.slice(1) : w);

export function names(one: string, many: string): Names {
  const o = words(one);
  const m = words(many);
  return {
    one: o.join(' '),
    many: m.join(' '),
    One: cap(o.join(' ')),
    Many: cap(m.join(' ')),
    camel: o[0] + o.slice(1).map(cap).join(''),
    camelMany: m[0] + m.slice(1).map(cap).join(''),
    Pascal: o.map(cap).join(''),
    PascalMany: m.map(cap).join(''),
    snake: o.join('_'),
    snakeMany: m.join('_'),
    kebabMany: m.join('-'),
  };
}

/** snake_case of a camelCase field name. */
export const snakeOf = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
/** PascalCase of a camelCase name. */
export const pascalOf = (name: string) => cap(name);

export function makeCtx(idea: AppIdea, stack: StackDef, level: ProjectLevel): Ctx {
  const fields = idea.entity.fields;
  const titleField = fields.find((f) => f.type === 'text') ?? fields[0];
  return { idea, stack, level, n: names(idea.entity.name, idea.entity.plural), fields, titleField };
}

/** A sample value for a field, as a JavaScript/JSON literal. */
export function sampleLiteral(f: FieldDef, i = 0): string {
  switch (f.type) {
    case 'number':
      return String([3, 5, 2][i % 3]);
    case 'money':
      return String([250, 1200, 80][i % 3]);
    case 'date':
      return `'2026-10-0${(i % 9) + 1}'`;
    case 'enum':
      return `'${(f.options ?? ['a'])[i % (f.options?.length ?? 1)]}'`;
    case 'boolean':
      return i % 2 ? 'true' : 'false';
    default:
      return `'Sample ${f.label} ${i + 1}'`;
  }
}

/** Field types per language. */
export const TS_TYPE: Record<FieldType, string> = {
  text: 'string',
  longtext: 'string',
  number: 'number',
  money: 'number',
  date: 'string',
  enum: 'string',
  boolean: 'boolean',
};

export function tsType(f: FieldDef): string {
  if (f.type === 'enum' && f.options?.length) return f.options.map((o) => `'${o}'`).join(' | ');
  return TS_TYPE[f.type];
}

export const PY_TYPE: Record<FieldType, string> = {
  text: 'str',
  longtext: 'str',
  number: 'int',
  money: 'float',
  date: 'date',
  enum: 'str',
  boolean: 'bool',
};

export const JAVA_TYPE: Record<FieldType, string> = {
  text: 'String',
  longtext: 'String',
  number: 'Integer',
  money: 'BigDecimal',
  date: 'LocalDate',
  enum: 'String',
  boolean: 'Boolean',
};

export const GO_TYPE: Record<FieldType, string> = {
  text: 'string',
  longtext: 'string',
  number: 'int',
  money: 'float64',
  date: 'string',
  enum: 'string',
  boolean: 'bool',
};

export const SQL_TYPE: Record<FieldType, string> = {
  text: 'TEXT',
  longtext: 'TEXT',
  number: 'INTEGER',
  money: 'NUMERIC(12, 2)',
  date: 'DATE',
  enum: 'TEXT',
  boolean: 'BOOLEAN',
};

/** "amount (money), category (food, travel or rent) and date (date)". */
export function fieldList(fields: FieldDef[]): string {
  const parts = fields.map((f) => {
    if (f.type === 'enum' && f.options?.length) return `${f.label} (${orList(f.options)})`;
    const t = f.type === 'longtext' ? 'long text' : f.type === 'money' ? 'amount in rupees' : f.type === 'boolean' ? 'yes/no' : f.type;
    return `${f.label} (${t}${f.required ? ', required' : ''})`;
  });
  return andList(parts);
}

export function andList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export function orList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
}

/** Lower-case first letter (for joining a feature phrase into a sentence). */
export const lowerFirst = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);
/** Upper-case first letter. */
export const upperFirst = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Clips text to a limit on a word boundary. */
export function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const at = cut.lastIndexOf(' ');
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).trimEnd()}…`;
}

/** "an expense", "a habit" (vowel sound by first letter; good enough for our nouns). */
export const an = (w: string) => `${/^[aeiou]/i.test(w) && !/^(uni|use|one)/i.test(w) ? 'an' : 'a'} ${w}`;
