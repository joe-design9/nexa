import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
/** Markiert eine Route als öffentlich (kein AuthGuard-Token nötig). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
