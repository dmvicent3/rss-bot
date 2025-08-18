import type { FeedItem, IStorage } from '../types'
import Logger from '../utils/Logger'

export default class FeedDeduplicator {
  private recentHashes = new Set<string>()
  private readonly maxRecentHashes = 10000
  private lastCleanup = Date.now()
  private readonly cleanupIntervalMs = 24 * 60 * 60 * 1000 // 24 hours

  constructor(private storage: IStorage) {}

  async isDuplicate(item: FeedItem): Promise<boolean> {

    try {
      if (this.recentHashes.has(item.contentHash)) {
        Logger.info('Duplicate detected in memory cache', {
          itemTitle: item.title,
          contentHash: item.contentHash,
        })

        return true
      }

      const isSeenInDb = await this.storage.isFeedItemSeen(item.contentHash)

      if (isSeenInDb) {
        Logger.info('Duplicate detected in database', {
          itemTitle: item.title,
          contentHash: item.contentHash,
        })

        this.addToRecentCache(item.contentHash)
        return true
      }

      this.addToRecentCache(item.contentHash)

      this.performPeriodicCleanup()

      return false
    } catch (error) {
      Logger.error('Error checking for duplicate', {
        error,
        itemTitle: item.title,
        contentHash: item.contentHash,
      })
      return false
    }
  }

  async filterDuplicates(items: FeedItem[]): Promise<FeedItem[]> {
    const uniqueItems: FeedItem[] = []
    const duplicateCount = { count: 0 }

    Logger.info('Starting duplicate filtering', { totalItems: items.length })

    for (const item of items) {
      try {
        const isDupe = await this.isDuplicate(item)
        if (!isDupe) {
          uniqueItems.push(item)
        } else {
          duplicateCount.count++
        }
      } catch (error) {
        Logger.error('Error filtering duplicate', {
          error,
          itemTitle: item.title,
        })
        uniqueItems.push(item)
      }
    }

    Logger.info('Duplicate filtering completed', {
      originalCount: items.length,
      uniqueCount: uniqueItems.length,
      duplicatesFiltered: duplicateCount.count,
    })

    return uniqueItems
  }

  private addToRecentCache(contentHash: string): void {
    this.recentHashes.add(contentHash)

    if (this.recentHashes.size > this.maxRecentHashes) {
      const hashArray = Array.from(this.recentHashes)
      const toRemove = hashArray.slice(
        0,
        Math.floor(this.maxRecentHashes * 0.1)
      )
      toRemove.forEach((hash) => this.recentHashes.delete(hash))

      Logger.info('Cleaned up recent hashes cache', {
        removedCount: toRemove.length,
        remainingCount: this.recentHashes.size,
      })
    }
  }

  private performPeriodicCleanup(): void {
    const now = Date.now()
    if (now - this.lastCleanup > this.cleanupIntervalMs) {
      this.lastCleanup = now

      const oldSize = this.recentHashes.size
      this.recentHashes.clear()

      Logger.info('Performed periodic deduplication cleanup', {
        clearedHashes: oldSize,
      })

      this.storage.cleanup().catch((error) => {
        Logger.error('Error during database cleanup', { error })
      })
    }
  }

  getCacheStats(): {
    recentHashesCount: number
    maxRecentHashes: number
    lastCleanup: Date
  } {
    return {
      recentHashesCount: this.recentHashes.size,
      maxRecentHashes: this.maxRecentHashes,
      lastCleanup: new Date(this.lastCleanup),
    }
  }

  clearCache(): void {
    this.recentHashes.clear()
    Logger.info('Deduplication cache cleared manually')
  }
}
