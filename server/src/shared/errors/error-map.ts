import { HttpStatus } from '@/utils/http-status';

export const defaultErrorMap: Record<string, number> = {
  ValidationError: HttpStatus.BAD_REQUEST,
  CastError: HttpStatus.BAD_REQUEST,
};
