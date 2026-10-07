/**
 * Publisher RSS feeds read by the news scraper: Indian business, tech and jobs desks. Only the headline, link,
 * date, the feed's own short summary and the facts read from them are kept; every item links to the article.
 *
 * Feed URLs were written without network access to these sites and are unverified until the first
 * `news` dry run: a feed that fails is listed as FAILED in the summary. Fix its URL here, or turn it off with
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
  { id: 'entrackr', name: 'Entrackr', url: 'https://entrackr.com/feed/' },
  { id: 'mint-companies', name: 'Mint', url: 'https://www.livemint.com/rss/companies' },
  { id: 'mint-tech', name: 'Mint', url: 'https://www.livemint.com/rss/technology' },
  { id: 'moneycontrol', name: 'Moneycontrol', url: 'https://www.moneycontrol.com/rss/business.xml' },
  { id: 'businessline-it', name: 'BusinessLine', url: 'https://www.thehindubusinessline.com/info-tech/feeder/default.rss' },
  { id: 'bs-tech', name: 'Business Standard', url: 'https://www.business-standard.com/rss/technology-108.rss' },
  { id: 'bs-companies', name: 'Business Standard', url: 'https://www.business-standard.com/rss/companies-101.rss' },
  { id: 'fe-jobs', name: 'Financial Express', url: 'https://www.financialexpress.com/jobs/feed/' },
  { id: 'ie-jobs', name: 'Indian Express', url: 'https://indianexpress.com/section/jobs/feed/' },
  { id: 'toi-business', name: 'Times of India', url: 'https://timesofindia.indiatimes.com/rssfeeds/1898055.cms' },
  { id: 'ht-jobs', name: 'Hindustan Times', url: 'https://www.hindustantimes.com/feeds/rss/education/employment-news/rssfeed.xml' },
];
