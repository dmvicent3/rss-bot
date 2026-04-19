import { generateText } from 'ai'
import Logger from '../utils/Logger'
import { createOpenAI } from '@ai-sdk/openai'

const openrouter = createOpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
})

export default class AiOpenRouter {
  private model: string

  constructor(model: string = 'openrouter/free') {
    this.model = model
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
        model: openrouter(this.model),
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
