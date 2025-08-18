import type { FeedItem, IFeedManager, IStorage, RSSFeed } from '../types'
import Logger from '../utils/Logger'
import Utils from '../utils/Utils'
import FeedDeduplicator from './Deduplicator'

export default class FeedPoller {
  private isPolling = false
  private pollPromises = new Map<string, Promise<FeedItem[]>>()

  constructor(
    private feedManager: IFeedManager,
    private storage: IStorage,
    private feedDeduplicator: FeedDeduplicator
  ) {}

  async pollAllFeeds(): Promise<Map<string, FeedItem[]>> {
    if (this.isPolling) {
      Logger.warn('Feed polling already in progress, skipping')
      return new Map()
    }

    this.isPolling = true
    const results = new Map<string, FeedItem[]>()

    try {
      const feeds = await this.feedManager.getAllFeeds()
      Logger.info('Starting feed polling cycle', { feedCount: feeds.length })

      const concurrencyLimit = 5
      const feedChunks = Utils.chunkArray(feeds, concurrencyLimit)

      for (const chunk of feedChunks) {
        const chunkPromises = chunk.map((feed) => this.pollSingleFeed(feed))
        const chunkResults = await Promise.allSettled(chunkPromises)

        chunkResults.forEach((result, index) => {
          const feed = chunk[index]!
          if (result.status === 'fulfilled') {
            results.set(feed.id, result.value)
          } else {
            Logger.error('Feed polling failed', {
              feedId: feed.id,
              url: feed.url,
              error: result.reason,
            })
            results.set(feed.id, [])
          }
        })
      }

      const totalNewItems = Array.from(results.values()).reduce(
        (sum, items) => sum + items.length,
        0
      )

      Logger.info('Feed polling cycle completed', {
        feedCount: feeds.length,
        totalNewItems,
        successfulFeeds: Array.from(results.values()).filter(
          (items) => items.length > 0
        ).length,
      })

      return results
    } catch (error) {
      Logger.error('Feed polling cycle failed', { error })
      throw error
    } finally {
      this.isPolling = false
      this.pollPromises.clear()
    }
  }

  async pollSingleFeed(feed: RSSFeed): Promise<FeedItem[]> {
    if (this.pollPromises.has(feed.id)) {
      Logger.info('Feed already being polled, waiting for existing promise', {
        feedId: feed.id,
      })
      return await this.pollPromises.get(feed.id)!
    }

    const pollPromise = this.executePollSingleFeed(feed)
    this.pollPromises.set(feed.id, pollPromise)

    try {
      return await pollPromise
    } finally {
      this.pollPromises.delete(feed.id)
    }
  }

  private async executePollSingleFeed(feed: RSSFeed): Promise<FeedItem[]> {
    try {
      Logger.info('Polling feed', { feedId: feed.id, url: feed.url })

      const newItems = await this.feedManager.fetchFeedItems(feed)

      const storedItems: FeedItem[] = []
      for (const item of newItems) {
        try {
          const isDuplicate = await this.feedDeduplicator.isDuplicate(item)

          if (isDuplicate) {
            Logger.info('Item is a duplicate, skipping', {
              itemTitle: item.title,
            })
            continue
          }

          //const storedItem = await this.storage.addFeedItem(item)
          storedItems.push(item/* storedItem */)
        } catch (error) {
          Logger.error('Failed to store news item', {
            error,
            feedId: feed.id,
            itemTitle: item.title,
          })
        }
      }

      if (storedItems.length > 0) {
        Logger.info('Successfully polled feed', {
          feedId: feed.id,
          url: feed.url,
          newItemsCount: storedItems.length,
        })
      }

      return storedItems
    } catch (error) {
      Logger.error('Failed to poll feed', {
        feedId: feed.id,
        url: feed.url,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      throw error
    }
  }

  isCurrentlyPolling(): boolean {
    return this.isPolling
  }

  getActivePollCount(): number {
    return this.pollPromises.size
  }
}
