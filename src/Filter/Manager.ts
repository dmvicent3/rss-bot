import AiGoogle from '../AI/Google'
import type { FeedItem, Filter, FilterResult, IStorage } from '../types'
import Logger from '../utils/Logger'

export default class FilterManager {
  constructor(private storage: IStorage, private genAi: AiGoogle) {}

  async addFilter(keyword: string): Promise<Filter> {
    try {
      const filter = await this.storage.addFilter({
        keyword: keyword.toLowerCase().trim(),
        isActive: true,
      })

      Logger.info('Filter added successfully', {
        filterId: filter.id,
        keyword: filter.keyword,
      })

      return filter
    } catch (error) {
      Logger.error('Failed to add filter', { error, keyword })
      throw error
    }
  }

  async removeFilter(filterId: string): Promise<boolean> {
    try {
      const success = await this.storage.removeFilter(filterId)
      if (success) {
        Logger.info('Filter removed successfully', { filterId })
      } else {
        Logger.warn('Filter not found for removal', { filterId })
      }
      return success
    } catch (error) {
      Logger.error('Failed to remove filter', { error, filterId })
      throw error
    }
  }

  async getAllFilters(): Promise<Filter[]> {
    try {
      return await this.storage.getAllFilters()
    } catch (error) {
      Logger.error('Failed to get all filters', { error })
      throw error
    }
  }

  async stageAFilter(item: FeedItem): Promise<FilterResult> {
    try {
      const filters = await this.getAllFilters()
      const content = `${item.title} ${item.description}`.toLowerCase()

      for (const filter of filters) {
        if (content.includes(filter.keyword)) {
          Logger.info('Item rejected by exclude filter', {
            itemTitle: item.title,
            filterKeyword: filter.keyword,
          })
          return {
            shouldPost: false,
            reason: `Excluded by keyword filter: "${filter.keyword}"`,
          }
        }
      }

      Logger.info('Item passed Stage A filtering', { itemTitle: item.title })
      return {
        shouldPost: true,
        reason: 'Passed Stage A filtering',
      }
    } catch (error) {
      Logger.error('Error in Stage A filtering', {
        error,
        itemTitle: item.title,
      })

      return {
        shouldPost: true,
        reason: 'Stage A filtering error - defaulting to allow',
        confidence: 0,
      }
    }
  }

  async stageBFilter(item: FeedItem): Promise<FilterResult> {
    try {
      const filters = await this.getAllFilters()

      const keywords = filters.map((f) => f.keyword)

      const prompt = this.buildAIFilterPrompt(item, keywords)

      Logger.info('Sending item to AI for filtering', {
        itemTitle: item.title,
        keywords: keywords.length,
      })

      const result = await this.genAi.prompt(prompt)

      if (!result) {
        Logger.warn('AI returned no response, defaulting to allow', {
          itemTitle: item.title,
        })
        return {
          shouldPost: true,
          reason: 'AI returned no response - defaulting to allow',
          confidence: 0,
        }
      }

      const aiResult = this.parseAIResponse(result)

      Logger.info('AI filtering completed', {
        itemTitle: item.title,
        shouldPost: aiResult.shouldPost,
        confidence: aiResult.confidence,
        reason: aiResult.reason,
        category: aiResult.category,
      })

      return aiResult
    } catch (error) {
      Logger.error('Error in Stage B AI filtering', {
        error,
        itemTitle: item.title,
      })

      return {
        shouldPost: true,
        reason: 'AI filtering error - defaulting to allow',
        confidence: 0,
      }
    }
  }

  async shouldPostItem(item: FeedItem): Promise<FilterResult> {
    try {
      Logger.info('Starting filtering pipeline', { itemTitle: item.title })

      const stageAResult = await this.stageAFilter(item)

      if (!stageAResult.shouldPost) {
        Logger.info('Item rejected in Stage A', {
          itemTitle: item.title,
          reason: stageAResult.reason,
        })
        return stageAResult
      }

      const stageBResult = await this.stageBFilter(item)

      Logger.info('Filtering pipeline completed', {
        itemTitle: item.title,
        finalDecision: stageBResult.shouldPost,
        stageAReason: stageAResult.reason,
        stageBReason: stageBResult.reason,
        confidence: stageBResult.confidence,
      })

      return stageBResult
    } catch (error) {
      Logger.error('Error in filtering pipeline', {
        error,
        itemTitle: item.title,
      })
      return {
        shouldPost: true,
        reason: 'Filtering pipeline error - defaulting to allow',
        confidence: 0,
      }
    }
  }

  private buildAIFilterPrompt(item: FeedItem, keywords: string[]): string {
    const keywordsSection =
      keywords.length > 0
        ? `Keywords: ${keywords.join(', ')}`
        : 'No specific keywords defined.'
    return `
You are a news content filter. Analyze the following news article and decide if it should be posted.

FILTERING CRITERIA:
${keywordsSection}

NEWS ARTICLE:
Title: ${item.title}
Description: ${item.description}

INSTRUCTIONS:
1. If there are keywords, the article must NOT be semantically related to any of them.
2. By default, reject these themes/keywords: sports, religion, celebrities, advertisements for a product or brand, clickbait, news that do not concern/affect Europe.
3. Consider context, synonyms, and semantic meaning, not just exact keyword matches.
4. Be reasonably strict but not overly restrictive.
5. Respond ONLY in valid JSON format.

RESPONSE FORMAT (must be valid JSON):
{
  "decision": true | false,
  "confidence": number, [0-100]
  "reason": string, [Explanation of your decision, use as few words as possible]
  "category": string [Technology, Science, Politics, etc. (only pick 1)]
}

example:
{
    decision: false,
    confidence: 92,
    reason: "Matched keyword 'sports'",
    category: "Sports"
}

`.trim()
  }

  private parseAIResponse(response: string): FilterResult {
    try {
      const parsed = JSON.parse(
        response
          .trim()
          .replace(/^```json/i, '') // strip leading ```json
          .replace(/^```/, '') // strip leading ```
          .replace(/```$/, '') // strip trailing ```
          .trim()
      )

      const decision =
        typeof parsed.decision === 'boolean' ? parsed.decision : false

      const confidence =
        typeof parsed.confidence === 'number' &&
        parsed.confidence >= 0 &&
        parsed.confidence <= 100
          ? parsed.confidence
          : 50

      const reason =
        typeof parsed.reason === 'string' && parsed.reason.trim().length > 0
          ? parsed.reason.trim()
          : 'AI analysis completed'

      const category =
        typeof parsed.category === 'string' && parsed.category.trim().length > 0
          ? parsed.category.trim()
          : 'Unknown'

      const shouldPost = decision

      return {
        shouldPost,
        reason: `AI: ${reason}`,
        confidence,
        category,
      }
    } catch (error) {
      Logger.error('Failed to parse AI response', { error, response })
      return {
        shouldPost: true,
        reason: 'AI response parsing error - defaulting to allow',
        confidence: 0,
        category: 'Unknown',
      }
    }
  }
}
