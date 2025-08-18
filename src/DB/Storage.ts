import { Database } from 'bun:sqlite'
import Logger from '../utils/Logger'
import { mkdir } from 'fs/promises'
import { dirname } from 'path'
import type { BotConfig, FeedItem, Filter, IStorage, RSSFeed } from '../types'
import { Hash } from '../utils/Hash'

export default class DBStorage implements IStorage {
  private db: Database | undefined
  private initialized = false

  constructor(private dbPath: string) {}

  async initialize(): Promise<void> {
    if (this.initialized) return

    try {
      await mkdir(dirname(this.dbPath), { recursive: true })

      this.db = new Database(this.dbPath)
      this.db.run('PRAGMA journal_mode = WAL')
      this.db.run('PRAGMA foreign_keys = ON')

      this.createTables()
      this.initialized = true
      Logger.info('Database initialized successfully', { path: this.dbPath })
    } catch (error) {
      Logger.error('Failed to initialize database', {
        error:
          error instanceof Error
            ? {
                message: error.message,
                stack: error.stack,
                name: error.name,
              }
            : error,
        path: this.dbPath,
      })
      throw error
    }
  }

  private createTables(): void {
    if (!this.db) throw new Error('Database not initialized')

    this.db.run(`
      CREATE TABLE IF NOT EXISTS rss_feeds (
        id TEXT PRIMARY KEY,
        url TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        last_seen_id TEXT,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT 1
      )
    `)

    this.db.run(`
      CREATE TABLE IF NOT EXISTS feed_items (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        link TEXT NOT NULL,
        category TEXT DEFAULT 'Unknown',
        pub_date DATETIME NOT NULL,
        feed_id TEXT NOT NULL,
        content_hash TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (feed_id) REFERENCES rss_feeds (id) ON DELETE CASCADE
      )
    `)

    this.db.run(`
      CREATE TABLE IF NOT EXISTS filters (
        id TEXT PRIMARY KEY,
        keyword TEXT NOT NULL,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT 1
      )
    `)

    this.db.run(`
      CREATE TABLE IF NOT EXISTS bot_config (
        guild_id TEXT PRIMARY KEY,
        channel_id TEXT,
        poll_interval_hours INTEGER DEFAULT 2,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_feed_items_content_hash ON feed_items(content_hash)
    `)
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_feed_items_feed_id ON feed_items(feed_id)
    `)
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_filters_active ON filters(is_active)
    `)
  }

  async addFeed(feed: Omit<RSSFeed, 'id' | 'addedAt'>): Promise<RSSFeed> {
    if (!this.initialized || !this.db) {
      throw new Error('Database not initialized')
    }

    const id = Hash.generateId()
    const addedAt = new Date()

    try {
      this.db.run(
        `
        INSERT INTO rss_feeds (id, url, name, last_seen_id, is_active)
        VALUES (?, ?, ?, ?, ?)
      `,
        [
          id,
          feed.url,
          feed.name,
          feed.lastSeenId || null,
          feed.isActive ? 1 : 0,
        ]
      )

      const newFeed: RSSFeed = {
        id,
        url: feed.url,
        name: feed.name,
        lastSeenId: feed.lastSeenId,
        addedAt,
        isActive: feed.isActive,
      }

      Logger.info('Feed added successfully', { feedId: id, url: feed.url })
      return newFeed
    } catch (error) {
      Logger.error('Failed to add feed', { error, url: feed.url })
      throw error
    }
  }

  async removeFeed(feedId: string): Promise<boolean> {
    if (!this.initialized || !this.db) {
      throw new Error('Database not initialized')
    }

    const result = this.db.run('DELETE FROM rss_feeds WHERE id = ?', [feedId])

    const success = result.changes > 0
    if (success) {
      Logger.info('Feed removed successfully', { feedId })
    } else {
      Logger.warn('Feed not found for removal', { feedId })
    }

    return success
  }

  async getAllFeeds(): Promise<RSSFeed[]> {
    if (!this.initialized || !this.db) {
      throw new Error('Database not initialized')
    }

    const rows = this.db
      .query(
        `
      SELECT id, url, name, last_seen_id, added_at, is_active
      FROM rss_feeds
      WHERE is_active = 1
      ORDER BY added_at DESC
    `
      )
      .all() as any[]

    return rows.map((row) => ({
      id: row.id,
      url: row.url,
      name: row.name,
      lastSeenId: row.last_seen_id,
      addedAt: new Date(row.added_at),
      isActive: Boolean(row.is_active),
    }))
  }

  async updateFeedLastSeen(feedId: string, lastSeenId: string): Promise<void> {
    if (!this.initialized || !this.db) {
      throw new Error('Database not initialized')
    }

    const result = this.db.run(
      'UPDATE rss_feeds SET last_seen_id = ? WHERE id = ?',
      [lastSeenId, feedId]
    )

    if (result.changes === 0) {
      Logger.warn('Feed not found for last seen update', { feedId })
    }
  }

  async addFeedItem(item: Omit<FeedItem, 'id'>): Promise<FeedItem> {
    if (!this.initialized || !this.db) {
      throw new Error('Database not initialized')
    }

    const id = Hash.generateId()

    try {
      this.db.run(
        `
        INSERT INTO feed_items (id, title, description, link, category, pub_date, feed_id, content_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          id,
          item.title,
          item.description,
          item.link,
          item.category || 'Unknown',
          item.pubDate.toISOString(),
          item.feedId,
          item.contentHash,
        ]
      )

      const newItem: FeedItem = { id, ...item }
      Logger.info('Feed item added', { itemId: id, title: item.title })
      return newItem
    } catch (error) {
      Logger.error('Failed to add feed item', { error, title: item.title })
      throw error
    }
  }

  async isFeedItemSeen(contentHash: string): Promise<boolean> {
    if (!this.initialized || !this.db) {
      throw new Error('Database not initialized')
    }

    const result = this.db
      .query('SELECT COUNT(*) as count FROM feed_items WHERE content_hash = ?')
      .get(contentHash) as any

    Logger.info('isFeedItemSeen check', { contentHash, result })

    return result && result.count > 0
  }

  async addFilter(filter: Omit<Filter, 'id' | 'addedAt'>): Promise<Filter> {
    if (!this.initialized || !this.db) {
      throw new Error('Database not initialized')
    }

    const id = Hash.generateId()
    const addedAt = new Date()

    try {
      this.db.run(
        `
        INSERT INTO filters (id, keyword, is_active)
        VALUES (?, ?, ?)
      `,
        [id, filter.keyword, filter.isActive ? 1 : 0]
      )

      const newFilter: Filter = {
        id,
        keyword: filter.keyword,
        addedAt,
        isActive: filter.isActive,
      }

      Logger.info('Filter added successfully', {
        filterId: id,
        keyword: filter.keyword,
      })
      return newFilter
    } catch (error) {
      Logger.error('Failed to add filter', { error, keyword: filter.keyword })
      throw error
    }
  }

  async removeFilter(filterId: string): Promise<boolean> {
    if (!this.initialized || !this.db) {
      throw new Error('Database not initialized')
    }

    const result = this.db.run('DELETE FROM filters WHERE id = ?', [filterId])

    const success = result.changes > 0
    if (success) {
      Logger.info('Filter removed successfully', { filterId })
    } else {
      Logger.warn('Filter not found for removal', { filterId })
    }

    return success
  }

  async getAllFilters(): Promise<Filter[]> {
    if (!this.initialized || !this.db) {
      throw new Error('Database not initialized')
    }

    const rows = this.db
      .query(
        `
      SELECT id, keyword, added_at, is_active
      FROM filters
      WHERE is_active = 1
      ORDER BY added_at DESC
    `
      )
      .all() as any[]

    return rows.map((row) => ({
      id: row.id,
      keyword: row.keyword,
      addedAt: new Date(row.added_at),
      isActive: Boolean(row.is_active),
    }))
  }

  async getBotConfig(guildId: string): Promise<BotConfig | null> {
    if (!this.initialized || !this.db) {
      throw new Error('Database not initialized')
    }

    const row = this.db
      .query(
        `
      SELECT guild_id, channel_id, poll_interval_hours, last_updated
      FROM bot_config
      WHERE guild_id = ?
    `
      )
      .get(guildId) as any

    if (!row) return null

    return {
      guildId: row.guild_id,
      channelId: row.channel_id,
      pollIntervalHours: row.poll_interval_hours,
      lastUpdated: new Date(row.last_updated),
    }
  }

  async getAllBotConfigs(): Promise<BotConfig[]> {
    if (!this.initialized || !this.db) {
      throw new Error('Database not initialized')
    }

    const rows = this.db
      .query(
        `
      SELECT guild_id, channel_id, poll_interval_hours, last_updated
      FROM bot_config
      ORDER BY last_updated DESC
    `
      )
      .all() as any[]

    return rows.map((row) => ({
      guildId: row.guild_id,
      channelId: row.channel_id,
      pollIntervalHours: row.poll_interval_hours,
      lastUpdated: new Date(row.last_updated),
    }))
  }

  async updateBotConfig(
    config: Partial<BotConfig> & { guildId: string }
  ): Promise<void> {
    if (!this.initialized || !this.db) {
      throw new Error('Database not initialized')
    }

    // Build dynamic update clauses only for non-null/undefined values
    const updateClauses: string[] = []
    const params: any[] = []

    if (config.channelId !== null && config.channelId !== undefined) {
      updateClauses.push('channel_id = ?')
      params.push(config.channelId)
    }

    if (
      config.pollIntervalHours !== null &&
      config.pollIntervalHours !== undefined
    ) {
      updateClauses.push('poll_interval_hours = ?')
      params.push(config.pollIntervalHours)
    }

    // Always update last_updated
    updateClauses.push('last_updated = CURRENT_TIMESTAMP')

    // Add guildId for the WHERE clause
    params.push(config.guildId)

    if (updateClauses.length === 1) {

      this.db.run(
        `UPDATE bot_config SET last_updated = CURRENT_TIMESTAMP WHERE guild_id = ?`,
        [config.guildId]
      )
    } else {
      
      const insertColumns = ['guild_id']
      const insertValues = ['?']
      const insertParams:any[] = [config.guildId]

      if (config.channelId !== null && config.channelId !== undefined) {
        insertColumns.push('channel_id')
        insertValues.push('?')
        insertParams.push(config.channelId)
      }

      if (
        config.pollIntervalHours !== null &&
        config.pollIntervalHours !== undefined
      ) {
        insertColumns.push('poll_interval_hours')
        insertValues.push('?')
        insertParams.push(config.pollIntervalHours)
      }

      insertColumns.push('last_updated')
      insertValues.push('CURRENT_TIMESTAMP')

      this.db.run(
        `
      INSERT INTO bot_config (${insertColumns.join(', ')})
      VALUES (${insertValues.join(', ')})
      ON CONFLICT(guild_id) DO UPDATE SET ${updateClauses.join(', ')}
      `,
        [...insertParams, ...params.slice(0, -1)] // Remove the duplicate guildId
      )
    }

    Logger.info('Bot config updated', { guildId: config.guildId })
  }

  async cleanup(): Promise<void> {
    if (!this.initialized || !this.db) {
      throw new Error('Database not initialized')
    }

    try {
      const result = this.db.run(`
        DELETE FROM feed_items 
        WHERE created_at < datetime('now', '-30 days')
      `)

      if (result.changes > 0) {
        Logger.info('Cleaned up old feed items', {
          deletedCount: result.changes,
        })
      }
    } catch (error) {
      Logger.error('Failed to cleanup old feed items', { error })
    }
  }

  close(): void {
    if (this.db) {
      this.db.close()
      Logger.info('Database connection closed')
    }
  }
}
