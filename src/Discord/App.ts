import AiGoogle from '../AI/Google'
import DBClient from '../DB/Client'
import FeedManager from '../Feed/Manager'
import FeedScheduler from '../Feed/Scheduler'
import FilterManager from '../Filter/Manager'
import type { IFeedManager, IFilterManager, IStorage } from '../types'
import Environment from '../utils/Environment'
import Logger from '../utils/Logger'
import DiscordClient from './Client'
import DiscordCommands from './Commands'

export default class DiscordApp {
  private discordClient: DiscordClient
  private storage: IStorage
  private feedManager: IFeedManager
  private feedScheduler: FeedScheduler
  private filterManager: IFilterManager
  private genAI: AiGoogle

  private isInitialized = false
  private isShuttingDown = false

  constructor() {
    this.storage = DBClient.getInstance()
    this.feedManager = new FeedManager(this.storage)
    this.genAI = new AiGoogle(Environment.GEMINI_API_KEY)
    this.discordClient = new DiscordClient(this.storage, this.feedManager)
    this.filterManager = new FilterManager(this.storage, this.genAI)
    this.feedScheduler = new FeedScheduler(
      this.storage,
      this.feedManager,
      this.filterManager,
      this.discordClient
    )
    this.setupShutdownHandlers()
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      Logger.warn('Bot application already initialized')
      return
    }

    try {
      Logger.info('Starting Discord RSS Bot initialization...')

      this.validateEnvironment()

      await DBClient.initialize()

      await this.genAI.healthcheck()

      Logger.info('Starting Discord bot...')

      DiscordCommands.deployCommands()

      await this.discordClient.start()

      await this.discordClient.ready()

      Logger.info('Initializing scheduler...')
      this.feedScheduler.start()

      this.isInitialized = true

      this.logApplicationStatus()
    } catch (error) {
      Logger.error('Failed to initialize bot application', { error })
      await this.shutdown()
      throw error
    }
  }

  async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      Logger.warn('Shutdown already in progress')
      return
    }

    this.isShuttingDown = true

    try {
      Logger.info('Starting graceful shutdown...')

      if (this.feedScheduler) {
         this.feedScheduler.stop()
      }

      if (this.discordClient) {
        await this.discordClient.stop()
      }

      await DBClient.closeInstance()

      Logger.info('Graceful shutdown completed')
    } catch (error) {
      Logger.error('Error during shutdown', { error })
    } finally {
      this.isInitialized = false
      this.isShuttingDown = false
    }
  }

  getStatus() {
    return {
      isInitialized: this.isInitialized,
      isShuttingDown: this.isShuttingDown,
      clientReady: this.discordClient.isClientReady(),
    }
  }

  getStorage(): IStorage {
    return this.storage
  }

  getFeedManager(): IFeedManager {
    return this.feedManager
  }

  getClient() {
    return this.discordClient
  }

  private validateEnvironment() {
    const requiredVars = [
      'DISCORD_TOKEN',
      'DISCORD_CLIENT_ID',
      'GEMINI_API_KEY',
    ]

    const missing = requiredVars.filter((varName) => {
      try {
        switch (varName) {
          case 'DISCORD_TOKEN':
            Environment.DISCORD_TOKEN
            break
          case 'DISCORD_CLIENT_ID':
            Environment.DISCORD_CLIENT_ID
            break
          case 'GEMINI_API_KEY':
            Environment.GEMINI_API_KEY
            break
        }
        return false
      } catch {
        return true
      }
    })

    if (missing.length > 0) {
      throw new Error(
        `Missing required environment variables: ${missing.join(', ')}`
      )
    }

    Logger.info('Environment validation passed')
  }

  private setupShutdownHandlers() {
    const shutdownHandler = async (signal: string) => {
      Logger.info(`Received ${signal}, initiating graceful shutdown...`)
      await this.shutdown()
      process.exit(0)
    }

    process.on('SIGINT', () => shutdownHandler('SIGINT'))
    process.on('SIGTERM', () => shutdownHandler('SIGTERM'))

    process.on('uncaughtException', async (error) => {
      Logger.error('Uncaught exception', { error })
      await this.shutdown()
      process.exit(1)
    })

    process.on('unhandledRejection', async (reason, promise) => {
      Logger.error('Unhandled rejection', { reason, promise })
      await this.shutdown()
      process.exit(1)
    })
  }

  private logApplicationStatus(): void {
    const status = this.getStatus()
    Logger.info('Application Status', {
      initialized: status.isInitialized,
      discordReady: status.clientReady,
       schedulerStatus: this.feedScheduler.getStatus(),
    })
  }
}
