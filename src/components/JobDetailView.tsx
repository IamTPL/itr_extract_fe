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
type DraftMode = 'combined' | 'separate';

interface DraftLink {
  label: string;
  url: string;
}

const EMAIL_EDIT_KEY_PREFIX = 'itr.email_edit.';
const SHAREFILE_ECONSENT_NOTICE = 'E-file authorization forms will be sent to you in a separate ShareFile email.';
const SEPARATE_ECONSENT_NOTICE = 'E-file authorization forms will be sent to you in a separate email.';
const ATTACHED_ECONSENT_NOTICE = 'E-file authorization forms are attached to this email.';
const ECONSENT_NOTICES = [
  SHAREFILE_ECONSENT_NOTICE,
  SEPARATE_ECONSENT_NOTICE,
  ATTACHED_ECONSENT_NOTICE,
];

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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceTextMatch(root: HTMLElement, pattern: RegExp, replacement: string): boolean {
  const walker = root.ownerDocument.createTreeWalker(root, 4);
  const textNodes: Text[] = [];
  let currentNode = walker.nextNode();
  while (currentNode) {
    textNodes.push(currentNode as Text);
    currentNode = walker.nextNode();
  }

  const fullText = textNodes.map(node => node.data).join('');
  const match = pattern.exec(fullText);
  if (!match?.[0]) return false;

  const start = match.index;
  const end = start + match[0].length;
  let cursor = 0;
  let startNode: Text | null = null;
  let endNode: Text | null = null;
  let startOffset = 0;
  let endOffset = 0;

  for (const node of textNodes) {
    const nodeEnd = cursor + node.data.length;
    if (!startNode && start >= cursor && start < nodeEnd) {
      startNode = node;
      startOffset = start - cursor;
    }
    if (end > cursor && end <= nodeEnd) {
      endNode = node;
      endOffset = end - cursor;
      break;
    }
    cursor = nodeEnd;
  }

  if (!startNode || !endNode) return false;
  const range = root.ownerDocument.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  range.deleteContents();
  range.insertNode(root.ownerDocument.createTextNode(replacement));
  return true;
}

function withEconsentNotice(html: string, notice: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const markedNotice = doc.body.querySelector<HTMLElement>('[data-econsent-notice]');
  if (markedNotice) {
    markedNotice.textContent = notice;
    return sanitizeEmailHtml(doc.body.innerHTML);
  }

  const replacedKnownNotice = ECONSENT_NOTICES.some(candidate => {
    const flexibleWhitespacePattern = candidate
      .trim()
      .split(/\s+/)
      .map(escapeRegExp)
      .join('[\\s\\u00a0]+');
    return replaceTextMatch(doc.body, new RegExp(flexibleWhitespacePattern, 'i'), notice);
  });
  if (replacedKnownNotice) return sanitizeEmailHtml(doc.body.innerHTML);

  const semanticNoticePattern = /e[\s\u00a0-]*file[\s\u00a0]+authorization[\s\u00a0]+forms?(?=[^.!?]*(?:attach|separate|sent|email))[^.!?]*(?:[.!?]|$)/i;
  if (replaceTextMatch(doc.body, semanticNoticePattern, notice)) {
    return sanitizeEmailHtml(doc.body.innerHTML);
  }

  return html;
}

