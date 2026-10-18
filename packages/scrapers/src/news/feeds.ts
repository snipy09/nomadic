/**
 * Publisher RSS feeds read by the news scraper: Indian business, tech and jobs desks. Only the headline, link,
 * date, the feed's own short summary and the facts read from them are kept; every item links to the article.
 *
 * Feed URLs were checked by a `news` dry run on 18 Oct 2026. A feed that fails is listed as FAILED in the summary, and
 * one whose newest item is older than the window as STALE (the publisher stopped updating it). Fix its URL here, or
 * turn it off with
 * `news_feeds_off` in the scraper folder's settings.ini. Ids are stored (news_items.source): never rename one.
 */

export interface NewsFeed {
  id: string;
  name: string;
  url: string;
}

export const NEWS_FEEDS: NewsFeed[] = [
  { id: 'et-jobs', name: 'Economic Times', url: 'https://economictimes.indiatimes.com/jobs/rssfeeds/107115.cms' },
  { id: 'et-tech', name: 'ET Tech', url: 'https://economictimes.indiatimes.com/tech/rssfeeds/13357270.cms' },
  { id: 'et-it', name: 'ET Tech', url: 'https://economictimes.indiatimes.com/tech/information-tech/rssfeeds/78570530.cms' },
  { id: 'inc42', name: 'Inc42', url: 'https://inc42.com/feed/' },
  { id: 'yourstory', name: 'YourStory', url: 'https://yourstory.com/feed' },
  { id: 'entrackr', name: 'Entrackr', url: 'https://entrackr.com/rss' },
  { id: 'mint-companies', name: 'Mint', url: 'https://www.livemint.com/rss/companies' },
  { id: 'mint-tech', name: 'Mint', url: 'https://www.livemint.com/rss/technology' },
  { id: 'businessline-it', name: 'BusinessLine', url: 'https://www.thehindubusinessline.com/info-tech/feeder/default.rss' },
  // Business Standard (robots.txt answers 403) and Financial Express (feeds switched off, 410) were removed 18 Oct 2026.
  // ie-jobs and moneycontrol were removed 18 Oct 2026: every item was older than 30 days (feeds no longer updated).
  // Their ids stay in old news_items rows; do not reuse them for another feed.
  { id: 'toi-business', name: 'Times of India', url: 'https://timesofindia.indiatimes.com/rssfeeds/1898055.cms' },
  // The employment-news feed is empty; the id is stored, so it now reads HT's business desk.
  { id: 'ht-jobs', name: 'Hindustan Times', url: 'https://www.hindustantimes.com/feeds/rss/business/rssfeed.xml' },
];
