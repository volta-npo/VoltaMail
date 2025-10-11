import { Request } from 'express';
import { Session, User, ProjectMember, Project, Organization } from '@email-automation/database';

export type AuthenticatedUser = User & {
  organization: Organization;
  projectMemberships: Array<ProjectMember & { project: Project }>;
};

export interface AuthenticatedRequest extends Request {
  auth?: {
    session: Session;
    user: AuthenticatedUser;
  };
}
