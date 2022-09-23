import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { AppoinmentDto } from './dto/appoinment.dto';
import { UserAppoinmentService } from './user-appoinment.service';

@Controller('user-appoinment')
export class UserAppoinmentController {
  constructor(private userAppoinmentService: UserAppoinmentService) {}

  @Post()
  async createUserAppoinement(@Body() appoinment: AppoinmentDto) {
    return this.userAppoinmentService.createUserAppoinement(appoinment);
  }

  @Get('scheduled/event-id/:id')
  async getAllScheduleEventsForEvent(
    @Param('id', ParseIntPipe) eventId: number,
  ) {
    return this.userAppoinmentService.getAllScheduleEventsForEvent(eventId);
  }

  @Get('available-slot/event-id/:id')
  async getAllAvailableSlotsForEvents(
    @Param('id', ParseIntPipe) eventId: number,
  ) {
    return this.userAppoinmentService.getAllAvailableSlotsForEvents(eventId);
  }
}
