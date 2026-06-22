import { Controller, Get, ServiceUnavailableException } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'

@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  async getHealth(): Promise<{ status: string; api: string; database: string }> {
    try {
      await this.database.$queryRaw`SELECT 1`

      return {
        status: 'ok',
        api: 'running',
        database: 'connected',
      }
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        api: 'running',
        database: 'unavailable',
      })
    }
  }
}
