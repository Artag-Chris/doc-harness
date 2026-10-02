import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/global-exception.filter';
import { JsonLogger } from './common/json-logger.service';
import { env } from './config/env';
import { features } from './config/features';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const logger = app.get(JsonLogger);
  app.useLogger(logger);

  app.useGlobalFilters(new GlobalExceptionFilter(logger));

  app.setGlobalPrefix('api');
  if (env.TRUST_PROXY > 0) app.set('trust proxy', env.TRUST_PROXY);

  // Sin esto, `docker compose down` (SIGTERM) mata el proceso sin correr los
  // `onModuleDestroy`: el pool de Prisma y los workers de BullMQ quedan a medias.
  app.enableShutdownHooks();

  // El dashboard corre en otro origen (Vercel/3001) y llama con el Bearer de atiende.
  const corsOrigins = env.corsAllowedOrigins;
  const allowAnyOrigin = corsOrigins.includes('*');
  app.enableCors({
    origin: allowAnyOrigin ? true : corsOrigins,
    credentials: !allowAnyOrigin,
  });
  if (allowAnyOrigin && env.NODE_ENV === 'production') {
    logger.warn(
      {
        msg: 'CORS_ALLOWED_ORIGINS="*": cualquier origen puede llamar a la API.',
        fix: 'En el server poné el dominio del dashboard (ej. https://tu-dashboard.vercel.app).',
      },
      'Bootstrap',
    );
  }

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  const config = new DocumentBuilder()
    .setTitle('Doc Harness API')
    .setDescription(
      'Sube un documento, la IA lo reescribe/anonimiza/convierte y se descarga en Word, PDF o Excel.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config), {
    jsonDocumentUrl: 'api/docs-json',
  });

  if (env.JWT_SECRET === 'dev-secret-change-me') {
    logger.warn(
      {
        msg: 'JWT_SECRET está en el valor por defecto: el dashboard de atiende dará 401 en la pestaña Documentos.',
        fix: 'Copiá el JWT_SECRET real de atiende en doc-harness/.env y recreá el contenedor api.',
      },
      'Bootstrap',
    );
  }

  if (env.llmMode === 'mock') {
    logger.warn(
      {
        msg: 'IA en modo mock: el flujo corre determinístico, sin llaves ni red.',
        provider: features.llm.provider,
        fix: 'Poné DEEPSEEK_API_KEY en el .env para generación real.',
      },
      'Bootstrap',
    );
  } else {
    logger.log(
      {
        msg: 'Proveedor de IA resuelto',
        provider: features.llm.provider,
        fallback: features.llm.fallback,
        model: features.llm.model,
      },
      'Bootstrap',
    );
  }

  await app.listen(env.PORT);
  logger.log(
    {
      msg: 'doc-harness api escuchando',
      port: env.PORT,
      storage: features.storage.driver,
      storageDir: features.storage.dir,
      maxUploadMb: env.MAX_UPLOAD_MB,
      docs: '/api/docs',
    },
    'Bootstrap',
  );
}

void bootstrap().catch((err: unknown) => {
  process.stderr.write(`FATAL: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
