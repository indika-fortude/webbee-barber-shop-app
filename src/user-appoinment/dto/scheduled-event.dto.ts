import { Gender } from '../../barber-shop/enum/gender.enum';

export class ScheduledEventsDto {
  firstName: string;
  lastName: string;
  startTime: Date;
  endTime: Date;
  eventType: string;
  gender: Gender;
  maximumPeopleCanBookEvent: number;
  availableQuantity: number;
}
