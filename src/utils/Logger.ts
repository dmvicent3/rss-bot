export default class Logger {
  private static formatMessage(
    level: string,
    message: string,
    meta?: any
  ): string {
    const timestamp = new Date().toISOString()
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : ''
    return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}`
  }

  static info(message: string, meta?: any): void {
    console.log(this.formatMessage('info', message, meta))
  }

  static error(message: string, meta?: any): void {
   console.error(this.formatMessage('error', message, meta))
  }

  static warn(message: string, meta?: any): void {
    console.warn(this.formatMessage('warn', message, meta))
  }
}
