import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import CacheService from '../barber-shop-config/cache.service';
import { GlobalConfigEntity } from '../barber-shop-config/entity/global-config.entity';
import { UnavailableTimesEntity } from '../barber-shop-config/entity/unavailable-times.entity';
import { EventTypeEntity } from '../barber-shop/entity/event-type.entity';
import { AppoinmentEntity } from './entity/appoinment.entity';
import { UserEntity } from './entity/user.entity';
import { UserAppoinmentController } from './user-appoinment.controller';
import { UserAppoinmentService } from './user-appoinment.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      EventTypeEntity,
      AppoinmentEntity,
      GlobalConfigEntity,
      UnavailableTimesEntity,
    ]),
  ],
  controllers: [UserAppoinmentController],
  providers: [UserAppoinmentService, CacheService],
})
export class UserAppoinmentModule {}
