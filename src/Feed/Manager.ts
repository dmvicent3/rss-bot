import FeedParser from 'feedparser'
import { Readable } from 'stream'
import type { FeedItem, IStorage, RSSFeed } from '../types'
import Logger from '../utils/Logger'
import { Hash } from '../utils/Hash'
import Utils from '../utils/Utils'

export default class FeedManager {
  private readonly maxRetries = 3

  constructor(private storage: IStorage) {}

  async addFeed(url: string, name: string): Promise<RSSFeed> {
    try {
      await this.validateFeedUrl(url)

      const feed = await this.storage.addFeed({
        url,
        name,
        isActive: true,
      })

      return feed
    } catch (error) {
      Logger.error('Failed to add RSS feed', { error, url, name })
      throw new Error(
        `Failed to add RSS feed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      )
    }
  }

  async removeFeed(feedId: string): Promise<boolean> {
    try {
      const success = await this.storage.removeFeed(feedId)
      if (success) {
        Logger.info('RSS feed removed successfully', { feedId })
      } else {
        Logger.warn('RSS feed not found for removal', { feedId })
      }
      return success
    } catch (error) {
      Logger.error('Failed to remove RSS feed', { error, feedId })
      throw error
    }
  }

  async getAllFeeds(): Promise<RSSFeed[]> {
    try {
      return await this.storage.getAllFeeds()
    } catch (error) {
      Logger.error('Failed to get all feeds', { error })
      throw error
    }
  }

  async fetchFeedItems(feed: RSSFeed): Promise<FeedItem[]> {
    let attempt = 0
    let lastError: Error | null = null

    while (attempt < this.maxRetries) {
      try {
        const items = await this.parseFeed(feed.url)
        const newItems: FeedItem[] = []

        if (!items || items.length === 0) {
          Logger.info('No items found in feed', {
            feedId: feed.id,
            url: feed.url,
          })
          return []
        }

        const validItems = items.filter((item) => item.link && item.title)

        let processedCount = 0

        for (const item of validItems) {
          if (
            feed.lastSeenId &&
            this.generateItemId(item) === feed.lastSeenId
          ) {
            break
          }

          const itemDate = this.parseDate(item.pubDate || item.isoDate)
          const today = new Date()
          const isToday = itemDate.toDateString() === today.toDateString()

          if (!isToday) {
            Logger.info('Skipping old news item', {
              itemTitle: item.title,
              itemDate: itemDate.toISOString(),
              today: today.toISOString(),
            })
            continue
          }

          const contentHash = Hash.createContentHash(item.title!, item.link!)

          if (await this.storage.isFeedItemSeen(contentHash)) {
            continue
          }

          const newsItem: FeedItem = {
            id: Hash.generateId(),
            title: this.sanitizeText(item.title),
            description: this.sanitizeText(
              item.summary || item.description || ''
            ),
            link: item.link,
            pubDate: this.parseDate(item.pubDate || item.isoDate),
            feedId: feed.id,
            contentHash,
          }

          newItems.push(newsItem)
          processedCount++

          if (processedCount >= 5) {
            Logger.warn('Reached maximum items per fetch', {
              feedId: feed.id,
              limit: 5,
            })
            break
          }
        }

        if (newItems.length > 0) {
          const latestItem = validItems[0]
          const latestItemId = this.generateItemId(latestItem)
          await this.updateLastSeen(feed.id, latestItemId)
        }

        Logger.info('Fetched new items from feed', {
          feedId: feed.id,
          url: feed.url,
          newItemsCount: newItems.length,
          totalItemsInFeed: validItems.length,
        })

        return newItems
      } catch (error) {
        lastError = error as Error
        attempt++

        Logger.warn(`Feed fetch attempt ${attempt} failed`, {
          feedId: feed.id,
          url: feed.url,
          error: lastError.message,
          attempt,
          maxRetries: this.maxRetries,
        })

        if (attempt < this.maxRetries) {
          const delay = Math.pow(2, attempt) * 1000
          await Utils.sleep(delay)
        }
      }
    }

    Logger.error('All feed fetch attempts failed', {
      feedId: feed.id,
      url: feed.url,
      error: lastError?.message,
      attempts: this.maxRetries,
    })

    throw new Error(
      `Failed to fetch feed after ${this.maxRetries} attempts: ${lastError?.message}`
    )
  }

  async updateLastSeen(feedId: string, lastSeenId: string): Promise<void> {
    try {
      await this.storage.updateFeedLastSeen(feedId, lastSeenId)
      Logger.info('Updated last seen ID for feed', { feedId, lastSeenId })
    } catch (error) {
      Logger.error('Failed to update last seen ID', {
        error,
        feedId,
        lastSeenId,
      })
      throw error
    }
  }

  private async validateFeedUrl(url: string): Promise<void> {
    try {
      const items = await this.parseFeed(url)
      if (!items || items.length === 0) {
        Logger.warn('RSS feed has no items', { url })
      }
    } catch (error) {
      throw new Error(
        `Invalid RSS feed URL: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      )
    }
  }

  private async parseFeed(url: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const items: any[] = []
      const feedparser = new FeedParser({})

      feedparser.on('error', (error: any) => {
        reject(error)
      })

      feedparser.on('readable', function (this: any) {
        let item
        while ((item = this.read())) {
          items.push(item)
        }
      })

      feedparser.on('end', () => {
        resolve(items)
      })

      fetch(url)
        .then((response) => {
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`)
          }
          return response.text()
        })
        .then((text) => {
          const stream = new Readable()
          stream.push(text)
          stream.push(null)
          stream.pipe(feedparser)
        })
        .catch((error) => {
          reject(error)
        })
    })
  }

  private generateItemId(item: any): string {
    if (item.guid) {
      return Hash.createContentHash(item.guid, '')
    }
    return Hash.createContentHash(item.title || '', item.link || '')
  }

  private parseDate(dateString?: string): Date {
    if (!dateString) {
      return new Date()
    }

    const parsed = new Date(dateString)
    if (isNaN(parsed.getTime())) {
      Logger.warn('Invalid date string, using current date', { dateString })
      return new Date()
    }

    return parsed
  }

  private sanitizeText(text: string): string {
    if (!text) return ''

    return text
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&nbsp;/g, ' ') // Replace non-breaking spaces
      .replace(/&amp;/g, '&') // Replace HTML entities
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
      .substring(0, 2000) // Limit length for Discord
  }
}
