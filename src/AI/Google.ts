import { GoogleGenAI } from '@google/genai'
import Logger from '../utils/Logger'

export default class AiGoogle {
  private genAI: GoogleGenAI
  private model: string

  constructor(apiKey: string, model: string = 'gemini-2.5-flash') {
    this.model = model
    this.genAI = new GoogleGenAI({ apiKey })
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

      const result = await this.genAI.models.generateContent({
        model: this.model,
        contents: prompt,
      })

      Logger.info('Prompt successful')

      return result.text ?? null
    } catch (error) {
      Logger.error('Prompt failed', error)
      return null
    }
  }
}
