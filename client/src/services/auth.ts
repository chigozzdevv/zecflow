import { request } from "@/lib/api-client";

export type LoginResponse = {
  user: {
    id: string;
    name: string;
    email: string;
    organization: string;
    roles: string[];
  };
  tokens: {
    accessToken: string;
    refreshToken: string;
  };
};

export type RegisterResponse = {
  user: LoginResponse["user"];
  organization: {
    id: string;
    name: string;
    slug: string;
  };
  tokens: LoginResponse["tokens"];
};

export const authService = {
  async login(email: string, password: string): Promise<LoginResponse> {
    return request<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },

  async register(payload: {
    name: string;
    email: string;
    password: string;
    organizationName: string;
  }): Promise<RegisterResponse> {
    return request<RegisterResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
};
