/**
 * Data analysis and ML project ideas on public datasets, described in words
 * (no links). Keys are part of saved project ids: never rename or remove one.
 */
import type { DataIdea } from './types';

export const DATA_IDEAS: DataIdea[] = [
  {
    key: 'ipl-matches',
    title: 'IPL match analysis',
    pitch: 'Find out what really wins IPL matches: toss decisions, venues, chasing versus defending and the most consistent players.',
    why: 'Cricket data is familiar to every Indian interviewer, so your insights land straight away.',
    dataset: 'One row per IPL match (2008 onwards) with season, city, venue, teams, toss winner and decision, winner, result margin and player of the match; a second file has ball-by-ball deliveries.',
    source: 'Search Kaggle for "IPL complete dataset 2008-2024" and download the matches and deliveries CSV files.',
    questions: [
      'Does winning the toss change the chance of winning the match?',
      'Which venues favour chasing teams?',
      'Which teams improved or declined most across seasons?',
      'Who are the most consistent batters by average and strike rate?',
      'How has the average first-innings score changed over the years?',
    ],
    target: 'which team wins a match from pre-match information',
    task: 'classification',
    metric: 'accuracy against a "toss winner wins" baseline',
    kinds: ['data', 'ml'],
    tags: ['sports', 'cricket', 'india'],
  },
  {
    key: 'house-prices',
    title: 'House price prediction',
    pitch: 'Estimate flat prices in Indian cities from size, location and amenities, and explain which features move the price most.',
    why: 'A clean regression project that shows feature engineering, validation and honest error reporting.',
    dataset: 'One row per listed flat with city, locality, area in square feet, bedrooms, bathrooms, furnishing, floor, age of the building and listed price.',
    source: 'Search Kaggle for "India house price dataset" (several city-wise listing datasets exist) and download the CSV.',
    questions: [
      'How does price per square foot vary across cities and localities?',
      'How much does an extra bedroom add, holding area constant?',
      'Do furnished flats cost more per square foot?',
      'Which listings look like outliers or data-entry errors?',
    ],
    target: 'the listed price of a flat',
    task: 'regression',
    metric: 'mean absolute error in lakh rupees',
    kinds: ['data', 'ml'],
    tags: ['real estate', 'regression', 'india'],
  },
];
