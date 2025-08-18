import type DiscordClient from '../Discord/Client'
import type { FeedItem, IStorage } from '../types'
import Logger from '../utils/Logger'
import Utils from '../utils/Utils'

export default class FeedDispatcher {
  private readonly maxItemsPerBatch = 5
  private readonly delayBetweenItems = 1000 // 1 second
  private readonly maxRetries = 3

  constructor(
    private storage: IStorage,
    private discordClient: DiscordClient
  ) {}

  async dispatchFeed(channelId: string, feedItems: FeedItem[]): Promise<void> {
    if (!this.discordClient.isClientReady()) {
      throw new Error('Discord bot is not ready')
    }

    if (feedItems.length === 0) {
      Logger.info('No feed items to dispatch', { channelId })
      return
    }

    Logger.info('Starting feed dispatch', {
      channelId,
      itemCount: feedItems.length,
    })

    try {
      const sortedItems = [...feedItems] /* .sort(
        (a, b) => a.pubDate.getTime() - b.pubDate.getTime()
      ) */

      const batches = Utils.chunkArray(sortedItems, this.maxItemsPerBatch)

      let totalPosted = 0
      let totalFailed = 0

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i]
        Logger.info('Processing batch', {
          batchNumber: i + 1,
          totalBatches: batches.length,
          batchSize: batch?.length || 0,
        })

        for (const item of batch || []) {
          try {
            await this.postSingleItem(channelId, item)
            totalPosted++

            if (totalPosted < feedItems.length) {
              await Utils.sleep(this.delayBetweenItems)
            }
          } catch (error) {
            Logger.error('Failed to post feed item', {
              error,
              channelId,
              itemTitle: item.title,
              itemLink: item.link,
            })
            totalFailed++
          }
        }

        if (i < batches.length - 1) {
          await Utils.sleep(this.delayBetweenItems * 2)
        }
      }

      Logger.info('Feed dispatch completed', {
        channelId,
        totalItems: feedItems.length,
        totalPosted,
        totalFailed,
      })

      if (totalFailed > 0) {
        Logger.warn('Some items failed to post', {
          channelId,
          failedCount: totalFailed,
          successRate: Math.round((totalPosted / feedItems.length) * 100),
        })
      }
    } catch (error) {
      Logger.error('Error in feed dispatch', { error, channelId })
      throw error
    }
  }

  private async postSingleItem(
    channelId: string,
    item: FeedItem
  ): Promise<void> {
    let attempt = 0
    let lastError: Error | null = null

    while (attempt < this.maxRetries) {
      try {
        const feeds = await this.storage.getAllFeeds()
        const feed = feeds.find((f) => f.id === item.feedId)
        const feedName = feed?.name || 'RSS Feed'

        const feedItemWithFeedName = {
          ...item,
          feedName,
        }

        await this.discordClient.sendFeedToChannel(channelId, [
          feedItemWithFeedName,
        ])

        Logger.info('Successfully posted feed item', {
          channelId,
          itemTitle: item.title,
          attempt: attempt + 1,
        })

        return
      } catch (error) {
        lastError = error as Error
        attempt++

        Logger.warn('Failed to post item, retrying', {
          channelId,
          itemTitle: item.title,
          attempt,
          maxRetries: this.maxRetries,
          error: lastError.message,
        })

        if (attempt < this.maxRetries) {
          const delay = Math.pow(2, attempt) * 1000
          await Utils.sleep(delay)
        }
      }
    }

    throw new Error(
      `Failed to post item after ${this.maxRetries} attempts: ${lastError?.message}`
    )
  }
}
