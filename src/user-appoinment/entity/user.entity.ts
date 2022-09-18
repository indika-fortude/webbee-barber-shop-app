import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Gender } from '../../barber-shop/enum/gender.enum';
import { AppoinmentEntity } from './appoinment.entity';

@Entity({ name: 'user' })
export class UserEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  @Column({ name: 'first_name' })
  firstName: string;

  @Column({ name: 'last_name' })
  lastNname: string;

  @Column({ type: 'enum', enum: Gender })
  gender: Gender;

  @OneToMany(() => AppoinmentEntity, (appoinment) => appoinment.user)
  appoinments: AppoinmentEntity[];

  @CreateDateColumn({ name: 'created_date' })
  createdDate: Date;

  @UpdateDateColumn({ name: 'updated_date' })
  updatedDate: Date;
}
