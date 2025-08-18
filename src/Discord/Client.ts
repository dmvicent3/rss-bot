import {
  Client,
  GatewayIntentBits,
  Events,
  type Interaction,
  TextChannel,
} from 'discord.js'
import CommandHandler from './CommandHandler'
import Logger from '../utils/Logger'
import Environment from '../utils/Environment'
import type { IFeedManager, IStorage } from '../types'

export default class DiscordClient {
  private client: Client
  private isReady = false
  private commandHandler: CommandHandler

  constructor(private storage: IStorage, private feedManager: IFeedManager) {
    this.client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
    })

    this.commandHandler = new CommandHandler(this.storage, this.feedManager)
    this.setupEventHandlers()
  }

  private setupEventHandlers() {
    this.client.on(
      Events.InteractionCreate,
      async (interaction: Interaction) => {
        if (!interaction.isChatInputCommand()) return

        try {
          await this.commandHandler.handleCommand(interaction)
        } catch (error) {
          Logger.error('Error handling command', {
            error,
            commandName: interaction.commandName,
          })

          const errorMessage =
            'There was an error while executing this command!'

          try {
            if (interaction.replied || interaction.deferred) {
              await interaction.followUp({
                content: errorMessage,
                ephemeral: true,
              })
            } else {
              await interaction.reply({
                content: errorMessage,
                ephemeral: true,
              })
            }
          } catch (replyError) {
            Logger.error('Failed to send error message to user', { replyError })
          }
        }
      }
    )

    this.client.on(Events.Error, (error) => {
      Logger.error('Discord client error', { error })
    })

    this.client.on(Events.Warn, (warning) => {
      Logger.warn('Discord client warning', { warning })
    })
  }

  async start(): Promise<void> {
    try {
      await this.client.login(Environment.DISCORD_TOKEN)
      Logger.info('Discord bot started successfully')
    } catch (error) {
      Logger.error('Failed to start Discord bot', { error })
      throw error
    }
  }

  ready(timeoutMs = 10000): Promise<boolean> {
    if (this.client.isReady()) return Promise.resolve(true)

    return new Promise<boolean>((resolve) => {
      let timer: NodeJS.Timeout

      const onReady = (readyClient: any) => {
        this.isReady = true
        Logger.info(`Discord bot ready! Logged in as ${readyClient.user.tag}`)
        cleanup()
        resolve(true)
      }

      const onError = (err: unknown) => {
        Logger.error('Discord client error', { err })
        cleanup()
        throw new Error(`Discord client error: ${err}`)
      }

      const onTimeout = () => {
        Logger.warn('Timed out waiting for Discord client')
        cleanup()
        throw new Error('Discord client did not become ready in time')
      }

      const cleanup = () => {
        clearTimeout(timer)
        this.client.removeListener(Events.ClientReady, onReady)
        this.client.removeListener(Events.Error, onError)
      }

      this.client.once(Events.ClientReady, onReady)
      this.client.once(Events.Error, onError)
      timer = setTimeout(onTimeout, timeoutMs)
    })
  }

  async stop(): Promise<void> {
    try {
      this.client.destroy()
      Logger.info('Discord bot stopped')
    } catch (error) {
      Logger.error('Error stopping Discord bot', { error })
      throw error
    }
  }

  getClient(): Client {
    return this.client
  }

  isClientReady() {
    return this.isReady && this.client.isReady()
  }

  async sendFeedToChannel(channelId: string, feedItems: any[]): Promise<void> {
    if (!this.isClientReady()) {
      throw new Error('Discord bot is not ready')
    }

    try {
      const channel = await this.client.channels.fetch(channelId)
      if (!channel || !channel.isTextBased()) {
        throw new Error('Invalid or non-text channel')
      }

      for (const item of feedItems) {
        const embed = this.createNewsEmbed(item)
        await (channel as TextChannel).send({ embeds: [embed] })

        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 100))
      }

      Logger.info('Feed items sent to channel', {
        channelId,
        itemCount: feedItems.length,
      })
    } catch (error) {
      Logger.error('Failed to send feed to channel', {
        error,
        channelId,
        itemCount: feedItems.length,
      })
      throw error
    }
  }

  private createNewsEmbed(newsItem: any) {
    const { EmbedBuilder } = require('discord.js')

    const colorMap: Record<string, number> = {
      Technology: 0x1f8b4c,
      Science: 0x3498db,
      Politics: 0xe74c3c,
      Health: 0x9b59b6,
      Business: 0xf1c40f,
      Entertainment: 0xe67e22,
      Sports: 0x2ecc71,
      'Natural Disaster': 0x95a5a6,
      Weather: 0x95a5a6,
    }

    const embed = new EmbedBuilder()
      .setTitle(
        newsItem.title.length > 256
          ? newsItem.title.substring(0, 253) + '...'
          : newsItem.title
      )
      .setDescription(
        newsItem.description.length > 4096
          ? newsItem.description.substring(0, 4093) + '...'
          : newsItem.description
      )
      .setURL(newsItem.link)
      .setTimestamp(new Date(newsItem.pubDate))
      .setColor(colorMap?.[newsItem?.category] || 0x0099ff)
      .setFooter({
        text: `Source: ${newsItem.feedName || 'RSS Feed'} • Category: ${
          newsItem.category
        }`,
      })

    return embed
  }
}
