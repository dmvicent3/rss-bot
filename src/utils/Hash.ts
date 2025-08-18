import { createHash } from 'crypto'

export class Hash {
  static createContentHash(title: string, link: string): string {
    return createHash('sha256')
      .update(`${title}|${link}`)
      .digest('hex')
      .substring(0, 16)
  }

  static generateId(): string {
    return createHash('sha256')
      .update(`${Date.now()}-${Math.random()}`)
      .digest('hex')
      .substring(0, 12)
  }
}
