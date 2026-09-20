import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Location } from '../database/entities/location.entity.js';

@Injectable()
export class LocationsService {
  private cachedHierarchy: Record<string, Record<string, string[]>> | null = null;
  private cachedRegions: string[] | null = null;

  constructor(
    @InjectRepository(Location)
    private readonly locationRepo: Repository<Location>,
  ) {}

  async getRegions(): Promise<string[]> {
    if (this.cachedRegions) return this.cachedRegions;
    const rows = await this.locationRepo
      .createQueryBuilder('loc')
      .select('DISTINCT loc.region', 'region')
      .orderBy('loc.region', 'ASC')
      .getRawMany<{ region: string }>();

    const regions = rows.map((r) => r.region).filter(Boolean);
    if (regions.length > 0) this.cachedRegions = regions;
    return regions;
  }

  async getDistricts(region: string): Promise<string[]> {
    const trimmed = region.trim();
    if (!trimmed) return [];

    if (this.cachedHierarchy && this.cachedHierarchy[trimmed]) {
      return Object.keys(this.cachedHierarchy[trimmed]).sort();
    }

    const rows = await this.locationRepo
      .createQueryBuilder('loc')
      .select('DISTINCT loc.district', 'district')
      .where('LOWER(loc.region) = LOWER(:region)', { region: trimmed })
      .orderBy('loc.district', 'ASC')
      .getRawMany<{ district: string }>();

    return rows.map((r) => r.district).filter(Boolean);
  }

  async getWards(region?: string, district?: string): Promise<string[]> {
    const d = district?.trim();
    if (!d) return [];

    const r = region?.trim();
    if (r && this.cachedHierarchy && this.cachedHierarchy[r]?.[d]) {
      return this.cachedHierarchy[r][d];
    }

    const qb = this.locationRepo
      .createQueryBuilder('loc')
      .select('loc.ward', 'ward')
      .where('LOWER(loc.district) = LOWER(:district)', { district: d });

    if (r) {
      qb.andWhere('LOWER(loc.region) = LOWER(:region)', { region: r });
    }

    const rows = await qb.orderBy('loc.ward', 'ASC').getRawMany<{ ward: string }>();
    return rows.map((row) => row.ward).filter(Boolean);
  }

  async getHierarchy(): Promise<Record<string, Record<string, string[]>>> {
    if (this.cachedHierarchy) return this.cachedHierarchy;

    const all = await this.locationRepo.find({
      select: ['region', 'district', 'ward'],
      order: { region: 'ASC', district: 'ASC', ward: 'ASC' },
    });

    const hierarchy: Record<string, Record<string, string[]>> = {};

    for (const item of all) {
      if (!hierarchy[item.region]) {
        hierarchy[item.region] = {};
      }
      if (!hierarchy[item.region][item.district]) {
        hierarchy[item.region][item.district] = [];
      }
      hierarchy[item.region][item.district].push(item.ward);
    }

    if (all.length > 0) {
      this.cachedHierarchy = hierarchy;
      this.cachedRegions = Object.keys(hierarchy).sort();
    }

    return hierarchy;
  }
}
