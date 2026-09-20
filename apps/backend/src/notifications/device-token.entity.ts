import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('device_tokens')
export class DeviceToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  borrowerId: string;

  @Column({ unique: true })
  token: string;

  @Column({ default: 'android' })
  platform: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
