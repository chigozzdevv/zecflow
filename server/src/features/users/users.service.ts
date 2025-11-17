import { UserModel, UserDocument } from './users.model';
import { PublicUser } from './users.types';

const toPublicUser = (user: UserDocument): PublicUser => ({
  id: user.id,
  name: user.name,
  email: user.email,
  organization: user.organization.toString(),
  roles: user.roles,
});

export const findUserByEmail = (email: string): Promise<UserDocument | null> => {
  return UserModel.findOne({ email: email.toLowerCase() });
};

export const findUserById = (id: string): Promise<UserDocument | null> => {
  return UserModel.findById(id);
};

export const toPublic = (user: UserDocument): PublicUser => toPublicUser(user);
