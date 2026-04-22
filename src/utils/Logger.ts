export default class Logger {
  private static formatMessage(
    level: string,
    message: string,
    meta?: any
  ): string {
    const timestamp = new Date().toISOString()
    let metaStr = ''
    
    if (meta) {
      if (meta.error instanceof Error) {
        metaStr = ` ${meta.error.message}\nStack: ${meta.error.stack}`
      } else if (meta.reason instanceof Error) {
        metaStr = ` ${meta.reason.message}\nStack: ${meta.reason.stack}`
      } else if (typeof meta === 'object') {
        metaStr = ` ${JSON.stringify(meta, null, 2)}`
      } else {
        metaStr = ` ${String(meta)}`
      }
    }
    
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
