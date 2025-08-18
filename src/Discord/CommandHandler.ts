import type { ChatInputCommandInteraction } from 'discord.js'
import Logger from '../utils/Logger'
import FeedValidator from '../Feed/Validator'
import type { IFeedManager, IStorage } from '../types'
import Utils from '../utils/Utils'

export default class CommandHandler {
  constructor(private storage: IStorage, private feedManager: IFeedManager) {}

  public async handleCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const { commandName } = interaction

    Logger.info('Handling command', {
      commandName,
      userId: interaction.user.id,
      guildId: interaction.guildId,
    })

    switch (commandName) {
      case 'follow':
        await this.handleFollowCommand(interaction)
        break
      case 'remove':
        await this.handleRemoveCommand(interaction)
        break
      case 'rsslist':
        await this.handleRssListCommand(interaction)
        break
      case 'filter':
        await this.handleFilterCommand(interaction)
        break
      case 'unfilter':
        await this.handleUnfilterCommand(interaction)
        break
      case 'filterlist':
        await this.handleFilterListCommand(interaction)
        break
      case 'posthere':
        await this.handlePostHereCommand(interaction)
        break
      case 'schedule':
        await this.handleScheduleCommand(interaction)
        break
      case 'help':
        await this.handleHelpCommand(interaction)
        break
      default:
        await interaction.reply({
          content: 'Unknown command!',
          ephemeral: true,
        })
    }
  }
  private async handleFollowCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const url = interaction.options.getString('url', true)
    const name = interaction.options.getString('name') || 'Unnamed Feed'

    await interaction.deferReply()

    try {
      const validation = await FeedValidator.isValidRSSUrl(url)
      if (!validation.valid) {
        await interaction.editReply(`❌ Invalid RSS feed: ${validation.error}`)
        return
      }

      const feed = await this.feedManager.addFeed(url, name)

      const embed = {
        color: 0x00ff00,
        title: '✅ RSS Feed Added',
        fields: [
          { name: 'Name', value: feed.name, inline: true },
          { name: 'URL', value: feed.url, inline: false },
          { name: 'Feed ID', value: feed.id, inline: true },
        ],
        footer: { text: 'Use /rsslist to see all followed feeds' },
      }

      if (validation.feedInfo) {
        embed.fields.push({
          name: 'Feed Info',
          value: `Title: ${validation.feedInfo.title}\nItems: ${validation.feedInfo.itemCount}`,
          inline: false,
        })
      }

      await interaction.editReply({ embeds: [embed] })
    } catch (error) {
      Logger.error('Error in follow command', { error, url, name })
      await interaction.editReply(
        `❌ Failed to add RSS feed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      )
    }
  }

  private async handleRemoveCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const feedId = interaction.options.getString('feed_id', true)

    await interaction.deferReply()

    try {
      const success = await this.feedManager.removeFeed(feedId)

      if (success) {
        await interaction.editReply({
          embeds: [
            {
              color: 0xff9900,
              title: '🗑️ RSS Feed Removed',
              description: `Feed with ID \`${feedId}\` has been removed.`,
            },
          ],
        })
      } else {
        await interaction.editReply(`❌ Feed with ID \`${feedId}\` not found.`)
      }
    } catch (error) {
      Logger.error('Error in remove command', { error, feedId })
      await interaction.editReply(
        `❌ Failed to remove RSS feed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      )
    }
  }

  private async handleRssListCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    await interaction.deferReply()

    try {
      const feeds = await this.feedManager.getAllFeeds()

      if (feeds.length === 0) {
        await interaction.editReply({
          embeds: [
            {
              color: 0x999999,
              title: '📋 RSS Feeds',
              description:
                'No RSS feeds are currently being followed.\nUse `/follow` to add a feed.',
            },
          ],
        })
        return
      }

      const fields = feeds.map((feed, index) => ({
        name: `${index + 1}. ${feed.name}`,
        value: `**URL:** ${feed.url}\n**ID:** \`${
          feed.id
        }\`\n**Added:** ${feed.addedAt.toLocaleDateString()}`,
        inline: false,
      }))

      // Discord embeds have a limit of 25 fields
      const chunkedFields = Utils.chunkArray(fields, 25)

      for (let i = 0; i < chunkedFields.length; i++) {
        const embed = {
          color: 0x0099ff,
          title: i === 0 ? '📋 RSS Feeds' : `📋 RSS Feeds (Page ${i + 1})`,
          fields: chunkedFields[i],
          footer: { text: `Total feeds: ${feeds.length}` },
        }

        if (i === 0) {
          await interaction.editReply({ embeds: [embed] })
        } else {
          await interaction.followUp({ embeds: [embed] })
        }
      }
    } catch (error) {
      Logger.error('Error in rsslist command', { error })
      await interaction.editReply(
        `❌ Failed to get RSS feeds: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      )
    }
  }

  private async handleFilterCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const keyword = interaction.options.getString('keyword', true)

    await interaction.deferReply()

    try {
      const filter = await this.storage.addFilter({
        keyword,
        isActive: true,
      })

      await interaction.editReply({
        embeds: [
          {
            color: 0x00ff00,
            title: `✅ Filter Added`,
            fields: [
              { name: 'Keyword', value: filter.keyword, inline: true },
              { name: 'Filter ID', value: filter.id, inline: true },
            ],
            footer: { text: 'Use /filterlist to see all filters' },
          },
        ],
      })
    } catch (error) {
      Logger.error('Error in filter command', { error, keyword })
      await interaction.editReply(
        `❌ Failed to add filter: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      )
    }
  }

  private async handleUnfilterCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const filterId = interaction.options.getString('filter_id', true)

    await interaction.deferReply()

    try {
      const success = await this.storage.removeFilter(filterId)

      if (success) {
        await interaction.editReply({
          embeds: [
            {
              color: 0xff9900,
              title: '🗑️ Filter Removed',
              description: `Filter with ID \`${filterId}\` has been removed.`,
            },
          ],
        })
      } else {
        await interaction.editReply(
          `❌ Filter with ID \`${filterId}\` not found.`
        )
      }
    } catch (error) {
      Logger.error('Error in unfilter command', { error, filterId })
      await interaction.editReply(
        `❌ Failed to remove filter: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      )
    }
  }

  private async handleFilterListCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    await interaction.deferReply()

    try {
      const filters = await this.storage.getAllFilters()

      if (filters.length === 0) {
        await interaction.editReply({
          embeds: [
            {
              color: 0x999999,
              title: '🔍 Filters',
              description:
                'No filters are currently active.\nUse `/filter` to add a filter.',
            },
          ],
        })
        return
      }

      const fields = []

      if (filters.length > 0) {
        fields.push({
          name: '🗒️ Keywords',
          value: filters
            .map((f) => `• \`${f.keyword}\` (ID: ${f.id})`)
            .join('\n'),
          inline: false,
        })
      }

      await interaction.editReply({
        embeds: [
          {
            color: 0x0099ff,
            title: '🔍 Active Filters',
            fields,
            footer: { text: `Total filters: ${filters.length}` },
          },
        ],
      })
    } catch (error) {
      Logger.error('Error in filterlist command', { error })
      await interaction.editReply(
        `❌ Failed to get filters: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      )
    }
  }

  private async handlePostHereCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    if (!interaction.guildId) {
      await interaction.reply({
        content: '❌ This command can only be used in a server!',
        ephemeral: true,
      })
      return
    }

    await interaction.deferReply()

    try {
      await this.storage.updateBotConfig({
        guildId: interaction.guildId,
        channelId: interaction.channelId,
      })

      await interaction.editReply({
        embeds: [
          {
            color: 0x00ff00,
            title: '📍 News Channel Set',
            description: `News will now be posted to <#${interaction.channelId}>`,
            footer: { text: 'Use /schedule to set the posting interval' },
          },
        ],
      })
    } catch (error) {
      Logger.error('Error in posthere command', {
        error,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
      })
      await interaction.editReply(
        `❌ Failed to set news channel: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      )
    }
  }

  private async handleScheduleCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const hours = interaction.options.getInteger('hours', true)

    if (hours < 1 || hours > 168) {
      await interaction.reply({
        content: '❌ Hours must be between 1 and 168 (1 week)!',
        ephemeral: true,
      })
      return
    }

    if (!interaction.guildId) {
      await interaction.reply({
        content: '❌ This command can only be used in a server!',
        ephemeral: true,
      })
      return
    }

    await interaction.deferReply()

    try {
      await this.storage.updateBotConfig({
        guildId: interaction.guildId,
        pollIntervalHours: hours,
      })

      await interaction.editReply({
        embeds: [
          {
            color: 0x00ff00,
            title: '⏰ Schedule Updated',
            description: `News will now be posted every **${hours} hour${
              hours === 1 ? '' : 's'
            }**`,
            footer: {
              text: 'The new schedule will take effect on the next polling cycle',
            },
          },
        ],
      })
    } catch (error) {
      Logger.error('Error in schedule command', {
        error,
        guildId: interaction.guildId,
        hours,
      })
      await interaction.editReply(
        `❌ Failed to update schedule: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      )
    }
  }

  private async handleHelpCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const embed = {
      color: 0x0099ff,
      title: '🤖 RSS News Bot - Help',
      description: 'Here are all available commands:',
      fields: [
        {
          name: '📰 Feed Management',
          value:
            '`/follow <url> [name]` - Follow an RSS feed\n' +
            '`/remove <feed_id>` - Remove an RSS feed\n' +
            '`/rsslist` - List all followed feeds',
          inline: false,
        },
        {
          name: '🔍 Filtering',
          value:
            '`/filter <keyword> [type]` - Add a filter (include/exclude)\n' +
            '`/unfilter <filter_id>` - Remove a filter\n' +
            '`/filterlist` - List all active filters',
          inline: false,
        },
        {
          name: '⚙️ Configuration',
          value:
            '`/posthere` - Set current channel for news\n' +
            '`/schedule <hours>` - Set posting interval (1-168 hours)\n' +
            '`/help` - Show this help message',
          inline: false,
        },
      ],
      footer: {
        text: '💡 Tip: Use filters to control which news items are posted. Include filters show only matching items, exclude filters hide matching items.',
      },
    }

    await interaction.reply({ embeds: [embed] })
  }
}
