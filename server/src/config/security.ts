import { sign, verify, JwtPayload, Secret, SignOptions } from 'jsonwebtoken';
import { envConfig } from '@/config/env';

interface TokenPayload extends JwtPayload {
  sub: string;
  roles: string[];
}

const signToken = (payload: TokenPayload, secret: Secret, expiresIn: string): string => {
  const options: SignOptions = { expiresIn: expiresIn as SignOptions['expiresIn'] };
  return sign(payload, secret, options);
};

const verifyToken = (token: string, secret: Secret): TokenPayload =>
  verify(token, secret) as TokenPayload;

export const signAccessToken = (payload: TokenPayload): string =>
  signToken(payload, envConfig.JWT_SECRET as Secret, envConfig.JWT_EXPIRES_IN);

export const signRefreshToken = (payload: TokenPayload): string =>
  signToken(payload, envConfig.REFRESH_TOKEN_SECRET as Secret, envConfig.REFRESH_TOKEN_EXPIRES_IN);

export const verifyAccessToken = (token: string): TokenPayload =>
  verifyToken(token, envConfig.JWT_SECRET as Secret);

export const verifyRefreshToken = (token: string): TokenPayload =>
  verifyToken(token, envConfig.REFRESH_TOKEN_SECRET as Secret);
