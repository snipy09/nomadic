import { handle } from './handle.js';
import { applyUrlArgs, cloudFeedArgs, cloudFeedPageArgs, saveJobArgs } from './schemas.js';
import { getCloudFeed, getCloudFeedPage, getSavedJobs, removeSavedJob, runScrapers, saveJob } from '../services/feed.js';

/** Job feed (Supabase cloud + local scrapers) and bookmarked jobs. */
export function registerFeedIpc(): void {
  handle('run-scrapers', () => runScrapers());
  handle('get-cloud-feed-page', cloudFeedPageArgs, (opts) => getCloudFeedPage(opts));
  handle('get-cloud-feed', cloudFeedArgs, () => getCloudFeed());
  handle('get-saved-jobs', () => getSavedJobs());
  handle('save-job', saveJobArgs, (job) => saveJob(job));
  handle('remove-saved-job', applyUrlArgs, (applyUrl) => removeSavedJob(applyUrl));
}
