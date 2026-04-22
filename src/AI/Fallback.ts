import Logger from '../utils/Logger'
import AiOpenRouter from './OpenRouter'
import AiGemini from './Gemini'
import Environment from '../utils/Environment'

export default class AiFallback {
  private primary: AiOpenRouter
  private fallback: AiGemini
  private useFallback: boolean = false

  constructor() {
    this.primary = new AiOpenRouter()
    this.fallback = new AiGemini(Environment.GEMINI_API_KEY, 'gemma-4-31b-it')
  }

  async healthcheck() {
    Logger.info('Running AI healthchecks...')

    try {
      await this.primary.healthcheck()
      this.useFallback = false
      Logger.info('Primary model (OpenRouter) is available')
      return true
    } catch (error) {
      Logger.warn('Primary model (OpenRouter) failed, switching to fallback')

      try {
        await this.fallback.healthcheck()
        this.useFallback = true
        Logger.info('Fallback model (Gemini) is available')
        return true
      } catch (fallbackError) {
        Logger.error('Both primary and fallback models failed!')
        throw new Error('All AI models failed healthcheck')
      }
    }
  }

  async prompt(prompt: string) {
    const activeModel = this.useFallback
      ? 'fallback (Gemini)'
      : 'primary (OpenRouter)'

    try {
      Logger.info(`Using ${activeModel} model`)

      if (this.useFallback) {
        return await this.fallback.prompt(prompt)
      } else {
        const result = await this.primary.prompt(prompt)

        if (result === null) {
          Logger.warn('Primary model failed, attempting fallback')
          this.useFallback = true
          return await this.fallback.prompt(prompt)
        }

        return result
      }
    } catch (error) {
      Logger.error(`${activeModel} model error:`, error)
      return null
    }
  }

  isUsingFallback(): boolean {
    return this.useFallback
  }

  getCurrentModel(): string {
    return this.useFallback ? 'Gemini' : 'OpenRouter'
  }
}
