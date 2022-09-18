import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';

@Entity({ name: 'global_config' })
export class GlobalConfigEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'max_parallel_clients' })
  maxParallelClients: number;

  @Column({ name: 'slot_length_in_munute' })
  slotLengthInMunute: number;

  @Column({ name: 'break_between_appoinment_in_minute' })
  breakBetweenAppoinmentInMinute: number;

  @Column({ name: 'maximum_oppinment_dates' })
  maximumOppinmentDates: number;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ name: 'created_date' })
  createdDate: Date;

  @UpdateDateColumn({ name: 'updated_date' })
  updatedDate: Date;
}
