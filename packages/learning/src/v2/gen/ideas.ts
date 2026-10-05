/**
 * App ideas for the generated Project Library. Each idea is built on every
 * stack of the kinds it lists, at each level the stack supports. Keys are part
 * of saved project ids: never rename or remove a key once shipped.
 */
import type { AppIdea } from './types';

export const APP_IDEAS: AppIdea[] = [
  {
    key: 'expense-tracker',
    title: 'Expense tracker',
    pitch: 'Track daily spending by category and see where the money goes each month, built for students living on a monthly budget.',
    why: 'Every interviewer understands it instantly, and it shows forms, validation, totals and charts.',
    entity: {
      name: 'expense',
      plural: 'expenses',
      fields: [
        { name: 'title', label: 'title', type: 'text', required: true },
        { name: 'amount', label: 'amount', type: 'money', required: true },
        { name: 'category', label: 'category', type: 'enum', options: ['food', 'travel', 'rent', 'books', 'other'] },
        { name: 'spentOn', label: 'date', type: 'date' },
      ],
    },
    features: ['show the total spent per category this month', 'warn when a monthly budget is crossed', 'export the month as a CSV file'],
    kinds: ['frontend', 'backend', 'fullstack', 'mobile', 'cli', 'devops'],
    tags: ['finance', 'budget', 'students'],
  },
  {
    key: 'habit-tracker',
    title: 'Habit tracker',
    pitch: 'Build daily habits such as coding practice or exercise, tick them off each day and keep a streak going.',
    why: 'Dates, streak logic and a calendar view are classic interview talking points.',
    entity: {
      name: 'habit',
      plural: 'habits',
      fields: [
        { name: 'name', label: 'name', type: 'text', required: true },
        { name: 'frequency', label: 'frequency', type: 'enum', options: ['daily', 'weekdays', 'weekly'] },
        { name: 'target', label: 'target per day', type: 'number' },
        { name: 'active', label: 'active', type: 'boolean' },
      ],
    },
    features: ['show the current and longest streak per habit', 'show a 30-day calendar of check-ins', 'remind the user about habits not done today'],
    kinds: ['frontend', 'backend', 'fullstack', 'mobile'],
    tags: ['productivity', 'health'],
  },
];
