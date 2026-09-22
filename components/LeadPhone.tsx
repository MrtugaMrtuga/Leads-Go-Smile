import React from 'react';
import { formatPhoneDisplay, toTelHref } from '../utils';

const LeadPhone: React.FC<{ phone?: string; className?: string }> = ({ phone, className = 'row-phone' }) => {
  const display = formatPhoneDisplay(phone || '');
  const href = toTelHref(phone || '');
  if (!display) {
    return <span className={`${className} is-empty`}>Sem telefone</span>;
  }
  if (!href) {
    return <span className={className}>{display}</span>;
  }
  return (
    <a
      className={className}
      href={href}
      aria-label={`Ligar ${display}`}
      onClick={(event) => event.stopPropagation()}
    >
      {display}
    </a>
  );
};

export default LeadPhone;
