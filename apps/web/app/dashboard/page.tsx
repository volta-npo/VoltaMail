import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth-options';
import { APP_NAME, ProjectStats } from '@email-automation/shared';
import Link from 'next/link';
import { getGmailConnections, getProjectStats } from '@/lib/server-api';
import { phases } from '@/lib/workflow-phases';

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/signin');
  }

  const projects = session.user.projects ?? [];
  const organizationRoleLabel = session.user.organizationRole
    ? `${session.user.organizationRole.charAt(0)}${session.user.organizationRole.slice(1).toLowerCase()}`
    : undefined;
  const humanizeRole = (role: string) => `${role.charAt(0)}${role.slice(1).toLowerCase()}`;
  const sessionToken = session.sessionToken;

  const gmailConnections = new Map<
    string,
    Awaited<ReturnType<typeof getGmailConnections>>
  >();
  const projectStats = new Map<string, ProjectStats>();
  const defaultStats: ProjectStats = {
    leadCount: 0,
    sentCount: 0,
    draftsReady: 0,
    templateCount: 0,
    gmailConnectionCount: 0
  };

  if (sessionToken) {
    for (const project of projects) {
      try {
        const [connections, stats] = await Promise.all([
          getGmailConnections(project.id, sessionToken),
          getProjectStats(project.id, sessionToken)
        ]);
        gmailConnections.set(project.id, connections);
        projectStats.set(project.id, stats);
      } catch (error) {
        console.error('Failed to load project data', error);
        gmailConnections.set(project.id, []);
        projectStats.set(project.id, defaultStats);
      }
    }
  }

  const getStatsForProject = (projectId: string) => projectStats.get(projectId) ?? defaultStats;

  const workflowCompletion: Record<string, boolean> = {
    gmail: projects.some((project) => getStatsForProject(project.id).gmailConnectionCount > 0),
    leads: projects.some((project) => getStatsForProject(project.id).leadCount > 0),
    template: projects.some((project) => getStatsForProject(project.id).templateCount > 0),
    approve: projects.some((project) => getStatsForProject(project.id).sentCount > 0)
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-slate-500">Welcome to</span>
          <h1 className="text-3xl font-semibold text-slate-900">{APP_NAME}</h1>
          <p className="text-sm text-slate-600">
            Logged in as <strong>{session.user.email}</strong> • Organization:{' '}
            <strong>{session.user.organizationName}</strong>
            {organizationRoleLabel ? (
              <>
                {' '}
                • Role: <strong>{organizationRoleLabel}</strong>
              </>
            ) : null}
          </p>
        </div>
        <div>
          <Link
            href="/settings/ai"
            className="inline-flex items-center rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Manage AI provider keys
          </Link>
        </div>
      </header>
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-medium text-slate-800">Workflow Progress</h2>
        <p className="mt-1 text-sm text-slate-600">
          Follow these steps to move from onboarding to a live campaign. Items with a checkmark are already complete.
        </p>
        <ul className="mt-4 space-y-2">
          {phases.map((phase) => {
            const completed = workflowCompletion[phase.id] ?? false;
            return (
              <li key={phase.id} className="flex items-start gap-3 text-sm text-slate-600">
                <span
                  className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border text-[11px] ${
                    completed
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : 'border-slate-300 text-slate-400'
                  }`}
                >
                  {completed ? '✓' : ''}
                </span>
                <div>
                  <p className="font-medium text-slate-800">{phase.label}</p>
                  <p className="text-xs text-slate-500">{phase.description}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-medium text-slate-800">Active Projects</h2>
        <p className="mt-1 text-sm text-slate-600">
          Projects connected to your organization will appear here. Kick off your first campaign once
          Gmail is connected and your leads are imported.
        </p>
        <div className="mt-4 space-y-3">
          {projects.length === 0 ? (
            <div className="rounded border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
              No projects yet. Create one to start planning your outreach.
            </div>
          ) : (
            projects.map((project) => {
              const stats = getStatsForProject(project.id);
              return (
                <div key={project.id} className="rounded border border-slate-200 p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h3 className="text-base font-medium text-slate-800">{project.name}</h3>
                      <p className="text-sm text-slate-600">
                        Timezone: {project.timezone} • Role: {humanizeRole(project.role)}
                      </p>
                    </div>
                    <span className="self-start rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                      {project.role}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-4">
                    <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-lg font-semibold text-slate-900">{stats.gmailConnectionCount}</p>
                      <p className="uppercase tracking-wide text-[10px] text-slate-500">Gmail Connected</p>
                    </div>
                    <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-lg font-semibold text-slate-900">{stats.leadCount}</p>
                      <p className="uppercase tracking-wide text-[10px] text-slate-500">Leads Imported</p>
                    </div>
                    <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-lg font-semibold text-slate-900">{stats.draftsReady}</p>
                      <p className="uppercase tracking-wide text-[10px] text-slate-500">Drafts Ready</p>
                    </div>
                    <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-lg font-semibold text-slate-900">{stats.sentCount}</p>
                      <p className="uppercase tracking-wide text-[10px] text-slate-500">Emails Sent</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link
                      href={`/projects/${project.id}/leads/import?projectName=${encodeURIComponent(project.name)}`}
                      className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Import leads
                    </Link>
                    <Link
                      href={`/projects/${project.id}/templates`}
                      className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Draft &amp; send emails
                    </Link>
                    <a
                      href={`/integrations/gmail/connect?projectId=${project.id}`}
                      className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
                    >
                      Connect Gmail
                    </a>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium text-slate-800">Gmail Connections</h2>
            <p className="mt-1 text-sm text-slate-600">
              Connect Gmail accounts to start sending campaigns. Each connection authorizes us to send
              on your behalf.
            </p>
          </div>
        </div>
        <div className="mt-4 space-y-4">
          {projects.length === 0 ? (
            <p className="text-sm text-slate-600">
              Create a project first to connect Gmail accounts and manage outreach.
            </p>
          ) : (
            projects.map((project) => {
              const connections = gmailConnections.get(project.id) ?? [];
              return (
                <div key={project.id} className="rounded border border-slate-200 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-medium text-slate-800">{project.name}</h3>
                      <p className="text-xs text-slate-500">
                        Project ID: <code className="font-mono text-[11px]">{project.id}</code>
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Link
                        href={`/projects/${project.id}/leads/import?projectName=${encodeURIComponent(project.name)}`}
                        className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Import leads
                      </Link>
                      <a
                        href={`/integrations/gmail/connect?projectId=${project.id}`}
                        className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
                      >
                        Connect Gmail
                      </a>
                    </div>
                  </div>
                  {connections.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-600">
                      No Gmail accounts connected yet. Click “Connect Gmail” to authorize an account.
                    </p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {connections.map((connection) => (
                        <div
                          key={connection.id}
                          className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-3 py-2"
                        >
                          <div>
                            <p className="text-sm font-medium text-slate-800">{connection.email}</p>
                            <p className="text-xs text-slate-500">
                              Connected {new Date(connection.connectedAt).toLocaleString()} • Scopes:{' '}
                              {connection.scopes.join(', ')}
                            </p>
                            {connection.lastError ? (
                              <p className="mt-1 text-xs text-amber-700">
                                Last error: {connection.lastError}
                                {connection.lastErrorAt
                                  ? ` (${new Date(connection.lastErrorAt).toLocaleString()})`
                                  : ''}
                              </p>
                            ) : null}
                          </div>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${
                              connection.needsReauth
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-green-100 text-green-700'
                            }`}
                          >
                            {connection.needsReauth ? 'Needs reconnect' : 'Active'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>
    </main>
  );
}
