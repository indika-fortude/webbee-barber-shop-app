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
import { GlobalConfigDto } from './dto/global-config.dto';
import { UnavaialbleTimesDto } from './dto/unavailable-time.dto';

@Controller('barber-shop-config')
export class BarberShopConfigController {
  constructor(private barberShopConfigService: BarberShopConfigService) {}

  @Get()
  async getLatesConfiguration() {
    return this.barberShopConfigService.getLatestConfig();
  }

  @Post()
  async createNewConfig(@Body() configBody: GlobalConfigDto) {
    return this.barberShopConfigService.updateNewConfig(configBody);
  }

  @Get('unavalable-time')
  async getAllUnavailableDates() {
    return this.barberShopConfigService.getAllUnavailableTimes();
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
