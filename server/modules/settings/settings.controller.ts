import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import type { UserSetting, ClearDataResult } from '../../shared/api.interface';
import { SettingsService } from './settings.service';
import { ClearLearningDataDto, UpdateUserSettingDto } from './dto/settings.dto';

@Controller('api/settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  async get(): Promise<UserSetting> {
    return this.settingsService.get();
  }

  @Patch()
  async update(@Body() dto: UpdateUserSettingDto): Promise<UserSetting> {
    return this.settingsService.update(dto);
  }

  @Post('clear-data')
  async clearData(@Body() dto: ClearLearningDataDto): Promise<ClearDataResult> {
    return this.settingsService.clearLearningData(dto);
  }
}
