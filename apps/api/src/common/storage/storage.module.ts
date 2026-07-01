import { Global, Module } from '@nestjs/common';
import { STORAGE_CONFIG, STORAGE_PROVIDER } from './storage.types';
import { loadStorageConfigFromEnv } from './storage.config';
import { S3CompatibleProvider } from './s3-compatible.provider';

/**
 * Глобальный storage-модуль. Провайдит:
 *  - STORAGE_CONFIG — из ENV (фабрика читает структуру, к S3 не подключается → бут безопасен);
 *  - STORAGE_PROVIDER — S3CompatibleProvider (ленивый клиент). Файловый модуль инжектит ТОЛЬКО
 *    STORAGE_PROVIDER, к AWS-клиенту напрямую не обращается.
 * Смена источника конфига (ENV → таблица storage_config) = замена одной фабрики, провайдер не меняется.
 */
@Global()
@Module({
  providers: [
    { provide: STORAGE_CONFIG, useFactory: loadStorageConfigFromEnv },
    { provide: STORAGE_PROVIDER, useClass: S3CompatibleProvider },
  ],
  exports: [STORAGE_PROVIDER, STORAGE_CONFIG],
})
export class StorageModule {}
