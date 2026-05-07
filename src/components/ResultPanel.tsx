import { useState } from 'react';
import type { IPublicClientApplication } from '@azure/msal-browser';
import type { ProcessResponse } from '../types';
import { createOutlookDraft } from '../lib/graphApi';

interface Props {
  result: ProcessResponse;
  msalInstance: IPublicClientApplication;
  onReset: () => void;
}

function b64ToBlob(b64: string, mime: string): Blob {
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

type DraftState = 'idle' | 'creating' | 'done' | 'error';

export default function ResultPanel({ result, msalInstance, onReset }: Props) {
  const [toEmail, setToEmail] = useState('');
  const [draftState, setDraftState] = useState<DraftState>('idle');
  const [draftError, setDraftError] = useState('');
  const [draftLink, setDraftLink] = useState('');

  const { econsent_pdf_b64, analysis_data, email_html } = result;
  const clientName = analysis_data.client.name ?? 'Client';
  const taxYear = analysis_data.tax_year ?? '';

  function downloadEconsent() {
    if (!econsent_pdf_b64) return;
    const url = URL.createObjectURL(b64ToBlob(econsent_pdf_b64, 'application/pdf'));
    const a = document.createElement('a');
    a.href = url;
    a.download = `Econsent_${clientName.replace(/\s+/g, '_')}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleCreateDraft() {
    if (!toEmail) { alert('Please enter a "To" email address first.'); return; }
    setDraftState('creating');
    setDraftError('');
    try {
      const subject = `${taxYear} Income Tax Return — ${clientName}`;
      const fileName = `Econsent_${clientName.replace(/\s+/g, '_')}.pdf`;
      const draft = await createOutlookDraft(msalInstance, toEmail, subject, email_html, econsent_pdf_b64, fileName);
      setDraftLink(draft.webLink);
      setDraftState('done');
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : String(err));
      setDraftState('error');
    }
  }

  const card: React.CSSProperties = {
    background: '#fff',
    borderRadius: '10px',
    border: '1px solid #e0e4ea',
    padding: '1.25rem 1.5rem',
    marginBottom: '1.25rem',
  };

  const label: React.CSSProperties = {
    fontSize: '0.75rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: '#888',
    marginBottom: '0.75rem',
  };

  function btn(variant: 'primary' | 'secondary' | 'ghost' | 'disabled'): React.CSSProperties {
    const base: React.CSSProperties = {
      padding: '0.55rem 1.1rem', borderRadius: '6px',
      fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer', border: 'none',
    };
    if (variant === 'primary')   return { ...base, background: '#0078d4', color: '#fff' };
    if (variant === 'secondary') return { ...base, background: '#e8f4fd', color: '#0078d4' };
    if (variant === 'ghost')     return { ...base, background: '#fff', color: '#555', border: '1px solid #ccc' };
    return { ...base, background: '#eee', color: '#aaa', cursor: 'not-allowed' };
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f7fa', padding: '2rem 1rem' }}>
      <div style={{ maxWidth: '860px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1a1a2e', margin: 0 }}>
              {taxYear} ITR — {clientName}
            </h1>
            <p style={{ margin: '0.2rem 0 0', color: '#666', fontSize: '0.88rem' }}>
              {analysis_data.return_type} &nbsp;·&nbsp; {analysis_data.econsent_pages.length} e-consent page(s)
            </p>
          </div>
          <button style={btn('ghost')} onClick={onReset}>← Process another PDF</button>
        </div>

        {/* Actions */}
        <div style={{ ...card, display: 'flex', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
            <label style={{ fontWeight: 600, fontSize: '0.9rem', whiteSpace: 'nowrap' }}>To:</label>
            <input
              type="email"
              value={toEmail}
              onChange={e => { setToEmail(e.target.value); setDraftState('idle'); }}
              placeholder="client@example.com"
              style={{ flex: 1, padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #ccc', fontSize: '0.9rem', minWidth: '200px' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                style={btn(draftState === 'creating' || !toEmail ? 'disabled' : draftState === 'done' ? 'secondary' : 'primary')}
                onClick={handleCreateDraft}
                disabled={draftState === 'creating' || !toEmail}
              >
                {draftState === 'creating' ? '⏳ Creating…'
                  : draftState === 'done' ? '✅ Draft Created'
                  : '📧 Create Outlook Draft'}
              </button>
              <button
                style={btn(econsent_pdf_b64 ? 'primary' : 'disabled')}
                onClick={downloadEconsent}
                disabled={!econsent_pdf_b64}
                title={econsent_pdf_b64 ? '' : 'No e-consent pages detected'}
              >
                📥 Download Econsent.pdf
              </button>
            </div>

            {draftState === 'done' && draftLink && (
              <a href={draftLink} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: '0.82rem', color: '#0078d4' }}>
                Open draft in Outlook →
              </a>
            )}
            {draftState === 'error' && (
              <p style={{ fontSize: '0.82rem', color: '#cc0000', margin: 0 }}>{draftError}</p>
            )}
          </div>
        </div>

        {/* Email Preview */}
        <div style={card}>
          <p style={label}>Email Preview</p>
          <div
            style={{ border: '1px solid #eee', borderRadius: '6px', padding: '1.25rem', background: '#fafafa', overflowX: 'auto' }}
            dangerouslySetInnerHTML={{ __html: email_html }}
          />
        </div>

        {/* Econsent Forms */}
        {analysis_data.econsent_forms.length > 0 && (
          <div style={card}>
            <p style={label}>E-Consent Forms Detected</p>
            <ul style={{ margin: 0, paddingLeft: '1.2em', fontSize: '0.9rem', lineHeight: '1.8' }}>
              {analysis_data.econsent_forms.map((f, i) => (
                <li key={i}>
                  <strong>Form {f.form_number}</strong> — {f.title} ({f.jurisdiction})
                  &nbsp;<span style={{ color: '#888' }}>pages: {f.pages.join(', ')}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
