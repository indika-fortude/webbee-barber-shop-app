import { Type } from 'class-transformer';
import { IsDate, IsNotEmpty, ValidateNested } from 'class-validator';
import { EventTypeDto } from './event-type.dto';
import { UserDto } from './user.dto';

export class AppoinmentDto {
  @Type(() => Date)
  @IsDate()
  startTime: Date;

  @Type(() => Date)
  @IsDate()
  endTime: Date;

  @IsNotEmpty()
  @Type(() => UserDto)
  @ValidateNested()
  user: UserDto;

  @IsNotEmpty()
  @Type(() => EventTypeDto)
  @ValidateNested()
  eventType: EventTypeDto;
}
