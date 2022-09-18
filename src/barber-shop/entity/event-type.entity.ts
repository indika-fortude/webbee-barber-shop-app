import { Min } from 'class-validator';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Gender } from '../enum/gender.enum';

@Entity({ name: 'event_type' })
export class EventTypeEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'event_type' })
  eventType: string;

  @Column({ name: 'time_taken_in_minute' })
  timeTakenInMinute: number;

  @Column({ name: 'gender', type: 'enum', enum: Gender })
  gender: Gender;

  @CreateDateColumn({ name: 'created_date' })
  createdDate: Date;

  @UpdateDateColumn({ name: 'updated_date' })
  updatedDate: Date;
}
