import { SlashCommandBuilder, REST, Routes } from 'discord.js'
import Logger from '../utils/Logger'
import Environment from '../utils/Environment'

export default class DiscordCommands {
  private static getCommands() {
    return [
      new SlashCommandBuilder()
        .setName('follow')
        .setDescription('Follow an RSS feed')
        .addStringOption((option) =>
          option.setName('url').setDescription('RSS feed URL').setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('name')
            .setDescription('Custom name for the feed')
            .setRequired(false)
        ),

      new SlashCommandBuilder()
        .setName('remove')
        .setDescription('Remove an RSS feed')
        .addStringOption((option) =>
          option
            .setName('feed_id')
            .setDescription('Feed ID to remove')
            .setRequired(true)
        ),

      new SlashCommandBuilder()
        .setName('rsslist')
        .setDescription('List all followed RSS feeds'),

      new SlashCommandBuilder()
        .setName('filter')
        .setDescription('Add a keyword filter')
        .addStringOption((option) =>
          option
            .setName('keyword')
            .setDescription('Keyword to filter')
            .setRequired(true)
        ),

      new SlashCommandBuilder()
        .setName('unfilter')
        .setDescription('Remove a keyword filter')
        .addStringOption((option) =>
          option
            .setName('filter_id')
            .setDescription('Filter ID to remove')
            .setRequired(true)
        ),

      new SlashCommandBuilder()
        .setName('filterlist')
        .setDescription('List all active filters'),

      new SlashCommandBuilder()
        .setName('posthere')
        .setDescription('Set current channel as the news posting channel'),

      new SlashCommandBuilder()
        .setName('schedule')
        .setDescription('Set the news posting interval')
        .addIntegerOption((option) =>
          option
            .setName('hours')
            .setDescription('Hours between news posts (1-168)')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(168)
        ),

      new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show help information'),
    ]
  }

  static async deployCommands() {
    try {
      Logger.info('Started refreshing application (/) commands.')

      const rest = new REST().setToken(Environment.DISCORD_TOKEN)

      const commandData = this.getCommands().map((command) => command.toJSON())

      await rest.put(
        Routes.applicationCommands(Environment.DISCORD_CLIENT_ID),
        {
          body: commandData,
        }
      )

      Logger.info(
        `Successfully reloaded ${commandData.length} application (/) commands.`
      )
    } catch (error) {
      Logger.error('Error deploying commands', { error })
      process.exit(1)
    }
  }
}
