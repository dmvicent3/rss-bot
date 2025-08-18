export default class Environment {
  static get DISCORD_TOKEN(): string {
    const token = process.env.DISCORD_TOKEN
    if (!token) {
      throw new Error('DISCORD_TOKEN environment variable is required')
    }
    return token
  }

  static get DISCORD_CLIENT_ID(): string {
    const clientId = process.env.DISCORD_CLIENT_ID
    if (!clientId) {
      throw new Error('DISCORD_CLIENT_ID environment variable is required')
    }
    return clientId
  }

  static get GEMINI_API_KEY(): string {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is required')
    }
    return apiKey
  }

  static get DATABASE_PATH(): string {
    return process.env.DATABASE_PATH || './data/bot.db'
  }
}
