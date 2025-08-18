import type { IStorage } from '../types/index.js'
import Environment from '../utils/Environment'
import Logger from '../utils/Logger.js'
import DBStorage from './Storage.js'

export default class DBClient {
  private static instance: IStorage | null = null

  static getInstance(): IStorage {
    if (!this.instance) {
      this.instance = new DBStorage(Environment.DATABASE_PATH)
    }
    return this.instance
  }

  static async initialize(): Promise<void> {
    Logger.info('Initializing database...')
    const instance = this.getInstance()
    if (instance instanceof DBStorage) {
      await instance.initialize()
      return
    }
    throw new Error('Failted to initialize DBClient')
  }

  static async closeInstance(): Promise<void> {
    if (this.instance && 'close' in this.instance) {
      ;(this.instance as DBStorage).close()
      this.instance = null
    }
  }
}
