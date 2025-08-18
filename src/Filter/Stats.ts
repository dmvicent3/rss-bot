import type { FilterResult } from '../types/index.js'
import Logger from '../utils/Logger.js'

interface FilterStatistics {
  totalProcessed: number
  totalAllowed: number
  totalRejected: number
  stageARejects: number
  stageBRejects: number
  averageConfidence: number
  processingErrors: number
  lastUpdated: Date
}

export default class FilterStats {
  private stats: FilterStatistics = {
    totalProcessed: 0,
    totalAllowed: 0,
    totalRejected: 0,
    stageARejects: 0,
    stageBRejects: 0,
    averageConfidence: 0,
    processingErrors: 0,
    lastUpdated: new Date(),
  }

  private confidenceSum = 0
  private confidenceCount = 0

  recordFilterResult(result: FilterResult, stage?: 'A' | 'B'): void {
    this.stats.totalProcessed++
    this.stats.lastUpdated = new Date()

    if (result.shouldPost) {
      this.stats.totalAllowed++
    } else {
      this.stats.totalRejected++

      if (stage === 'A') {
        this.stats.stageARejects++
      } else if (stage === 'B') {
        this.stats.stageBRejects++
      }
    }

    if (result.confidence !== undefined) {
      this.confidenceSum += result.confidence
      this.confidenceCount++
      this.stats.averageConfidence = Math.round(
        this.confidenceSum / this.confidenceCount
      )
    }

    if (result.reason.includes('error')) {
      this.stats.processingErrors++
    }

    if (this.stats.totalProcessed % 50 === 0) {
      this.logStats()
    }
  }

  getStats(): FilterStatistics {
    return { ...this.stats }
  }

  getFilterEfficiency(): number {
    if (this.stats.totalProcessed === 0) return 0
    return Math.round(
      (this.stats.totalRejected / this.stats.totalProcessed) * 100
    )
  }

  getStageAEfficiency(): number {
    if (this.stats.totalRejected === 0) return 0
    return Math.round(
      (this.stats.stageARejects / this.stats.totalRejected) * 100
    )
  }

  reset(): void {
    this.stats = {
      totalProcessed: 0,
      totalAllowed: 0,
      totalRejected: 0,
      stageARejects: 0,
      stageBRejects: 0,
      averageConfidence: 0,
      processingErrors: 0,
      lastUpdated: new Date(),
    }
    this.confidenceSum = 0
    this.confidenceCount = 0

    Logger.info('Filter statistics reset')
  }

  private logStats(): void {
    Logger.info('Filter statistics update', {
      totalProcessed: this.stats.totalProcessed,
      allowedPercentage: Math.round(
        (this.stats.totalAllowed / this.stats.totalProcessed) * 100
      ),
      rejectedPercentage: Math.round(
        (this.stats.totalRejected / this.stats.totalProcessed) * 100
      ),
      stageAEfficiency: this.getStageAEfficiency(),
      averageConfidence: this.stats.averageConfidence,
      processingErrors: this.stats.processingErrors,
    })
  }
}
