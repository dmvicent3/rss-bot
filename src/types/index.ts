export interface RSSFeed {
  id: string
  url: string
  name: string
  lastSeenId?: string
  addedAt: Date
  isActive: boolean
}

export interface FeedItem {
  id: string
  title: string
  description: string
  category?: string
  link: string
  pubDate: Date
  feedId: string
  contentHash: string
}

export interface Filter {
  id: string
  keyword: string
  addedAt: Date
  isActive: boolean
}

export interface BotConfig {
  guildId: string
  channelId?: string
  pollIntervalHours: number
  lastUpdated: Date
}

export interface FilterResult {
  shouldPost: boolean
  reason: string
  confidence?: number
  category?: string
}

export interface IFeedManager {
  addFeed(url: string, name: string): Promise<RSSFeed>
  removeFeed(feedId: string): Promise<boolean>
  getAllFeeds(): Promise<RSSFeed[]>
  fetchFeedItems(feed: RSSFeed): Promise<FeedItem[]>
  updateLastSeen(feedId: string, lastSeenId: string): Promise<void>
}

export interface IFilterManager {
  addFilter(keyword: string): Promise<Filter>
  removeFilter(filterId: string): Promise<boolean>
  getAllFilters(): Promise<Filter[]>
  stageAFilter(item: FeedItem): Promise<FilterResult>
  stageBFilter(item: FeedItem): Promise<FilterResult>
  shouldPostItem(item: FeedItem): Promise<FilterResult>
}

export interface IStorage {
  addFeed(feed: Omit<RSSFeed, 'id' | 'addedAt'>): Promise<RSSFeed>
  removeFeed(feedId: string): Promise<boolean>
  getAllFeeds(): Promise<RSSFeed[]>
  updateFeedLastSeen(feedId: string, lastSeenId: string): Promise<void>

  addFeedItem(item: Omit<FeedItem, 'id'>): Promise<FeedItem>
  isFeedItemSeen(contentHash: string): Promise<boolean>

  addFilter(filter: Omit<Filter, 'id' | 'addedAt'>): Promise<Filter>
  removeFilter(filterId: string): Promise<boolean>
  getAllFilters(): Promise<Filter[]>

  getBotConfig(guildId: string): Promise<BotConfig | null>
  getAllBotConfigs(): Promise<BotConfig[]>
  updateBotConfig(
    config: Partial<BotConfig> & { guildId: string }
  ): Promise<void>

  cleanup(): Promise<void>
}
