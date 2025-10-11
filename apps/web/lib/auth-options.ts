import GoogleProvider from 'next-auth/providers/google';
import { NextAuthOptions, Session } from 'next-auth';
import { JWT } from 'next-auth/jwt';
import { SessionPayload } from '@email-automation/shared';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.API_BASE_URL ?? 'http://localhost:4000/api';

type ExtendedToken = JWT & {
  organizationId?: string;
  organizationName?: string;
  organizationPlan?: string;
  organizationRole?: SessionPayload['user']['organizationRole'];
  projects?: SessionPayload['projects'];
  sessionToken?: string;
  sessionExpiresAt?: string;
};

type ExtendedSession = Session & {
  sessionToken?: string;
  sessionExpiresAt?: string;
};

async function googleLoginRequest(idToken: string): Promise<SessionPayload | null> {
  const response = await fetch(`${API_BASE_URL}/v1/auth/google`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ idToken })
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as SessionPayload;
}

function applySessionPayloadToToken(token: ExtendedToken, payload: SessionPayload): ExtendedToken {
  token.sub = payload.user.id;
  token.email = payload.user.email;
  token.name = payload.user.displayName ?? payload.user.email;
  token.sessionToken = payload.sessionToken;
  token.sessionExpiresAt = payload.sessionExpiresAt;
  token.organizationId = payload.organization.id;
  token.organizationName = payload.organization.name;
  token.organizationPlan = payload.organization.plan;
  token.organizationRole = payload.user.organizationRole;
  token.projects = payload.projects ?? [];
  return token;
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? ''
    })
  ],
  session: {
    strategy: 'jwt'
  },
  callbacks: {
    async jwt({ token, account }) {
      const extendedToken = token as ExtendedToken;

      if (account?.provider === 'google' && account.id_token) {
        const sessionPayload = await googleLoginRequest(account.id_token);
        if (!sessionPayload) {
          throw new Error('Google authentication failed');
        }
        return applySessionPayloadToToken(extendedToken, sessionPayload);
      }

      return extendedToken;
    },
    async session({ session, token }) {
      if (session.user) {
        const enrichedToken = token as ExtendedToken;
        const enrichedSession = session as ExtendedSession;
        session.user.id = (token.sub as string | undefined) ?? session.user.id ?? '';
        session.user.email = (enrichedToken.email as string | undefined) ?? session.user.email;
        session.user.name = session.user.name ?? (enrichedToken.name as string | undefined);
        session.user.organizationId = enrichedToken.organizationId;
        session.user.organizationName = enrichedToken.organizationName;
        session.user.organizationPlan = enrichedToken.organizationPlan;
        session.user.organizationRole = enrichedToken.organizationRole;
        session.user.projects = enrichedToken.projects ?? [];
        enrichedSession.sessionToken = enrichedToken.sessionToken;
        enrichedSession.sessionExpiresAt = enrichedToken.sessionExpiresAt;
      }
      return session;
    }
  },
  pages: {
    signIn: '/signin'
  }
};
