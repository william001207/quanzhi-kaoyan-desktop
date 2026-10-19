import { BadRequestException } from '@nestjs/common';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(id: string): boolean {
  return UUID_REGEX.test(id);
}

export function validateUuid(id: string, label = 'ID'): void {
  if (!isValidUuid(id)) {
    throw new BadRequestException(`无效的${label}格式`);
  }
}
