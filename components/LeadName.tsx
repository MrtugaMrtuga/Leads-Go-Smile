import React from 'react';
import { Lead } from '../types';
import { pipelineTone } from '../utils';

const STATUS_LABEL: Partial<Record<Lead['status'], string>> = {
  discarded: 'Descartada',
  scheduled: 'Marcada',
  processing: 'Não atendeu',
  contacted: 'Contactada',
  positive: 'Pré-qualificado',
};

const LeadName: React.FC<{ lead: Pick<Lead, 'name' | 'status'>; className?: string }> = ({ lead, className }) => {
  const tone = pipelineTone(lead.status);
  const label = STATUS_LABEL[lead.status] || '';
  return (
    <span className={className}>
      {tone ? <span className={`status-dot ${tone}`} role="img" aria-label={label || tone} /> : null}
      <span className="lead-name-text">{lead.name}</span>
    </span>
  );
};

export default LeadName;
