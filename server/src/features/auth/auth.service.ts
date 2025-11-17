import { AppError } from '@/shared/errors/app-error';
import { HttpStatus } from '@/utils/http-status';
import { hashPassword, comparePassword } from '@/utils/password';
import { signAccessToken, signRefreshToken } from '@/config/security';
import { createOrganization, assignOwner } from '@/features/organizations/organizations.service';
import { UserModel } from '@/features/users/users.model';
import { toPublic, findUserByEmail } from '@/features/users/users.service';
import { RegisterPayload, LoginPayload, AuthTokens } from './auth.types';

const issueTokens = (userId: string, roles: string[]): AuthTokens => ({
  accessToken: signAccessToken({ sub: userId, roles }),
  refreshToken: signRefreshToken({ sub: userId, roles }),
});

export const register = async (payload: RegisterPayload) => {
  const existingUser = await findUserByEmail(payload.email);
  if (existingUser) {
    throw new AppError('Email already in use', HttpStatus.CONFLICT);
  }

  const organization = await createOrganization(payload.organizationName);
  const hashedPassword = await hashPassword(payload.password);

  const user = await UserModel.create({
    name: payload.name,
    email: payload.email.toLowerCase(),
    password: hashedPassword,
    organization: organization.id,
    roles: ['owner'],
  });

  await assignOwner(organization.id, user.id);

  return {
    user: toPublic(user),
    organization: { id: organization.id, name: organization.name, slug: organization.slug },
    tokens: issueTokens(user.id, user.roles),
  };
};

export const login = async (payload: LoginPayload) => {
  const user = await findUserByEmail(payload.email);
  if (!user) {
    throw new AppError('Invalid credentials', HttpStatus.UNAUTHORIZED);
  }

  const validPassword = await comparePassword(payload.password, user.password);
  if (!validPassword) {
    throw new AppError('Invalid credentials', HttpStatus.UNAUTHORIZED);
  }

  return {
    user: toPublic(user),
    tokens: issueTokens(user.id, user.roles),
  };
};
