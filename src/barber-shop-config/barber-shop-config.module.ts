import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BarberShopConfigController } from './barber-shop-config.controller';
import { BarberShopConfigService } from './barber-shop-config.service';
import CacheService from './cache.service';
import { GlobalConfigEntity } from './entity/global-config.entity';
import { UnavailableTimesEntity } from './entity/unavailable-times.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([GlobalConfigEntity, UnavailableTimesEntity]),
  ],
  providers: [CacheService, BarberShopConfigService],
  controllers: [BarberShopConfigController],
})
export class BarberShopConfigModule {}
