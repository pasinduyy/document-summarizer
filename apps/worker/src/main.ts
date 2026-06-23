import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule)
  app.enableShutdownHooks()

  Logger.log('Worker context initialized, waiting for document processing jobs', 'Bootstrap')
}

void bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  Logger.error(
    `Worker startup failed: ${message}`,
    error instanceof Error ? error.stack : undefined,
    'Bootstrap',
  )
  process.exitCode = 1
})
