import React from 'react';
import { Lead } from '../types';

export type HypothesisStatus = 'scheduled' | 'discarded' | 'processing' | 'positive';

const CHOICES: { status: HypothesisStatus; label: string; accent: '' | 'red' | 'yellow' | 'blue' }[] = [
  { status: 'scheduled', label: 'Marcada', accent: '' },
  { status: 'discarded', label: 'Descartada', accent: 'red' },
  { status: 'processing', label: 'Não atendeu', accent: 'yellow' },
  { status: 'positive', label: 'Pré-qualificado', accent: 'blue' },
];

const StatusChoices: React.FC<{
  status: Lead['status'];
  disabled?: boolean;
  variant?: 'cta' | 'row';
  onChoose: (next: HypothesisStatus) => void;
}> = ({ status, disabled, variant = 'cta', onChoose }) => (
  <div className={variant === 'row' ? 'status-choices row' : 'status-choices'}>
    {CHOICES.map((item) => {
      const current = item.status === status;
      const className =
        variant === 'cta'
          ? `cta${item.accent ? ` sec tone-${item.accent}` : ''}`
          : `row-move${item.accent ? ` tone-${item.accent}` : ''}`;
      return (
        <button
          key={item.status}
          type="button"
          className={className}
          disabled={disabled || current}
          aria-current={current ? 'true' : undefined}
          onClick={(event) => {
            event.stopPropagation();
            if (current) return;
            onChoose(item.status);
          }}
        >
          {item.label}
        </button>
      );
    })}
  </div>
);

export default StatusChoices;
