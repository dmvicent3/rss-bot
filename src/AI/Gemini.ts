import { generateText } from 'ai'
import { google } from '@ai-sdk/google'
import Logger from '../utils/Logger'

export default class AiGemini {
  private model: string
  private googleModel: any

  constructor(apiKey: string, model: string = 'gemma-4-31b-it') {
    this.model = model
    this.googleModel = google(model)
  }

  async healthcheck() {
    Logger.info(`Healthchecking ${this.model}...`)

    const result = await this.prompt('ping')

    if (result) {
      Logger.info(`${this.model} passed healthcheck!`)
      return true
    } else {
      Logger.error(`${this.model} healthcheck failed!`)
      throw new Error(`${this.model} healthcheck failed`)
    }
  }

  async prompt(prompt: string) {
    try {
      Logger.info(`Prompting ${this.model}...`)

      const { text } = await generateText({
        model: this.googleModel,
        prompt,
      })

      Logger.info('Prompt successful')

      return text ?? null
    } catch (error) {
      Logger.error('Prompt failed', error)
      return null
    }
  }
}
