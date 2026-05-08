import { useEffect, useRef, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { useMsal } from '@azure/msal-react';
import type { JobDetail } from '../lib/types';
import { createOutlookDraft } from '../lib/graphApi';
import { apiFetch } from '../lib/apiClient';
import { useAccessToken } from '../hooks/useAccessToken';

type DraftState = 'idle' | 'creating' | 'done' | 'error';

async function extractPagesFromBuffer(buffer: ArrayBuffer, pageNumbers: number[]): Promise<string> {
  const srcDoc = await PDFDocument.load(buffer);
  const newDoc = await PDFDocument.create();
  const zeroBasedPages = pageNumbers.map(p => p - 1);
  const copied = await newDoc.copyPages(srcDoc, zeroBasedPages);
  copied.forEach(page => newDoc.addPage(page));
  const bytes = await newDoc.save();
  let binary = '';
  bytes.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary);
}

export function JobDetailView({ job }: { job: JobDetail }) {
  const { instance } = useMsal();
  const getToken = useAccessToken();

  const forms: any[] = (job.analysis_data?.econsent_forms as any[]) ?? [];

  // Editable email ref
  const emailRef = useRef<HTMLDivElement>(null);

  // Form selection — initialised / reset whenever job_id changes
  const [selectedForms, setSelectedForms] = useState<Set<number>>(
    () => new Set(forms.map((_, i) => i)),
  );
  const [econsentB64, setEconsentB64] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);

  // Draft creation
  const [toEmail, setToEmail] = useState('');
  const [draftState, setDraftState] = useState<DraftState>('idle');
  const [draftError, setDraftError] = useState('');
  const [draftLink, setDraftLink] = useState('');

  // Fetch input PDF buffer once per job for page extraction
  const inputBufferRef = useRef<ArrayBuffer | null>(null);

  // Re-sync email preview HTML when job changes
  useEffect(() => {
    if (emailRef.current && job.email_html) {
      emailRef.current.innerHTML = job.email_html;
    }
  }, [job.email_html]);

  // Re-init form selection when job changes
  useEffect(() => {
    setSelectedForms(new Set(forms.map((_, i) => i)));
    inputBufferRef.current = null;
    setEconsentB64(null);
    setToEmail('');
    setDraftState('idle');
    setDraftError('');
    setDraftLink('');
  // We intentionally depend only on job_id to reset state when the job changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.job_id]);

  // Fetch existing econsent blob from server when job has one
  useEffect(() => {
    if (!job.has_econsent || forms.length === 0) return;
    apiFetch(`/api/jobs/${job.job_id}/econsent.pdf`, {}, getToken)
      .then(r => r.arrayBuffer())
      .then(buf => {
        let binary = '';
        new Uint8Array(buf).forEach(b => (binary += String.fromCharCode(b)));
        setEconsentB64(btoa(binary));
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.job_id]);

  // ── Early return AFTER all hooks ──
  if (!job.analysis_data || !job.email_html) return null;

  const analysis_data = job.analysis_data as Record<string, any>;
  const email_html = job.email_html;
  const clientName = (analysis_data.client as any)?.name ?? 'Client';
  const taxYear = (analysis_data.tax_year as string) ?? '';

  async function getInputBuffer(): Promise<ArrayBuffer> {
    if (inputBufferRef.current) return inputBufferRef.current;
    const res = await apiFetch(`/api/jobs/${job.job_id}/input.pdf`, {}, getToken);
    const buf = await res.arrayBuffer();
    inputBufferRef.current = buf;
    return buf;
  }

  async function handleFormToggle(idx: number) {
    const next = new Set(selectedForms);
    if (next.has(idx)) next.delete(idx); else next.add(idx);
    setSelectedForms(next);
    if (next.size === 0) { setEconsentB64(null); return; }
    setIsExtracting(true);
    const selectedPages = forms
      .filter((_, i) => next.has(i))
      .flatMap((f: any) => f.pages as number[])
      .sort((a, b) => a - b);
    try {
      const buf = await getInputBuffer();
      const b64 = await extractPagesFromBuffer(buf, selectedPages);
      setEconsentB64(b64);
    } finally {
      setIsExtracting(false);
    }
  }

  async function handleCreateDraft() {
    if (!toEmail) { alert('Please enter a "To" email address first.'); return; }
    setDraftState('creating');
    setDraftError('');
    const currentHtml = emailRef.current?.innerHTML ?? email_html;
    const subject = `${taxYear} Income Tax Return — ${clientName}`;
    const fileName = `Econsent_${clientName.replace(/\s+/g, '_')}.pdf`;
    try {
      const draft = await createOutlookDraft(instance, toEmail, subject, currentHtml, econsentB64, fileName);
      setDraftLink(draft.webLink);
      setDraftState('done');
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : String(err));
      setDraftState('error');
    }
  }

  function downloadEconsent() {
    if (!econsentB64) return;
    const bytes = atob(econsentB64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([arr], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `Econsent_${clientName.replace(/\s+/g, '_')}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Styles (same as ResultPanel) ──
  const card: React.CSSProperties = {
    background: '#fff', borderRadius: '10px',
    border: '1px solid #e0e4ea', padding: '1.25rem 1.5rem', marginBottom: '1.25rem',
  };
  const sectionLabel: React.CSSProperties = {
    fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.06em', color: '#888', marginBottom: '0.75rem',
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

  const canCreateDraft = !!toEmail && !isExtracting && draftState !== 'creating';
  const canDownload = !!econsentB64 && !isExtracting;

  return (
    <div style={{ padding: '1rem' }}>
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#1a1a2e', margin: 0 }}>
          {taxYear} ITR — {clientName}
        </h2>
        <p style={{ margin: '0.2rem 0 0', color: '#666', fontSize: '0.88rem' }}>
          {analysis_data.return_type as string}
        </p>
      </div>

      {/* E-Consent Form Selection */}
      {forms.length > 0 && (
        <div style={card}>
          <p style={sectionLabel}>E-Consent Forms — Select forms to include in Econsent.pdf</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {forms.map((f: any, i: number) => (
              <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                <input
                  type="checkbox"
                  checked={selectedForms.has(i)}
                  onChange={() => handleFormToggle(i)}
                  disabled={isExtracting}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <span>
                  <strong>Form {f.form_number}</strong> — {f.title}
                  <span style={{ color: '#888', marginLeft: '0.5rem' }}>({f.jurisdiction})</span>
                  <span style={{ color: '#aaa', marginLeft: '0.5rem', fontSize: '0.82rem' }}>pages: {(f.pages as number[]).join(', ')}</span>
                </span>
              </label>
            ))}
          </div>
          {isExtracting && (
            <p style={{ margin: '0.75rem 0 0', fontSize: '0.85rem', color: '#0078d4' }}>Re-extracting...</p>
          )}
          {!isExtracting && selectedForms.size === 0 && (
            <p style={{ margin: '0.75rem 0 0', fontSize: '0.85rem', color: '#cc0000' }}>
              No forms selected — Econsent.pdf will not be attached.
            </p>
          )}
        </div>
      )}

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
              style={btn(canCreateDraft ? (draftState === 'done' ? 'secondary' : 'primary') : 'disabled')}
              onClick={handleCreateDraft}
              disabled={!canCreateDraft}
            >
              {draftState === 'creating' ? 'Creating...' : draftState === 'done' ? 'Draft Created' : 'Create Outlook Draft'}
            </button>
            <button style={btn(canDownload ? 'primary' : 'disabled')} onClick={downloadEconsent} disabled={!canDownload}>
              Download Econsent.pdf
            </button>
          </div>
          {draftState === 'done' && draftLink && (
            <a href={draftLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.82rem', color: '#0078d4' }}>
              Open draft in Outlook
            </a>
          )}
          {draftState === 'error' && (
            <p style={{ fontSize: '0.82rem', color: '#cc0000', margin: 0 }}>{draftError}</p>
          )}
        </div>
      </div>

      {/* Editable Email Preview */}
      <div style={card}>
        <p style={sectionLabel}>
          Email Preview
          <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: '0.5rem', color: '#aaa' }}>
            — click to edit
          </span>
        </p>
        <div
          ref={emailRef}
          contentEditable
          suppressContentEditableWarning
          style={{ border: '1px solid #eee', borderRadius: '6px', padding: '1.25rem', background: '#fafafa', overflowX: 'auto', outline: 'none', minHeight: '200px' }}
          onFocus={e => (e.currentTarget.style.borderColor = '#0078d4')}
          onBlur={e => (e.currentTarget.style.borderColor = '#eee')}
        />
      </div>
    </div>
  );
}
