import { Body, Controller, Get, Post } from '@nestjs/common';
import { BarberShopService } from './barber-shop.service';
import { EventTypeDto } from './dto/event-type.dto';

@Controller('barber-shop')
export class BarberShopController {
  constructor(private barberShopService: BarberShopService) {}

  @Get('event-type')
  async getAllEventType() {
    return this.barberShopService.getAllEventTypes();
  }

  @Post('event-type')
  async createEventType(@Body() eventType: EventTypeDto) {
    return this.barberShopService.createEventType(eventType);
  }
}
