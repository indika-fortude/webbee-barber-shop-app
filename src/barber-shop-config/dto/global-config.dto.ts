import { Min } from 'class-validator';

export class GlobalConfigDto {
  @Min(1)
  maxParallelClients: number;
  @Min(1)
  slotLengthInMunute: number;
  @Min(1)
  breakBetweenAppoinmentInMinute: number;
  @Min(1)
  maximumOppinmentDates: number;
}
