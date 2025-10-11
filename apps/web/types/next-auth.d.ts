import NextAuth from 'next-auth';

declare module 'next-auth' {
  interface Session {
    sessionToken?: string;
    sessionExpiresAt?: string;
    user: {
      id: string;
      email: string;
      name?: string | null;
      organizationId?: string;
      organizationName?: string;
      organizationPlan?: string;
      organizationRole?: string;
      projects?: Array<{
        id: string;
        name: string;
        timezone: string;
        role: string;
      }>;
    };
  }

  interface User {
    organizationId?: string;
    organizationName?: string;
    organizationPlan?: string;
    organizationRole?: string;
    projects?: Array<{
      id: string;
      name: string;
      timezone: string;
      role: string;
    }>;
    sessionToken?: string;
    sessionExpiresAt?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    sessionToken?: string;
    sessionExpiresAt?: string;
    organizationId?: string;
    organizationName?: string;
    organizationPlan?: string;
    organizationRole?: string;
    projects?: Array<{
      id: string;
      name: string;
      timezone: string;
      role: string;
    }>;
  }
}
