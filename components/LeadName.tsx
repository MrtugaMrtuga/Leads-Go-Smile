import React from 'react';
import { Lead } from '../types';
import { pipelineTone } from '../utils';

const TONE_LABEL = {
  yellow: 'Em processamento',
  green: 'Marcada',
  red: 'Descartada',
} as const;

const LeadName: React.FC<{ lead: Pick<Lead, 'name' | 'status'>; className?: string }> = ({ lead, className }) => {
  const tone = pipelineTone(lead.status);
  return (
    <span className={className}>
      {tone ? <span className={`status-dot ${tone}`} role="img" aria-label={TONE_LABEL[tone]} /> : null}
      <span className="lead-name-text">{lead.name}</span>
    </span>
  );
};

export default LeadName;
