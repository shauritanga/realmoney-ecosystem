import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LocationsService } from './locations.service.js';
import { Repository } from 'typeorm';
import { Location } from '../database/entities/location.entity.js';

describe('LocationsService', () => {
  let service: LocationsService;
  let repo: Partial<Repository<Location>>;

  const mockLocations: Partial<Location>[] = [
    { id: '1', region: 'Dodoma', district: 'Kondoa District Council', ward: 'Bereko' },
    { id: '2', region: 'Dodoma', district: 'Kondoa District Council', ward: 'Busi' },
    { id: '3', region: 'Dodoma', district: 'Kondoa Town Council', ward: 'Bolisa' },
    { id: '4', region: 'Arusha', district: 'Arusha City Council', ward: 'Kaloleni' },
  ];

  beforeEach(() => {
    repo = {
      find: vi.fn().mockResolvedValue(mockLocations),
      createQueryBuilder: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        getRawMany: vi.fn().mockImplementation(async () => [
          { region: 'Arusha' },
          { region: 'Dodoma' },
        ]),
      }),
    };
    service = new LocationsService(repo as Repository<Location>);
  });

  it('getHierarchy builds nested map correctly', async () => {
    const hierarchy = await service.getHierarchy();
    expect(hierarchy).toHaveProperty('Dodoma');
    expect(hierarchy).toHaveProperty('Arusha');
    expect(hierarchy['Dodoma']['Kondoa District Council']).toContain('Bereko');
    expect(hierarchy['Dodoma']['Kondoa District Council']).toContain('Busi');
    expect(hierarchy['Dodoma']['Kondoa Town Council']).toContain('Bolisa');
    expect(hierarchy['Arusha']['Arusha City Council']).toContain('Kaloleni');
  });

  it('getRegions returns cached regions from hierarchy or query', async () => {
    await service.getHierarchy();
    const regions = await service.getRegions();
    expect(regions).toEqual(['Arusha', 'Dodoma']);
  });

  it('getDistricts returns districts for a region', async () => {
    await service.getHierarchy();
    const districts = await service.getDistricts('Dodoma');
    expect(districts).toEqual(['Kondoa District Council', 'Kondoa Town Council']);
  });

  it('getWards returns wards for a district', async () => {
    await service.getHierarchy();
    const wards = await service.getWards('Dodoma', 'Kondoa District Council');
    expect(wards).toEqual(['Bereko', 'Busi']);
  });
});
