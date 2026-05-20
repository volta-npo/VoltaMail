import { describe, expect, it } from 'vitest';
import { APP_NAME, OrganizationRole } from './index';
import { createSaasLaunchPlan } from './saas';

describe('shared constants', () => {
  it('exposes the application name', () => {
    expect(APP_NAME).toBe('VoltaMail');
  });

  it('includes the expected organization roles', () => {
    const roles: OrganizationRole[] = ['OWNER', 'MANAGER', 'WRITER', 'VIEWER'];
    expect(roles).toHaveLength(4);
  });
});

describe('SaaS launch planning', () => {
  it('scores a fully activated project as low risk', () => {
    const plan = createSaasLaunchPlan({
      leadCount: 25,
      sentCount: 25,
      draftsReady: 15,
      templateCount: 3,
      gmailConnectionCount: 1,
    });

    expect(plan.readinessScore).toBe(100);
    expect(plan.riskLevel).toBe('low');
    expect(plan.stages.every((stage) => stage.complete)).toBe(true);
    expect(plan.experiments).toHaveLength(5);
    expect(plan.pricingTiers).toHaveLength(4);
    expect(plan.metrics).toHaveLength(8);
    expect(plan.personas).toHaveLength(5);
    expect(plan.lifecyclePlaybooks).toHaveLength(4);
    expect(plan.unitEconomics.some((metric) => metric.metric === 'Estimated MRR')).toBe(true);
    expect(plan.deliverabilityControls.every((control) => control.status === 'ready')).toBe(true);
    expect(plan.analyticsEvents).toHaveLength(6);
    expect(plan.integrations).toHaveLength(5);
    expect(plan.expansionRoadmap).toHaveLength(4);
    expect(plan.marketPositioning).toHaveLength(4);
  });

  it('keeps an empty project high risk with concrete next actions', () => {
    const plan = createSaasLaunchPlan({
      leadCount: 0,
      sentCount: 0,
      draftsReady: 0,
      templateCount: 0,
      gmailConnectionCount: 0,
    });

    expect(plan.readinessScore).toBe(0);
    expect(plan.riskLevel).toBe('high');
    expect(plan.stages.some((stage) => stage.nextAction.includes('Gmail'))).toBe(true);
    expect(plan.deliverabilityControls.some((control) => control.status === 'needs-work')).toBe(true);
    expect(plan.metrics.some((metric) => metric.label === 'Support load' && metric.value > 100)).toBe(true);
  });
});
