import Logger from '../utils/Logger'
import AiOpenRouter from './OpenRouter'
import AiGemini from './Gemini'
import Environment from '../utils/Environment'

export default class AiFallback {
  private primary: AiOpenRouter
  private fallback: AiGemini

  constructor() {
    this.primary = new AiOpenRouter()
    this.fallback = new AiGemini(
      Environment.GOOGLE_GENERATIVE_AI_API_KEY,
      'gemma-4-31b-it',
    )
  }

  async healthcheck() {
    Logger.info('Running AI healthchecks...')

    try {
      await this.primary.healthcheck()
      Logger.info('Primary model (OpenRouter) is available')
      return true
    } catch (error) {
      Logger.info('Primary model (OpenRouter) unavailable, testing fallback...')

      try {
        await this.fallback.healthcheck()
        Logger.info('Fallback model (Gemini) is available')
        return true
      } catch (fallbackError) {
        Logger.warn(
          'Both models unavailable during healthcheck - will attempt at runtime',
        )
        return false
      }
    }
  }

  async prompt(prompt: string) {
    // Always try primary (OpenRouter) first
    try {
      Logger.info('Prompting primary model (OpenRouter)...')
      const result = await this.primary.prompt(prompt)

      if (result !== null) {
        return result
      }

      Logger.warn('Primary model returned null, attempting fallback')
    } catch (error) {
      Logger.warn('Primary model failed, attempting fallback')
    }

    // Fall back to Gemini if primary fails
    try {
      Logger.info('Prompting fallback model (Gemini)...')
      const result = await this.fallback.prompt(prompt)
      return result
    } catch (error) {
      Logger.error('Fallback model failed:', error)
      return null
    }
  }

  getCurrentModel(): string {
    return 'OpenRouter (primary) / Gemini (fallback)'
  }
}
