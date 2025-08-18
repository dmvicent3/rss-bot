import FeedParser from 'feedparser'
import Logger from '../utils/Logger'
import { Readable } from 'stream'

export default class FeedValidator {
  private static readonly timeoutMs = 5000
  private static readonly headers = {
    'User-Agent': 'Discord RSS Bot/1.0 (Validator)',
  }

  private static async parseWithFeedparser(
    url: string
  ): Promise<{ meta: any | null; items: any[] }> {
    return new Promise((resolve, reject) => {
      const feedparser = new FeedParser({})
      const items: any[] = []
      let meta: any | null = null

      feedparser.on('error', (err: any) => reject(err))

      feedparser.on('meta', (m: any) => {
        meta = m
      })

      feedparser.on('readable', function (this: any) {
        let item
        while ((item = this.read())) {
          items.push(item)
        }
      })

      feedparser.on('end', () => resolve({ meta, items }))

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs)

      fetch(url, { headers: this.headers, signal: controller.signal })
        .then((res) => {
          clearTimeout(timeout)
          if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`)
          }
          return res.text()
        })
        .then((text) => {
          const stream = new Readable()
          stream.push(text)
          stream.push(null)
          stream.pipe(feedparser)
        })
        .catch((err) => {
          if (err.name === 'AbortError') {
            reject(new Error(`Fetch timed out after ${this.timeoutMs}ms`))
          } else {
            reject(err)
          }
        })
    })
  }

  static async isValidRSSUrl(
    url: string
  ): Promise<{ valid: boolean; error?: string; feedInfo?: any }> {
    try {
      const urlObj = new URL(url)
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        return { valid: false, error: 'URL must use HTTP or HTTPS protocol' }
      }

      const { meta, items } = await this.parseWithFeedparser(url)

      if (!meta || !meta.title) {
        Logger.warn('RSS feed validation failed - missing title', { url, meta })
        return { valid: false, error: 'RSS feed has no title' }
      }

      const feedInfo = {
        title: meta.title,
        description: meta.description || 'No description',
        itemCount: items?.length || 0,
        lastBuildDate:
          meta.date || meta.pubdate || meta['lastbuilddate'] || null,
        language: meta.language || null,
      }

      Logger.info('RSS feed validation successful', { url, feedInfo })
      return { valid: true, feedInfo }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown validation error'
      Logger.warn('RSS feed validation failed', { url, error: errorMessage })
      return { valid: false, error: errorMessage }
    }
  }
}
