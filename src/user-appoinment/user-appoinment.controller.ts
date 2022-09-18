import { Body, Controller, Get, Post } from '@nestjs/common';
import { AppoinmentDto } from './dto/appoinment.dto';
import { UserAppoinmentService } from './user-appoinment.service';

@Controller('user-appoinment')
export class UserAppoinmentController {
  constructor(private userAppoinmentService: UserAppoinmentService) {}

  @Post()
  async createUserAppoinement(@Body() appoinment: AppoinmentDto) {
    return this.userAppoinmentService.createUserAppoinement(appoinment);
  }

  @Get('scheduled')
  async getAllScheduleEvents() {
    return this.userAppoinmentService.getAllScheduleEvents();
  }
}
