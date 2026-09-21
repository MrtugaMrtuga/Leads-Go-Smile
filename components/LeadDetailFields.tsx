import React from 'react';
import { filledDetailFields } from '../shared/inboundMeta.js';
import { Lead } from '../types';

type DetailField = {
  id: string;
  label: string;
  value: string;
  href?: string;
  kind: 'contact' | 'form' | 'crm';
};

function FieldList({ fields }: { fields: DetailField[] }) {
  if (!fields.length) return null;
  return (
    <dl className="meta-fields">
      {fields.map((field) => (
        <div key={field.id} className="meta-field">
          <dt>{field.label}</dt>
          <dd>
            {field.href ? <a href={field.href}>{field.value}</a> : field.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

const LeadDetailFields: React.FC<{ lead: Lead }> = ({ lead }) => {
  const fields = filledDetailFields(lead) as DetailField[];
  if (!fields.length) return null;

  const contact = fields.filter((field) => field.kind === 'contact');
  const form = fields.filter((field) => field.kind === 'form');
  const crm = fields.filter((field) => field.kind === 'crm');

  return (
    <div className="meta-block">
      <FieldList fields={contact} />
      {form.length > 0 && (
        <>
          <p className="section-label">Formulário</p>
          <FieldList fields={form} />
        </>
      )}
      <FieldList fields={crm} />
    </div>
  );
};

export default LeadDetailFields;
