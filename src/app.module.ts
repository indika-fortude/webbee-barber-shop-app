import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppConfigModule } from './config/config.module';
import { BarberShopConfigModule } from './barber-shop-config/barber-shop-config.module';
import { UserAppoinmentModule } from './user-appoinment/user-appoinment.module';
import { BarberShopModule } from './barber-shop/barber-shop.module';

@Module({
  imports: [
    AppConfigModule,
    BarberShopConfigModule,
    UserAppoinmentModule,
    UserAppoinmentModule,
    BarberShopModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
