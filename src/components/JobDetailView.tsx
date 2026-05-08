import { useEffect, useRef, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import DOMPurify from 'dompurify';
import { useMsal } from '@azure/msal-react';
import type { JobDetail } from '../lib/types';
import { createOutlookDraft } from '../lib/graphApi';
import { apiFetch } from '../lib/apiClient';
import { useToast } from '../lib/toast';
import { useAccessToken } from '../hooks/useAccessToken';

type DraftState = 'idle' | 'creating' | 'done' | 'error';

const EMAIL_EDIT_KEY_PREFIX = 'itr.email_edit.';

function emailEditKey(jobId: string): string {
  return `${EMAIL_EDIT_KEY_PREFIX}${jobId}`;
}

function sanitizeEmailHtml(raw: string): string {
  return DOMPurify.sanitize(raw, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick'],
  });
}

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
  const toast = useToast();

  const forms: any[] = (job.analysis_data?.econsent_forms as any[]) ?? [];

  const emailRef = useRef<HTMLDivElement>(null);

  const [selectedForms, setSelectedForms] = useState<Set<number>>(
    () => new Set(forms.map((_, i) => i)),
  );
  const [econsentB64, setEconsentB64] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);

  const [toEmail, setToEmail] = useState('');
  const [draftState, setDraftState] = useState<DraftState>('idle');
  const [draftError, setDraftError] = useState('');
  const [draftLink, setDraftLink] = useState('');

  const inputBufferRef = useRef<ArrayBuffer | null>(null);

  useEffect(() => {
    if (!emailRef.current || !job.email_html) return;
    const saved = localStorage.getItem(emailEditKey(job.job_id));
    const html = saved ?? job.email_html;
    emailRef.current.innerHTML = sanitizeEmailHtml(html);
  }, [job.job_id, job.email_html]);

  useEffect(() => {
    setSelectedForms(new Set(forms.map((_, i) => i)));
    inputBufferRef.current = null;
    setEconsentB64(null);
    setToEmail('');
    setDraftState('idle');
    setDraftError('');
    setDraftLink('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.job_id]);

  useEffect(() => {
    if (!job.has_econsent || forms.length === 0) return;
    apiFetch(`/api/jobs/${job.job_id}/econsent.pdf`, {}, getToken)
      .then(r => r.arrayBuffer())
      .then(buf => {
        let binary = '';
        new Uint8Array(buf).forEach(b => (binary += String.fromCharCode(b)));
        setEconsentB64(btoa(binary));
      })
      .catch(err => {
        toast.show(`Failed to load econsent PDF: ${err instanceof Error ? err.message : 'Unknown error'}`);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.job_id]);

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
    const currentHtml = sanitizeEmailHtml(emailRef.current?.innerHTML ?? email_html);
    const subject = `${taxYear} Income Tax Return — ${clientName}`;
    const fileName = 'Econsent.pdf';
    try {
      const draft = await createOutlookDraft(instance, toEmail, subject, currentHtml, econsentB64, fileName);
      setDraftLink(draft.webLink);
      setDraftState('done');
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : String(err));
      setDraftState('error');
    }
  }

  function handleEmailBlur(e: React.FocusEvent<HTMLDivElement>) {
    const html = e.currentTarget.innerHTML;
    if (html && html !== job.email_html) {
      localStorage.setItem(emailEditKey(job.job_id), html);
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
    a.download = 'Econsent.pdf';
    a.click();
    URL.revokeObjectURL(url);
  }

  const canCreateDraft = !!toEmail && !isExtracting && draftState !== 'creating';
  const canDownload = !!econsentB64 && !isExtracting;

  return (
    <div>
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--color-text)', margin: '0 0 0.2rem' }}>
          {taxYear} ITR — {clientName}
        </h2>
        <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: '0.82rem' }}>
          {analysis_data.return_type as string}
        </p>
      </div>

      {forms.length > 0 && (
        <div className="card">
          <p className="section-label">E-Consent Forms — Select forms to include in Econsent.pdf</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {forms.map((f: any, i: number) => (
              <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontSize: '0.88rem' }}>
                <input
                  type="checkbox"
                  checked={selectedForms.has(i)}
                  onChange={() => handleFormToggle(i)}
                  disabled={isExtracting}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <span>
                  <strong>Form {f.form_number}</strong> — {f.title}
                  <span style={{ color: 'var(--color-text-muted)', marginLeft: '0.5rem' }}>({f.jurisdiction})</span>
                  <span style={{ color: 'var(--color-text-muted)', marginLeft: '0.5rem', fontSize: '0.82rem' }}>pages: {(f.pages as number[]).join(', ')}</span>
                </span>
              </label>
            ))}
          </div>
          {isExtracting && (
            <p style={{ margin: '0.75rem 0 0', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Re-extracting…</p>
          )}
          {!isExtracting && selectedForms.size === 0 && (
            <p style={{ margin: '0.75rem 0 0', fontSize: '0.85rem', color: 'var(--color-error)' }}>
              No forms selected — Econsent.pdf will not be attached.
            </p>
          )}
        </div>
      )}

      <div className="card" style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
          <label style={{ fontWeight: 600, fontSize: '0.9rem', whiteSpace: 'nowrap' }}>To:</label>
          <input
            type="email"
            value={toEmail}
            onChange={e => { setToEmail(e.target.value); setDraftState('idle'); }}
            placeholder="client@example.com"
            className="input-text"
            style={{ flex: 1, minWidth: '200px' }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              className="btn btn-primary"
              onClick={handleCreateDraft}
              disabled={!canCreateDraft}
            >
              {draftState === 'creating' ? 'Creating…' : draftState === 'done' ? 'Draft Created' : 'Create Outlook Draft'}
            </button>
            <button
              className="btn btn-primary"
              onClick={downloadEconsent}
              disabled={!canDownload}
            >
              Download Econsent.pdf
            </button>
          </div>
          {draftState === 'done' && draftLink && (
            <a href={draftLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
              Open draft in Outlook
            </a>
          )}
          {draftState === 'error' && (
            <p style={{ fontSize: '0.82rem', color: 'var(--color-error)', margin: 0 }}>{draftError}</p>
          )}
        </div>
      </div>

      <div className="card">
        <p className="section-label">
          Email Preview
          <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: '0.5rem', color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
            — click to edit
          </span>
        </p>
        <div
          ref={emailRef}
          contentEditable
          suppressContentEditableWarning
          className="email-preview"
          onBlur={handleEmailBlur}
        />
      </div>
    </div>
  );
}
