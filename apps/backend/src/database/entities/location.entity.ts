import { Entity, PrimaryGeneratedColumn, Column, Index, Unique } from 'typeorm';

@Entity('locations')
@Index('idx_locations_region', ['region'])
@Index('idx_locations_district', ['region', 'district'])
@Index('idx_locations_ward', ['region', 'district', 'ward'])
@Unique('uq_locations_region_district_ward', ['region', 'district', 'ward'])
export class Location {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  region: string;

  @Column({ type: 'varchar', length: 150 })
  district: string;

  @Column({ type: 'varchar', length: 150 })
  ward: string;
}
