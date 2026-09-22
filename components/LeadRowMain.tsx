import React from 'react';
import { Lead } from '../types';
import LeadName from './LeadName';
import LeadPhone from './LeadPhone';

const LeadRowMain: React.FC<{
  lead: Pick<Lead, 'name' | 'status' | 'phone'>;
  sub?: React.ReactNode;
  onOpen?: () => void;
  nameClassName?: string;
  mark?: React.ReactNode;
}> = ({ lead, sub, onOpen, nameClassName = 'row-title', mark }) => {
  const name = (
    <span className="row-name-line">
      <LeadName lead={lead} className={nameClassName} />
      {mark}
    </span>
  );
  const phone = <LeadPhone phone={lead.phone} />;
  const meta = sub != null && sub !== false ? <span className="row-sub">{sub}</span> : null;

  if (!onOpen) {
    return (
      <span className="row-main">
        {name}
        {phone}
        {meta}
      </span>
    );
  }

  return (
    <span className="row-main">
      <button type="button" className="row-hit" onClick={onOpen}>
        {name}
      </button>
      {phone}
      {meta ? (
        <button type="button" className="row-hit" onClick={onOpen}>
          {meta}
        </button>
      ) : null}
    </span>
  );
};

export default LeadRowMain;
