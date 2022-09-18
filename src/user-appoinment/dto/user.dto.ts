import { IsEmail, IsEnum, IsNotEmpty, IsOptional } from 'class-validator';
import { Gender } from 'src/barber-shop/enum/gender.enum';

export class UserDto {
  @IsOptional()
  id?: number;

  @IsEmail()
  email: string;

  @IsNotEmpty()
  firstName: string;

  @IsNotEmpty()
  lastNname: string;

  @IsEnum(Gender)
  gender: Gender;
}
