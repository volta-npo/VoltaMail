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
      <header className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <span className="inline-flex w-fit border-2 border-volta-dark bg-volta-accent px-2 py-1 font-mono text-[0.7rem] font-bold uppercase tracking-widest text-volta-dark shadow-neo-sm">
            Welcome to
          </span>
          <h1 className="font-display text-4xl font-bold tracking-tight text-volta-dark">{APP_NAME}</h1>
          <p className="text-sm text-volta-stone-700">
            Logged in as <strong className="text-volta-dark">{session.user.email}</strong> • Organization:{' '}
            <strong className="text-volta-dark">{session.user.organizationName}</strong>
            {organizationRoleLabel ? (
              <>
                {' '}
                • Role: <strong className="text-volta-dark">{organizationRoleLabel}</strong>
              </>
            ) : null}
          </p>
        </div>
        <div>
          <Link
            href="/settings/ai"
            className="inline-flex items-center border-2 border-volta-dark bg-volta-surface px-4 py-2 text-sm font-bold text-volta-dark shadow-neo transition-transform hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-neo-hover active:translate-x-[1px] active:translate-y-[1px] active:shadow-neo-sm"
          >
            Manage AI provider keys
          </Link>
        </div>
      </header>
      <section className="border-2 border-volta-dark bg-volta-surface p-6 shadow-neo">
        <h2 className="flex items-center gap-2 border-b-2 border-volta-dark pb-3 font-display text-lg font-bold text-volta-dark">
          <span className="inline-block h-3 w-3 border-2 border-volta-dark bg-volta-accent" aria-hidden />
          Workflow Progress
        </h2>
        <p className="mt-3 text-sm text-volta-stone-700">
          Follow these steps to move from onboarding to a live campaign. Items with a checkmark are already complete.
        </p>
        <ul className="mt-4 space-y-2">
          {phases.map((phase) => {
            const completed = workflowCompletion[phase.id] ?? false;
            return (
              <li key={phase.id} className="flex items-start gap-3 text-sm text-volta-stone-700">
                <span
                  className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 text-[11px] font-bold ${
                    completed
                      ? 'border-volta-dark bg-volta-success text-white'
                      : 'border-volta-dark bg-volta-surface text-volta-stone-400'
                  }`}
                >
                  {completed ? '✓' : ''}
                </span>
                <div>
                  <p className="font-bold text-volta-dark">{phase.label}</p>
                  <p className="text-xs text-volta-stone-500">{phase.description}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="border-2 border-volta-dark bg-volta-surface p-6 shadow-neo">
        <h2 className="flex items-center gap-2 border-b-2 border-volta-dark pb-3 font-display text-lg font-bold text-volta-dark">
          <span className="inline-block h-3 w-3 border-2 border-volta-dark bg-volta-primary" aria-hidden />
          Active Projects
        </h2>
        <p className="mt-3 text-sm text-volta-stone-700">
          Projects connected to your organization will appear here. Kick off your first campaign once
          Gmail is connected and your leads are imported.
        </p>
        <div className="mt-4 space-y-3">
          {projects.length === 0 ? (
            <div className="border-2 border-dashed border-volta-dark bg-volta-stone-50 p-6 text-sm text-volta-stone-700">
              No projects yet. Create one to start planning your outreach.
            </div>
          ) : (
            projects.map((project) => {
              const stats = getStatsForProject(project.id);
              return (
                <div key={project.id} className="border-2 border-volta-dark bg-volta-stone-50 p-4 shadow-neo-sm">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h3 className="font-display text-base font-bold text-volta-dark">{project.name}</h3>
                      <p className="text-sm text-volta-stone-700">
                        Timezone: {project.timezone} • Role: {humanizeRole(project.role)}
                      </p>
                    </div>
                    <span className="self-start border-2 border-volta-dark bg-volta-accent px-2 py-1 font-mono text-[0.7rem] font-bold uppercase tracking-widest text-volta-dark shadow-neo-sm">
                      {project.role}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-volta-stone-700 sm:grid-cols-4">
                    <div className="border-2 border-volta-dark bg-volta-surface px-3 py-2">
                      <p className="font-display text-xl font-bold text-volta-dark">{stats.gmailConnectionCount}</p>
                      <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-volta-stone-500">Gmail Connected</p>
                    </div>
                    <div className="border-2 border-volta-dark bg-volta-surface px-3 py-2">
                      <p className="font-display text-xl font-bold text-volta-dark">{stats.leadCount}</p>
                      <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-volta-stone-500">Leads Imported</p>
                    </div>
                    <div className="border-2 border-volta-dark bg-volta-surface px-3 py-2">
                      <p className="font-display text-xl font-bold text-volta-dark">{stats.draftsReady}</p>
                      <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-volta-stone-500">Drafts Ready</p>
                    </div>
                    <div className="border-2 border-volta-dark bg-volta-surface px-3 py-2">
                      <p className="font-display text-xl font-bold text-volta-dark">{stats.sentCount}</p>
                      <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-volta-stone-500">Emails Sent</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link
                      href={`/projects/${project.id}/leads/import?projectName=${encodeURIComponent(project.name)}`}
                      className="inline-flex items-center border-2 border-volta-dark bg-volta-surface px-3 py-1.5 text-sm font-bold text-volta-dark shadow-neo-sm transition-transform hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-neo active:translate-x-[1px] active:translate-y-[1px]"
                    >
                      Import leads
                    </Link>
                    <Link
                      href={`/projects/${project.id}/templates`}
                      className="inline-flex items-center border-2 border-volta-dark bg-volta-surface px-3 py-1.5 text-sm font-bold text-volta-dark shadow-neo-sm transition-transform hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-neo active:translate-x-[1px] active:translate-y-[1px]"
                    >
                      Draft &amp; send emails
                    </Link>
                    <a
                      href={`/integrations/gmail/connect?projectId=${project.id}`}
                      className="inline-flex items-center border-2 border-volta-dark bg-volta-primary px-3 py-1.5 text-sm font-bold text-white shadow-neo transition-transform hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-neo-hover active:translate-x-[1px] active:translate-y-[1px] active:shadow-neo-sm"
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
      <section className="border-2 border-volta-dark bg-volta-surface p-6 shadow-neo">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-2 border-b-2 border-volta-dark pb-3 font-display text-lg font-bold text-volta-dark">
              <span className="inline-block h-3 w-3 border-2 border-volta-dark bg-volta-accent" aria-hidden />
              Gmail Connections
            </h2>
            <p className="mt-3 text-sm text-volta-stone-700">
              Connect Gmail accounts to start sending campaigns. Each connection authorizes us to send
              on your behalf.
            </p>
          </div>
        </div>
        <div className="mt-4 space-y-4">
          {projects.length === 0 ? (
            <p className="text-sm text-volta-stone-700">
              Create a project first to connect Gmail accounts and manage outreach.
            </p>
          ) : (
            projects.map((project) => {
              const connections = gmailConnections.get(project.id) ?? [];
              return (
                <div key={project.id} className="border-2 border-volta-dark bg-volta-stone-50 p-4 shadow-neo-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-display text-base font-bold text-volta-dark">{project.name}</h3>
                      <p className="text-xs text-volta-stone-500">
                        Project ID: <code className="border border-volta-dark bg-volta-stone-100 px-1 font-mono text-[11px] text-volta-stone-800">{project.id}</code>
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Link
                        href={`/projects/${project.id}/leads/import?projectName=${encodeURIComponent(project.name)}`}
                        className="inline-flex items-center border-2 border-volta-dark bg-volta-surface px-3 py-1.5 text-sm font-bold text-volta-dark shadow-neo-sm transition-transform hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-neo active:translate-x-[1px] active:translate-y-[1px]"
                      >
                        Import leads
                      </Link>
                      <a
                        href={`/integrations/gmail/connect?projectId=${project.id}`}
                        className="inline-flex items-center border-2 border-volta-dark bg-volta-primary px-3 py-1.5 text-sm font-bold text-white shadow-neo transition-transform hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-neo-hover active:translate-x-[1px] active:translate-y-[1px] active:shadow-neo-sm"
                      >
                        Connect Gmail
                      </a>
                    </div>
                  </div>
                  {connections.length === 0 ? (
                    <p className="mt-3 text-sm text-volta-stone-700">
                      No Gmail accounts connected yet. Click “Connect Gmail” to authorize an account.
                    </p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {connections.map((connection) => (
                        <div
                          key={connection.id}
                          className="flex items-center justify-between border-2 border-volta-dark bg-volta-surface px-3 py-2 shadow-neo-sm"
                        >
                          <div>
                            <p className="text-sm font-bold text-volta-dark">{connection.email}</p>
                            <p className="text-xs text-volta-stone-500">
                              Connected {new Date(connection.connectedAt).toLocaleString()} • Scopes:{' '}
                              {connection.scopes.join(', ')}
                            </p>
                            {connection.lastError ? (
                              <p className="mt-1 text-xs text-volta-warn">
                                Last error: {connection.lastError}
                                {connection.lastErrorAt
                                  ? ` (${new Date(connection.lastErrorAt).toLocaleString()})`
                                  : ''}
                              </p>
                            ) : null}
                          </div>
                          <span
                            className={`border-2 border-volta-dark px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-widest shadow-neo-sm ${
                              connection.needsReauth
                                ? 'bg-volta-warn-soft text-volta-warn'
                                : 'bg-volta-success-soft text-volta-success'
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
