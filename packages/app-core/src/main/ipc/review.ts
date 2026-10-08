import { handle } from './handle.js';
import { appReviewSubmitArgs } from './schemas.js';
import { getAppReviewStatus, submitAppReview } from '../services/app-review.js';

/** In-app review after the trial week (desktop and phone). */
export function registerReviewIpc(): void {
  handle('app-review-status', () => getAppReviewStatus());
  handle('app-review-submit', appReviewSubmitArgs, (input) => submitAppReview(input));
}
