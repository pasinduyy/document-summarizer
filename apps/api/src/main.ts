import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { AppModule } from './app.module'
import { AppConfigService } from './configuration/app-config.service'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  app.enableShutdownHooks()

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Document Summarizer API')
    .setVersion('0.1.0')
    .build()
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig)
  SwaggerModule.setup('api', app, swaggerDocument)

  const config = app.get(AppConfigService)
  await app.listen(config.apiPort)
}

void bootstrap()
