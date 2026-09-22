import React from 'react';
import { Lead } from '../types';
import { nextPipelineStatus } from '../utils';

export function moveLabel(next: string) {
  if (next === 'scheduled') return 'Marcada';
  if (next === 'processing') return 'Em processamento';
  return '';
}

const StatusMove: React.FC<{
  status: Lead['status'];
  disabled?: boolean;
  onMove: (next: 'processing' | 'scheduled') => void;
  className?: string;
  phrase?: boolean;
}> = ({ status, disabled, onMove, className = 'row-move', phrase = false }) => {
  const next = nextPipelineStatus(status);
  if (next !== 'processing' && next !== 'scheduled') return null;
  const label = moveLabel(next);
  return (
    <button
      type="button"
      className={className}
      disabled={disabled}
      aria-label={`Passar a ${label}`}
      onClick={(event) => {
        event.stopPropagation();
        onMove(next);
      }}
    >
      {phrase ? `Passar a ${label.toLowerCase()}` : `→ ${label}`}
    </button>
  );
};

export default StatusMove;
