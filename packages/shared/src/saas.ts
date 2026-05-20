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
  personas: Array<{ role: string; job: string; successMetric: string }>;
  funnel: Array<{ stage: string; count: number; conversionGoal: string }>;
  lifecyclePlaybooks: Array<{ name: string; trigger: string; response: string }>;
  unitEconomics: Array<{ metric: string; value: number; suffix: string; rationale: string }>;
  deliverabilityControls: Array<{ control: string; status: 'ready' | 'needs-work'; action: string }>;
  analyticsEvents: Array<{ event: string; question: string; action: string }>;
  integrations: Array<{ name: string; value: string; privacy: string }>;
  expansionRoadmap: Array<{ horizon: string; release: string; unlock: string }>;
  marketPositioning: Array<{ segment: string; wedge: string; proof: string }>;
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
  const activationRate = stats.leadCount > 0 ? Math.round((stats.sentCount / stats.leadCount) * 100) : 0;
  const draftCoverage = stats.leadCount > 0 ? Math.round((stats.draftsReady / stats.leadCount) * 100) : 0;
  const estimatedMrr = estimateMrr(stats, readinessScore);
  const supportLoad = Math.max(0, 100 - readinessScore + (gmailReady ? 0 : 15));

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
      {
        label: 'Activation rate',
        value: activationRate,
        suffix: '%',
        detail: 'Share of imported leads that reached a sent message',
      },
      {
        label: 'Draft coverage',
        value: draftCoverage,
        suffix: '%',
        detail: 'Personalized draft depth against current pipeline',
      },
      {
        label: 'Estimated launch MRR',
        value: estimatedMrr,
        suffix: '/mo',
        detail: 'Planning estimate from sender count, lead depth, and readiness',
      },
      {
        label: 'Support load',
        value: supportLoad,
        suffix: '%',
        detail: 'Customer-success effort required before self-serve scale',
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
      {
        label: 'Scale safely',
        complete: sendReady && gmailReady && stats.sentCount >= 25,
        nextAction: 'Graduate from pilot sending to monitored weekly batches.',
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
      {
        title: 'Inbox-to-CRM handoff',
        hypothesis: 'Routing qualified replies into a follow-up board increases booked meetings.',
        metric: 'meetings booked per 100 positive replies',
      },
      {
        title: 'Template marketplace',
        hypothesis: 'Reusable nonprofit campaign packs reduce launch time for new chapters.',
        metric: 'template reuse and activation rate',
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
      {
        tier: 'Platform',
        audience: 'distributed program with many senders',
        promise: 'deliverability governance, shared playbooks, and executive analytics',
      },
    ],
    personas: [
      { role: 'Founder / operator', job: 'Launch outbound without hiring a sales ops team', successMetric: 'first positive replies this week' },
      { role: 'Chapter manager', job: 'Coordinate writers, reviewers, and senders', successMetric: 'campaigns approved on schedule' },
      { role: 'Writer', job: 'Generate personalized drafts with safe context', successMetric: 'draft acceptance rate' },
      { role: 'Deliverability owner', job: 'Protect sender reputation and compliance', successMetric: 'bounce and complaint rate below threshold' },
      { role: 'Sponsor / executive', job: 'See pipeline impact across programs', successMetric: 'portfolio meetings and revenue influenced' },
    ],
    funnel: [
      { stage: 'Imported leads', count: stats.leadCount, conversionGoal: 'CSV quality above 95%' },
      { stage: 'Drafts ready', count: stats.draftsReady, conversionGoal: '70% of qualified leads drafted' },
      { stage: 'Messages sent', count: stats.sentCount, conversionGoal: '25 safe pilot sends before scaling' },
      { stage: 'Connected senders', count: stats.gmailConnectionCount, conversionGoal: 'one warmed sender per active project' },
    ],
    lifecyclePlaybooks: [
      { name: 'First campaign launch', trigger: 'new project with zero sends', response: 'connect Gmail, import 25 leads, approve one template, send five reviewed messages' },
      { name: 'Draft backlog rescue', trigger: 'draft coverage above 80% with no sends', response: 'schedule reviewer approval and move best drafts into pilot batch' },
      { name: 'Deliverability guardrail', trigger: 'sender is connected and sends begin', response: 'monitor bounce, complaint, and daily volume before increasing limits' },
      { name: 'Expansion review', trigger: 'low-risk readiness and repeated sends', response: 'create second segment campaign and propose Team tier upgrade' },
    ],
    unitEconomics: [
      { metric: 'Estimated MRR', value: estimatedMrr, suffix: '/mo', rationale: 'sender count and readiness-weighted packaging estimate' },
      { metric: 'Activation rate', value: activationRate, suffix: '%', rationale: 'sent messages divided by imported leads' },
      { metric: 'Draft leverage', value: draftCoverage, suffix: '%', rationale: 'draft inventory depth relative to market size' },
      { metric: 'Support load', value: supportLoad, suffix: '%', rationale: 'inverse of readiness with extra lift when senders are disconnected' },
    ],
    deliverabilityControls: [
      { control: 'Sender authorization', status: gmailReady ? 'ready' : 'needs-work', action: gmailReady ? 'monitor token health' : 'connect Gmail before campaign launch' },
      { control: 'Pilot batch size', status: stats.sentCount <= 50 ? 'ready' : 'needs-work', action: 'keep daily sending below trust-building thresholds' },
      { control: 'Template review', status: templatesReady ? 'ready' : 'needs-work', action: templatesReady ? 'compare reply performance by template' : 'create an approved campaign template' },
      { control: 'Lead quality', status: leadsReady ? 'ready' : 'needs-work', action: leadsReady ? 'dedupe and validate personalization fields' : 'import a qualified lead list' },
    ],
    analyticsEvents: [
      { event: 'project_created', question: 'Which teams start a workspace?', action: 'segment onboarding by operator type' },
      { event: 'gmail_connected', question: 'Where does activation begin?', action: 'trigger import and template guidance' },
      { event: 'leads_imported', question: 'How deep is the market?', action: 'score data quality and recommend segments' },
      { event: 'draft_generated', question: 'Is AI creating usable personalization?', action: 'measure acceptance and edit reasons' },
      { event: 'message_sent', question: 'What safely reaches prospects?', action: 'monitor reply, bounce, and complaint outcomes' },
      { event: 'positive_reply_logged', question: 'Which messages create pipeline?', action: 'promote winning templates and ICPs' },
    ],
    integrations: [
      { name: 'Gmail', value: 'authenticated sending and account-level trust controls', privacy: 'OAuth-scoped sender access' },
      { name: 'CSV import', value: 'portable lead ingestion for low-resource teams', privacy: 'user-provided file data' },
      { name: 'AI providers', value: 'OpenRouter, Gemini, or OpenAI draft generation', privacy: 'provider keys stay organization scoped' },
      { name: 'CRM export', value: 'future handoff of positive replies and booked meetings', privacy: 'send qualified metadata only' },
      { name: 'Sponsor reporting API', value: 'future portfolio analytics across projects', privacy: 'aggregate campaign metrics' },
    ],
    expansionRoadmap: [
      { horizon: 'Now', release: 'SaaS launch command center', unlock: 'readiness, pricing, playbooks, and deliverability controls' },
      { horizon: 'Next', release: 'Reply intelligence layer', unlock: 'classification, CRM routing, and coaching from outcomes' },
      { horizon: 'Later', release: 'Template marketplace', unlock: 'reusable nonprofit outreach packs and performance benchmarks' },
      { horizon: 'Scale', release: 'Portfolio sponsor console', unlock: 'multi-chapter reporting, compliance controls, and expansion analytics' },
    ],
    marketPositioning: [
      { segment: 'Nonprofit operators', wedge: 'safe outreach without enterprise CRM complexity', proof: 'local onboarding and Gmail-first workflow' },
      { segment: 'Student agencies', wedge: 'review-gated AI writing for real client outreach', proof: 'draft inventory, template review, and sender approval' },
      { segment: 'Community sponsors', wedge: 'portfolio pipeline visibility across chapters', proof: 'readiness score and estimated launch MRR' },
      { segment: 'Solo builders', wedge: 'low-cost outbound operating system', proof: 'single-project Starter tier with AI templates' },
    ],
  };
}

function estimateMrr(stats: ProjectStatsLike, readinessScore: number): number {
  const senderValue = Math.max(1, stats.gmailConnectionCount) * 49;
  const leadValue = Math.min(250, stats.leadCount * 3);
  const readinessMultiplier = readinessScore >= 80 ? 2 : readinessScore >= 45 ? 1 : 0.5;
  return Math.round((senderValue + leadValue) * readinessMultiplier);
}
