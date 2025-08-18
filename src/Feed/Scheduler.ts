import type DiscordClient from '../Discord/Client'
import FilterQueue from '../Filter/Queue'
import FilterStats from '../Filter/Stats'
import type {
  BotConfig,
  FilterResult,
  IFeedManager,
  IFilterManager,
  IStorage,
} from '../types'
import Logger from '../utils/Logger'
import FeedDeduplicator from './Deduplicator'
import FeedDispatcher from './Dispatcher'
import FeedPoller from './Poller'
import * as cron from 'node-cron'

export default class FeedScheduler {
  private cronJob: cron.ScheduledTask | null = null
  private feedPoller: FeedPoller
  private filterQueue: FilterQueue
  private filterStats: FilterStats
  private feedDispatcher: FeedDispatcher
  private feedDeduplicator: FeedDeduplicator

  private isRunning = false
  private lastRunTime: Date | null = null

  constructor(
    private storage: IStorage,
    private feedManager: IFeedManager,
    private filterManager: IFilterManager,
    private discordClient: DiscordClient
  ) {
    this.feedDeduplicator = new FeedDeduplicator(storage)
    this.filterQueue = new FilterQueue(this.filterManager)
    this.filterStats = new FilterStats()
    this.feedDispatcher = new FeedDispatcher(this.storage, this.discordClient)
    this.feedPoller = new FeedPoller(
      this.feedManager,
      this.storage,
      this.feedDeduplicator
    )
  }

  start(): void {
    if (this.cronJob) {
      Logger.warn('Feed scheduler is already running')
      return
    }

    // Run every 30 minutes
    this.cronJob = cron.schedule('*/30 * * * *', async () => {
      Logger.info('🕐 Scheduled feed processing triggered')
      await this.checkAndProcessGuilds()
    })

    Logger.info('Feed scheduler started - checking every 30 minutes')

    const now = new Date()
    const nextRun = new Date(now.getTime() + 30 * 60 * 1000)
    Logger.info('Next scheduled run will be at', {
      nextRun: nextRun.toISOString(),
    })
  }

  stop(): void {
    if (this.cronJob) {
      this.cronJob.destroy()
      this.cronJob = null
      this.feedDeduplicator.clearCache()
      Logger.info('Feed scheduler stopped')
    }
  }

  async runOnce(): Promise<void> {
    if (this.isRunning) {
      Logger.warn('Feed processing already in progress, skipping')
      return
    }

    await this.checkAndProcessGuilds()
  }

  private async checkAndProcessGuilds(): Promise<void> {
    if (this.isRunning) {
      Logger.info('Feed processing already in progress, skipping scheduled run')
      return
    }

    this.isRunning = true
    const startTime = Date.now()

    try {
      Logger.info('Starting scheduled feed processing cycle')

      const guilds = await this.getActiveGuilds()

      if (guilds.length === 0) {
        Logger.info('No active guilds configured, skipping feed processing')
        return
      }

      const guildsToUpdate = guilds.filter((guild) =>
        this.shouldUpdateGuild(guild)
      )

      if (guildsToUpdate.length === 0) {
        Logger.info('No guilds need updates at this time', {
          totalGuilds: guilds.length,
          guildsChecked: guilds.map((g) => ({
            guildId: g.guildId,
            pollIntervalHours: g.pollIntervalHours,
            lastUpdated: g.lastUpdated?.toISOString(),
          })),
        })
        return
      }

      Logger.info('Processing feed for guilds', {
        totalGuilds: guilds.length,
        guildsToUpdate: guildsToUpdate.length,
      })

      const feedResults = await this.feedPoller.pollAllFeeds()
      const totalNewItems = Array.from(feedResults.values()).reduce(
        (sum, items) => sum + items.length,
        0
      )

      if (totalNewItems === 0) {
        Logger.info('No new items found in any feeds')
        guildsToUpdate.forEach(async (guild) => {
          await this.storage.updateBotConfig({
            guildId: guild.guildId,
            lastUpdated: new Date(),
          })
        })
        return
      }

      Logger.info('Found new items, starting filtering and dispatch', {
        totalNewItems,
        feedsWithItems: Array.from(feedResults.entries()).filter(
          ([, items]) => items.length > 0
        ).length,
      })

      for (const guild of guildsToUpdate) {
        await this.processGuildFeed(guild, feedResults)
      }

      this.lastRunTime = new Date()

      Logger.info('Feed processing cycle completed', {
        duration: Date.now() - startTime,
        guildsProcessed: guildsToUpdate.length,
        totalNewItems,
      })
    } catch (error) {
      Logger.error('Error in feed processing cycle', { error })
    } finally {
      this.isRunning = false
    }
  }

