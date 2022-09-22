import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventTypeEntity } from '../barber-shop/entity/event-type.entity';
import { BarberShopConfigController } from './barber-shop-config.controller';
import { BarberShopConfigService } from './barber-shop-config.service';
import CacheService from './cache.service';
import { EventConfigEntity } from './entity/event-config.entity';
import { UnavailableTimesEntity } from './entity/unavailable-times.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EventConfigEntity,
      UnavailableTimesEntity,
      EventTypeEntity,
    ]),
  ],
  providers: [CacheService, BarberShopConfigService],
  controllers: [BarberShopConfigController],
})
export class BarberShopConfigModule {}
