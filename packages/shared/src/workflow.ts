export type WorkflowPhaseId = 'connect_gmail' | 'import_leads' | 'draft_ai' | 'approve_send';

export interface WorkflowPhase {
  id: WorkflowPhaseId;
  name: string;
  description: string;
}

export const WORKFLOW: WorkflowPhase[] = [
  {
    id: 'connect_gmail',
    name: 'Connect Gmail',
    description: 'Authorize a Gmail account to send emails via the API.'
  },
  {
    id: 'import_leads',
    name: 'Import Leads',
    description: 'Upload or sync contacts so the agent knows who to email.'
  },
  {
    id: 'draft_ai',
    name: 'Generate AI Drafts',
    description: 'Use the AI agent to draft emails tailored to each lead.'
  },
  {
    id: 'approve_send',
    name: 'Approve & Send',
    description: 'Review drafts, approve the best ones, and let the agent send them.'
  }
];
