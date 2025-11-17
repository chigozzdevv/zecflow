import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

export const hashPassword = async (value: string): Promise<string> => {
  return bcrypt.hash(value, SALT_ROUNDS);
};

export const comparePassword = async (value: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(value, hash);
};
