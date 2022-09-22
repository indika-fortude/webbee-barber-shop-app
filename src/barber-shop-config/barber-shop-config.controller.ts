import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
} from '@nestjs/common';
import { BarberShopConfigService } from './barber-shop-config.service';
import { EventConfigDto } from './dto/event-config.dto';
import { UnavaialbleTimesDto } from './dto/unavailable-time.dto';

@Controller('barber-shop-config')
export class BarberShopConfigController {
  constructor(private barberShopConfigService: BarberShopConfigService) {}

  @Get('event-type/:id')
  async getLatesConfiguration(@Param('id', ParseIntPipe) eventId: number) {
    return this.barberShopConfigService.getLatestConfig(eventId);
  }

  @Post()
  async createNewConfig(@Body() configBody: EventConfigDto) {
    return this.barberShopConfigService.updateNewEventConfig(configBody);
  }

  @Get('unavalable-time/event-type/:eventId')
  async getAllUnavailableDates(
    @Param('eventId', ParseIntPipe) eventId: number,
  ) {
    return this.barberShopConfigService.getAllUnavailableTimes(eventId);
  }

  @Post('unavalable-time')
  async createnewUnavailableDates(
    @Body() unavailableTime: UnavaialbleTimesDto,
  ) {
    return this.barberShopConfigService.createUnavailableTimes(unavailableTime);
  }

  @Put('unavalable-time/:id')
  async updateUnavailableDates(
    @Param('id', ParseIntPipe) id: number,
    @Body() unavailableTime: UnavaialbleTimesDto,
  ) {
    return this.barberShopConfigService.updateUnavailableTimes(
      id,
      unavailableTime,
    );
  }

  @Delete('unavalable-time/:id')
  async deleteUnavailableDates(@Param('id', ParseIntPipe) id: number) {
    return this.barberShopConfigService.deleteUnavailableTimes(id);
  }
}
