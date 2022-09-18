import { Module } from '@nestjs/common';
import { BarberShopService } from './barber-shop.service';
import { BarberShopController } from './barber-shop.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventTypeEntity } from './entity/event-type.entity';
import CacheService from 'src/barber-shop-config/cache.service';

@Module({
  imports: [TypeOrmModule.forFeature([EventTypeEntity])],
  providers: [BarberShopService, CacheService],
  controllers: [BarberShopController],
})
export class BarberShopModule {}
