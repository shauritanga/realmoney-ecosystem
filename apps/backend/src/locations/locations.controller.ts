import { Controller, Get, Query } from '@nestjs/common';
import { LocationsService } from './locations.service.js';

@Controller('locations')
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Get('regions')
  async getRegions(): Promise<string[]> {
    return this.locationsService.getRegions();
  }

  @Get('districts')
  async getDistricts(@Query('region') region: string): Promise<string[]> {
    return this.locationsService.getDistricts(region || '');
  }

  @Get('wards')
  async getWards(
    @Query('region') region?: string,
    @Query('district') district?: string,
  ): Promise<string[]> {
    return this.locationsService.getWards(region, district);
  }

  @Get('hierarchy')
  async getHierarchy(): Promise<Record<string, Record<string, string[]>>> {
    return this.locationsService.getHierarchy();
  }
}
