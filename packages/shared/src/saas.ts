export interface ProjectStatsLike {
  leadCount: number;
  sentCount: number;
  draftsReady: number;
  templateCount: number;
  gmailConnectionCount: number;
}

export interface SaasMetric {
  label: string;
  value: number;
  suffix: string;
  detail: string;
}

export interface SaasLaunchPlan {
  readinessScore: number;
  riskLevel: 'low' | 'medium' | 'high';
  metrics: SaasMetric[];
  stages: Array<{ label: string; complete: boolean; nextAction: string }>;
  experiments: Array<{ title: string; hypothesis: string; metric: string }>;
  pricingTiers: Array<{ tier: string; audience: string; promise: string }>;
}

export function createSaasLaunchPlan(stats: ProjectStatsLike): SaasLaunchPlan {
  const gmailReady = stats.gmailConnectionCount > 0;
  const leadsReady = stats.leadCount > 0;
  const templatesReady = stats.templateCount > 0;
  const sendReady = stats.sentCount > 0;
  const workflowPoints =
    [gmailReady, leadsReady, templatesReady, sendReady].filter(Boolean).length * 20;
  const leadDepth = Math.min(20, stats.leadCount * 2);
  const readinessScore = Math.min(100, workflowPoints + leadDepth);
  const riskLevel = readinessScore >= 80 ? 'low' : readinessScore >= 45 ? 'medium' : 'high';

  return {
    readinessScore,
    riskLevel,
    metrics: [
      {
        label: 'Lead pipeline',
        value: stats.leadCount,
        suffix: '',
        detail: 'Total imported prospects',
      },
      {
        label: 'Draft inventory',
        value: stats.draftsReady,
        suffix: '',
        detail: 'Personalized drafts still available to approve',
      },
      {
        label: 'Connected senders',
        value: stats.gmailConnectionCount,
        suffix: '',
        detail: 'Authorized Gmail accounts',
      },
      {
        label: 'SaaS readiness',
        value: readinessScore,
        suffix: '/100',
        detail: 'Weighted from setup, activation, and sending momentum',
      },
    ],
    stages: [
      {
        label: 'Connect sender',
        complete: gmailReady,
        nextAction: 'Authorize Gmail for at least one project sender.',
      },
      {
        label: 'Import market',
        complete: leadsReady,
        nextAction: 'Upload a qualified CSV and validate personalization fields.',
      },
      {
        label: 'Package offer',
        complete: templatesReady,
        nextAction: 'Create a reusable AI-assisted campaign template.',
      },
      {
        label: 'Prove delivery',
        complete: sendReady,
        nextAction: 'Send a reviewed pilot batch and record outcomes.',
      },
    ],
    experiments: [
      {
        title: 'Niche landing test',
        hypothesis: 'A narrower ICP will improve reply rate.',
        metric: 'reply rate by segment',
      },
      {
        title: 'AI personalization depth',
        hypothesis: 'Knowledge-base grounded drafts will outperform generic templates.',
        metric: 'positive replies per 100 sends',
      },
      {
        title: 'Sender trust ramp',
        hypothesis: 'Small daily batches protect deliverability while learning fast.',
        metric: 'bounce and spam complaint rate',
      },
    ],
    pricingTiers: [
      {
        tier: 'Starter',
        audience: 'solo operator validating outreach',
        promise: 'one project, one sender, guided AI templates',
      },
      {
        tier: 'Team',
        audience: 'chapter or agency team',
        promise: 'multi-project workflows, brand knowledge, review gates',
      },
      {
        tier: 'Partner',
        audience: 'multi-chapter sponsor or nonprofit network',
        promise: 'portfolio outreach operations and reporting',
      },
    ],
  };
}