  private async getActiveGuilds(): Promise<BotConfig[]> {
    try {
      const botConfigs = await this.storage.getAllBotConfigs()

      // Filter out guilds that don't have a channel configured
      const activeGuilds = botConfigs.filter((config) => config.channelId)

      Logger.info('Retrieved active guild configurations', {
        totalConfigs: botConfigs.length,
        activeGuilds: activeGuilds.length,
      })

      return activeGuilds
    } catch (error) {
      Logger.error('Failed to get active guilds', { error })
      return []
    }
  }

  private shouldUpdateGuild(guild: BotConfig): boolean {
    const lastUpdate = guild.lastUpdated
      ? new Date(guild.lastUpdated + 'Z') // force UTC
      : new Date(0)

    const now = Date.now()
    const intervalMs = (guild.pollIntervalHours || 1) * 60 * 60 * 1000
    const timeSinceLastUpdate = now - lastUpdate.getTime()

    const shouldUpdate = timeSinceLastUpdate >= intervalMs

    Logger.info('Guild update check', {
      guildId: guild.guildId,
      lastUpdatedRaw: guild.lastUpdated,
      lastUpdatedUTC: lastUpdate.toISOString(),
      nowUTC: new Date(now).toISOString(),
      timeSinceLastUpdate: Math.round(timeSinceLastUpdate / 1000 / 60),
      intervalMs: Math.round(intervalMs / 1000 / 60),
      shouldUpdate,
    })

    return shouldUpdate
  }

  private async processGuildFeed(
    guild: BotConfig,
    feedResults: Map<string, any[]>
  ): Promise<void> {
    try {
      if (!guild.channelId) {
        Logger.warn('Guild has no channel configured, skipping', {
          guildId: guild.guildId,
        })
        return
      }

      Logger.info('Processing feed for guild', {
        guildId: guild.guildId,
        channelId: guild.channelId,
        pollInterval: guild.pollIntervalHours,
      })

      const allItems = Array.from(feedResults.values()).flat()
      const filteredItems = []

      Logger.info('Starting to filter items', { totalItems: allItems.length })

      for (let i = 0; i < allItems.length; i++) {
        const item = allItems[i]
        try {
          Logger.info(`Filtering item ${i + 1}/${allItems.length}`, {
            itemTitle: item.title,
          })

          // Add timeout to filtering
          const filterPromise = this.filterQueue.filterItem(item)
          const timeoutPromise = new Promise<FilterResult>((_, reject) => {
            setTimeout(() => reject(new Error('Filtering timeout')), 30000) // 30 second timeout
          })

          const filterResult = await Promise.race([
            filterPromise,
            timeoutPromise,
          ])
          this.filterStats.recordFilterResult(filterResult)

          if (filterResult.shouldPost) {
            item.category = filterResult?.category
            filteredItems.push(item)
            await this.storage.addFeedItem(item)
          }

          Logger.info('Item filtered', {
            itemTitle: item.title,
            shouldPost: filterResult.shouldPost,
            reason: filterResult.reason,
            itemNumber: i + 1,
            totalItems: allItems.length,
          })
        } catch (error) {
          Logger.error('Error filtering item', {
            error,
            itemTitle: item.title,
            itemNumber: i + 1,
            totalItems: allItems.length,
          })
        }
      }

      Logger.info('Finished filtering all items', {
        totalItems: allItems.length,
        filteredItems: filteredItems.length,
      })

      if (filteredItems.length === 0) {
        Logger.info('No items passed filtering for guild', {
          guildId: guild.guildId,
        })
        await this.storage.updateBotConfig({
          guildId: guild.guildId,
          lastUpdated: new Date(),
        })
        return
      }

      Logger.info('Starting feed dispatch', {
        channelId: guild.channelId,
        itemCount: filteredItems.length,
      })

      await this.feedDispatcher.dispatchFeed(guild.channelId, filteredItems)

      Logger.info('Feed dispatch completed successfully')

      await this.storage.updateBotConfig({
        guildId: guild.guildId,
        lastUpdated: new Date(),
      })

      Logger.info('Successfully processed guild feed', {
        guildId: guild.guildId,
        itemsProcessed: allItems.length,
        itemsPosted: filteredItems.length,
      })
    } catch (error) {
      Logger.error('Error processing guild feed', {
        error,
        guildId: guild.guildId,
      })
    }
  }

  async triggerManualRun(): Promise<void> {
    Logger.info('Manual feed processing triggered')
    await this.runOnce()
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      isScheduled: this.cronJob !== null,
      lastRunTime: this.lastRunTime,
      queueLength: this.filterQueue.getQueueLength(),
      filterStats: this.filterStats.getStats(),
      deduplicationStats: this.feedDeduplicator.getCacheStats(),
    }
  }
}
