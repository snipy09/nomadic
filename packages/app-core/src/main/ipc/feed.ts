import { handle } from './handle.js';
import { applyUrlArgs, cloudFeedArgs, cloudFeedPageArgs, hideJobArgs, saveJobArgs } from './schemas.js';
import { getHiddenJobs, hideJob, unhideJob } from '../services/hidden-jobs.js';
import { getCloudFeed, getCloudFeedPage, getSavedJobs, removeSavedJob, runScrapers, saveJob } from '../services/feed.js';
import { getNews } from '../services/news.js';

/** Job feed (Supabase cloud + local scrapers) and bookmarked jobs. */
export function registerFeedIpc(): void {
  handle('run-scrapers', () => runScrapers());
  handle('get-cloud-feed-page', cloudFeedPageArgs, (opts) => getCloudFeedPage(opts));
  handle('get-cloud-feed', cloudFeedArgs, () => getCloudFeed());
  handle('get-saved-jobs', () => getSavedJobs());
  handle('save-job', saveJobArgs, (job) => saveJob(job));
  handle('remove-saved-job', applyUrlArgs, (applyUrl) => removeSavedJob(applyUrl));
  handle('get-hidden-jobs', () => getHiddenJobs());
  handle('hide-job', hideJobArgs, (job) => hideJob(job));
  handle('unhide-job', applyUrlArgs, (applyUrl) => unhideJob(applyUrl));
  handle('get-news', () => getNews());
}