function buildEconsentEmailHtml(taxYear: string): string {
  const safeTaxYear = taxYear.replace(/[^0-9]/g, '');
  return sanitizeEmailHtml(`
    <div style="font-family:Arial,sans-serif;font-size:11pt;line-height:1.5;color:#111;">
      <p>Dear Client,</p>
      <p>The e-file authorization forms for your <strong>${safeTaxYear}</strong> Income Tax Return are attached.</p>
      <p>Please review and sign these documents electronically at your earliest convenience, as we are unable to submit your return to the taxing authorities without your authorization.</p>
      <p>Should you have any questions regarding the attached documents, please do not hesitate to contact our office for assistance.</p>
    </div>
  `);
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
  const toEmailRef = useRef<HTMLInputElement>(null);

  const [selectedForms, setSelectedForms] = useState<Set<number>>(
    () => new Set(forms.map((_, i) => i)),
  );
  const [econsentB64, setEconsentB64] = useState<string | null>(null);
  const [isEconsentLoading, setIsEconsentLoading] = useState(
    () => job.has_econsent && forms.length > 0,
  );
  const [isExtracting, setIsExtracting] = useState(false);

  const [toEmail, setToEmail] = useState('');
  const [draftMode, setDraftMode] = useState<DraftMode>('combined');
  const [draftState, setDraftState] = useState<DraftState>('idle');
  const [draftError, setDraftError] = useState('');
  const [draftLinks, setDraftLinks] = useState<DraftLink[]>([]);
  const [retryMissingEconsent, setRetryMissingEconsent] = useState(false);

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
    setIsEconsentLoading(job.has_econsent && forms.length > 0);
    setToEmail('');
    setDraftMode('combined');
    setDraftState('idle');
    setDraftError('');
    setDraftLinks([]);
    setRetryMissingEconsent(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.job_id]);

  useEffect(() => {
    if (!job.has_econsent || forms.length === 0) return;
    let cancelled = false;
    apiFetch(`/api/jobs/${job.job_id}/econsent.pdf`, {}, getToken)
      .then(r => r.arrayBuffer())
      .then(buf => {
        if (cancelled) return;
        let binary = '';
        new Uint8Array(buf).forEach(b => (binary += String.fromCharCode(b)));
        setEconsentB64(btoa(binary));
      })
      .catch(err => {
        if (cancelled) return;
        toast.show(`Failed to load econsent PDF: ${err instanceof Error ? err.message : 'Unknown error'}`);
      })
      .finally(() => {
        if (!cancelled) setIsEconsentLoading(false);
      });
    return () => { cancelled = true; };
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
    setDraftState('idle');
    setDraftError('');
    if (!retryMissingEconsent) setDraftLinks([]);
    if (next.size === 0) {
      setEconsentB64(null);
      if (!retryMissingEconsent) setDraftMode('combined');
      return;
    }
    setEconsentB64(null);
    setIsExtracting(true);
    const selectedPages = forms
      .filter((_, i) => next.has(i))
      .flatMap((f: any) => f.pages as number[])
      .sort((a, b) => a - b);
    try {
      const buf = await getInputBuffer();
      const b64 = await extractPagesFromBuffer(buf, selectedPages);
      setEconsentB64(b64);
    } catch (err) {
      toast.show(`Failed to rebuild Econsent.pdf: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsExtracting(false);
    }
  }

  async function handleCreateDraft() {
    if (!toEmailRef.current?.reportValidity()) return;
    const recipient = toEmail.trim();
    if (draftMode === 'separate' && !econsentB64) {
      setDraftError('Select at least one E-consent form before creating separate drafts.');
      setDraftState('error');
      return;
    }
    setDraftState('creating');
    setDraftError('');
    const isEconsentRetry = draftMode === 'separate' && retryMissingEconsent;
    if (!isEconsentRetry) setDraftLinks([]);
    const currentHtml = sanitizeEmailHtml(emailRef.current?.innerHTML ?? email_html);
    const summarySubject = `${taxYear} Income Tax Return — ${clientName}`;
    const econsentSubject = `${taxYear} E-file Authorization Forms — ${clientName}`;
    const fileName = 'Econsent.pdf';
    const createdLinks: DraftLink[] = isEconsentRetry ? [...draftLinks] : [];
    let summaryDraftCreated = isEconsentRetry;
    try {
      if (draftMode === 'combined') {
        const combinedHtml = econsentB64
          ? withEconsentNotice(currentHtml, ATTACHED_ECONSENT_NOTICE)
          : currentHtml;
        const draft = await createOutlookDraft(
          instance,
          recipient,
          summarySubject,
          combinedHtml,
          econsentB64,
          fileName,
        );
        if (draft.webLink) createdLinks.push({ label: 'Open draft in Outlook', url: draft.webLink });
      } else {
        if (!summaryDraftCreated) {
          const summaryDraft = await createOutlookDraft(
            instance,
            recipient,
            summarySubject,
            withEconsentNotice(currentHtml, SEPARATE_ECONSENT_NOTICE),
            null,
            fileName,
          );
          summaryDraftCreated = true;
          if (summaryDraft.webLink) {
            createdLinks.push({ label: 'Open summary draft', url: summaryDraft.webLink });
            setDraftLinks([...createdLinks]);
          }
        }

        const econsentDraft = await createOutlookDraft(
          instance,
          recipient,
          econsentSubject,
          buildEconsentEmailHtml(taxYear),
          econsentB64,
          fileName,
        );
        if (econsentDraft.webLink) {
          createdLinks.push({ label: 'Open E-consent draft', url: econsentDraft.webLink });
        }
      }
      setRetryMissingEconsent(false);
      setDraftLinks(createdLinks);
      setDraftState('done');
    } catch (err) {
      setDraftLinks(createdLinks);
      const message = err instanceof Error ? err.message : String(err);
      const canRetryEconsent = draftMode === 'separate' && summaryDraftCreated;
      setRetryMissingEconsent(canRetryEconsent);
      setDraftError(canRetryEconsent
        ? `The summary draft was created, but the E-consent draft failed: ${message}`
        : message);
      setDraftState('error');
    }
  }

  function resetDraftResult() {
    setDraftState('idle');
    setDraftError('');
    setDraftLinks([]);
    setRetryMissingEconsent(false);
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

  const isAttachmentBusy = isExtracting || isEconsentLoading;
  const isDraftCreating = draftState === 'creating';
  const isFormSelectionDisabled = isAttachmentBusy || isDraftCreating;
  const hasEconsentForms = forms.length > 0;
  const canCreateDraft = (
    !!toEmail.trim()
    && !isAttachmentBusy
    && !isDraftCreating
    && (draftMode === 'combined'
      ? selectedForms.size === 0 || !!econsentB64
      : !!econsentB64)
  );
  const canDownload = !!econsentB64 && !isAttachmentBusy;
  const createDraftLabel = isDraftCreating
    ? retryMissingEconsent
      ? 'Creating E-consent draft…'
      : draftMode === 'separate' ? 'Creating 2 drafts…' : 'Creating draft…'
    : retryMissingEconsent
      ? 'Retry E-consent Draft'
    : draftState === 'done'
      ? draftMode === 'separate' ? '2 Drafts Created' : 'Draft Created'
      : draftMode === 'separate' ? 'Create 2 Outlook Drafts' : 'Create Outlook Draft';

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
              <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: isFormSelectionDisabled ? 'not-allowed' : 'pointer', fontSize: '0.88rem' }}>
                <input
                  type="checkbox"
                  checked={selectedForms.has(i)}
                  onChange={() => handleFormToggle(i)}
                  disabled={isFormSelectionDisabled}
                  style={{ width: '16px', height: '16px', cursor: isFormSelectionDisabled ? 'not-allowed' : 'pointer' }}
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
          {isEconsentLoading && (
            <p style={{ margin: '0.75rem 0 0', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Loading Econsent.pdf…</p>
          )}
          {!isAttachmentBusy && selectedForms.size === 0 && (
            <p style={{ margin: '0.75rem 0 0', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
              No E-consent forms selected — the draft will contain the summary email only.
            </p>
          )}
        </div>
      )}

      <div className={`card draft-controls ${hasEconsentForms ? '' : 'draft-controls--summary-only'}`}>
        <div className="draft-controls__recipient">
          <label htmlFor="draft-recipient" style={{ fontWeight: 600, fontSize: '0.9rem', whiteSpace: 'nowrap' }}>To:</label>
          <input
            ref={toEmailRef}
            id="draft-recipient"
            type="email"
            required
            disabled={isDraftCreating}
            value={toEmail}
            onChange={e => { setToEmail(e.target.value); resetDraftResult(); }}
            placeholder="client@example.com"
            className="input-text"
            style={{ flex: 1, minWidth: '200px' }}
          />
        </div>
        {hasEconsentForms && <fieldset
          className="draft-controls__mode"
          disabled={isDraftCreating}
        >
          <legend className="draft-controls__label">Outlook drafts</legend>
          <div className="draft-options">
            <label className={`draft-option ${draftMode === 'combined' ? 'draft-option--selected' : ''}`}>
              <input
                type="radio"
                name={`draft-mode-${job.job_id}`}
                value="combined"
                checked={draftMode === 'combined'}
                onChange={() => { setDraftMode('combined'); resetDraftResult(); }}
              />
              <span>
                <strong>One email</strong>
                <small>
                  {isAttachmentBusy
                    ? 'Preparing Econsent.pdf…'
                    : econsentB64
                      ? 'Summary + Econsent.pdf attachment'
                      : selectedForms.size > 0
                        ? 'Econsent.pdf is unavailable'
                        : 'Summary only — no E-consent selected'}
                </small>
              </span>
            </label>
            <label
              className={`draft-option ${draftMode === 'separate' ? 'draft-option--selected' : ''} ${!econsentB64 || isAttachmentBusy ? 'draft-option--disabled' : ''}`}
            >
              <input
                type="radio"
                name={`draft-mode-${job.job_id}`}
                value="separate"
                checked={draftMode === 'separate'}
                onChange={() => { setDraftMode('separate'); resetDraftResult(); }}
                disabled={!econsentB64 || isAttachmentBusy}
              />
              <span>
                <strong>Two emails</strong>
                <small>Summary email + separate E-consent email</small>
              </span>
            </label>
          </div>
          <span className="draft-controls__hint">
            Conflicting authorization wording is adjusted automatically to match this choice.
          </span>
        </fieldset>}
        <div className="draft-controls__actions">
          <div className="draft-controls__buttons">
            <button
              className="btn btn-primary"
              onClick={handleCreateDraft}
              disabled={!canCreateDraft}
            >
              {createDraftLabel}
            </button>
            <button
              className="btn btn-ghost"
              onClick={downloadEconsent}
              disabled={!canDownload}
            >
              Download Econsent.pdf
            </button>
          </div>
          <div className="draft-controls__result" aria-live="polite">
            {draftLinks.map(link => (
              <a
                key={link.label}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="draft-controls__link"
              >
                {link.label}
              </a>
            ))}
            {draftState === 'error' && (
              <p style={{ fontSize: '0.82rem', color: 'var(--color-error)', margin: 0 }}>{draftError}</p>
            )}
          </div>
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
          contentEditable={!isDraftCreating}
          suppressContentEditableWarning
          className="email-preview"
          onBlur={handleEmailBlur}
        />
      </div>
    </div>
  );
}
