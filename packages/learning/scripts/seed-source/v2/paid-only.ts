/**
 * LeetCode Premium (paid-only) flags per problem slug, used for `paid_only` in
 * the problems index. Slugs not listed are `null` (not checked).
 *
 * The authoring environment could not reach leetcode.com, so these entries are
 * well-known Premium problems recorded by hand. `npm run check-paid-only -w
 * @job-automator/learning` queries LeetCode's GraphQL API
 * (question(titleSlug){isPaidOnly}) for every curated slug and rewrites
 * paid-only.json; when that file exists it wins over this list.
 */
export const KNOWN_PAID_ONLY: string[] = [
  'alien-dictionary',
  'meeting-rooms-ii',
  'employee-free-time',
  'design-hit-counter',
  'logger-rate-limiter',
  'longest-substring-with-at-most-k-distinct-characters',
  'binary-tree-vertical-order-traversal',
  'inorder-successor-in-bst',
  'number-of-connected-components-in-an-undirected-graph',
  'graph-valid-tree',
  'encode-and-decode-strings',
  'moving-average-from-data-stream',
  'shortest-word-distance',
  'design-tic-tac-toe',
  'max-stack',
  'buildings-with-an-ocean-view',
  'find-the-celebrity',
  'number-of-distinct-islands',
  'minimum-knight-moves',
  'paint-house',
  'best-meeting-point',
  'shortest-distance-from-all-buildings',
  'design-in-memory-file-system',
  'design-excel-sum-formula',
  'optimal-account-balancing',
  'sparse-matrix-multiplication',
  'the-maze',
  'nested-list-weight-sum',
  'boundary-of-binary-tree',
  'design-search-autocomplete-system',
];
