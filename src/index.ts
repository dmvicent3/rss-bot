import DiscordApp from './Discord/App'
import Logger from './utils/Logger'

async function main() {
  try {
    Logger.info('Initializing Discord bot application...')
    const bot = new DiscordApp()

    Logger.info('Starting bot initialization...')
    await bot.initialize()

    Logger.info('Bot is running. Press Ctrl+C to stop.')
  } catch (error) {
    Logger.error('Failed to start bot', error)
    process.exit(1)
  }
}

process.on('uncaughtException', (error) => {
  Logger.error('Uncaught exception in main', error)
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  Logger.error('Unhandled rejection in main', reason)
  process.exit(1)
})

main().catch((error) => {
  Logger.error('Error in main function', error)
  process.exit(1)
})
