import type { FeedItem, FilterResult, IFilterManager } from '../types'
import Logger from '../utils/Logger'

interface FilterTask {
  item: FeedItem
  resolve: (result: FilterResult) => void
  reject: (error: Error) => void
  timestamp: number
}

export default class FilterQueue {
  private queue: FilterTask[] = []
  private processing = false
  private readonly maxConcurrent: number
  private activePromises = new Set<Promise<void>>()

  constructor(private filterManager: IFilterManager, maxConcurrent = 3) {
    this.maxConcurrent = maxConcurrent
  }

  async filterItem(item: FeedItem): Promise<FilterResult> {
    return new Promise<FilterResult>((resolve, reject) => {
      const task: FilterTask = {
        item,
        resolve,
        reject,
        timestamp: Date.now(),
      }

      this.queue.push(task)
      this.processQueue()
    })
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return
    }

    this.processing = true

    try {
      while (
        this.queue.length > 0 &&
        this.activePromises.size < this.maxConcurrent
      ) {
        const task = this.queue.shift()
        if (!task) continue

        const promise = this.processTask(task)
        this.activePromises.add(promise)

        promise.finally(() => {
          this.activePromises.delete(promise)
          if (this.queue.length > 0) {
            setImmediate(() => this.processQueue())
          }
        })
      }

      if (this.queue.length === 0 && this.activePromises.size > 0) {
        await Promise.all(Array.from(this.activePromises))
      }
    } finally {
      this.processing = false
    }
  }

  private async processTask(task: FilterTask): Promise<void> {
    try {
      Logger.info('Processing filter task', {
        itemTitle: task.item.title,
        queueLength: this.queue.length,
        activeCount: this.activePromises.size,
      })

      const result = await this.filterManager.shouldPostItem(task.item)
      task.resolve(result)

      Logger.info('Filter task completed', {
        itemTitle: task.item.title,
        shouldPost: result.shouldPost,
        processingTime: Date.now() - task.timestamp,
      })
    } catch (error) {
      Logger.error('Filter task failed', {
        error,
        itemTitle: task.item.title,
        processingTime: Date.now() - task.timestamp,
      })
      task.reject(error as Error)
    }
  }

  getQueueLength(): number {
    return this.queue.length
  }

  getActiveCount(): number {
    return this.activePromises.size
  }

  isProcessing(): boolean {
    return this.processing || this.activePromises.size > 0
  }

  async waitForCompletion(): Promise<void> {
    while (this.isProcessing() || this.queue.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
}
