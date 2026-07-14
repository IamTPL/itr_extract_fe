import { useEffect, useRef, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import DOMPurify from 'dompurify';
import { useMsal } from '@azure/msal-react';
import {
  Bold,
  Check,
  CheckCircle2,
  Download,
  FileText,
  Italic,
  List,
  ListOrdered,
  Mail,
  Redo2,
  RotateCcw,
  Send,
  ShieldCheck,
  Underline,
  Undo2,
} from 'lucide-react';
import type { JobDetail } from '../lib/types';
import { createOutlookDraft } from '../lib/graphApi';
import { apiFetch } from '../lib/apiClient';
import { useToast } from '../lib/toast';
import { useAccessToken } from '../hooks/useAccessToken';
import { JobStatusBadge } from './JobStatusBadge';

type DraftState = 'idle' | 'creating' | 'done' | 'error';
type DraftMode = 'combined' | 'separate';

interface DraftLink {
  label: string;
  url: string;
}

interface EconsentForm {
  form_number: string;
  title: string;
  jurisdiction: string;
  pages: number[];
}

interface AnalysisData {
  client?: { name?: string };
  tax_year?: string;
  return_type?: string;
  econsent_forms?: EconsentForm[];
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

function countWords(html: string): number {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const text = doc.body.textContent?.trim() ?? '';
  return text ? text.split(/\s+/).length : 0;
}

function formatProcessedDate(value: string | null): string {
  if (!value) return 'Processing';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
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

  const analysisData = (job.analysis_data ?? {}) as AnalysisData;
  const forms = analysisData?.econsent_forms ?? [];

  const emailRef = useRef<HTMLDivElement>(null);
  const editorSelectionRef = useRef<Range | null>(null);
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
  const [emailSaveState, setEmailSaveState] = useState<'saved' | 'editing'>('saved');
  const [emailWordCount, setEmailWordCount] = useState(() => {
    const saved = localStorage.getItem(emailEditKey(job.job_id));
    return countWords(saved ?? job.email_html ?? '');
  });

  const inputBufferRef = useRef<ArrayBuffer | null>(null);

  useEffect(() => {
    if (!emailRef.current || !job.email_html) return;
    const saved = localStorage.getItem(emailEditKey(job.job_id));
    const html = saved ?? job.email_html;
    emailRef.current.innerHTML = sanitizeEmailHtml(html);
  }, [job.job_id, job.email_html]);

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

  const email_html = job.email_html;
  const clientName = analysisData.client?.name ?? 'Client';
  const taxYear = analysisData.tax_year ?? '';

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
      .flatMap(f => f.pages)
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
    } else {
      localStorage.removeItem(emailEditKey(job.job_id));
    }
    setEmailSaveState('saved');
  }

  function handleEmailInput(e: React.FormEvent<HTMLDivElement>) {
    setEmailSaveState('editing');
    setEmailWordCount(countWords(e.currentTarget.innerHTML));
    rememberEditorSelection();
  }

  function resetEmailChanges() {
    if (!emailRef.current) return;
    const originalHtml = sanitizeEmailHtml(job.email_html ?? '');
    emailRef.current.innerHTML = originalHtml;
    localStorage.removeItem(emailEditKey(job.job_id));
    setEmailWordCount(countWords(originalHtml));
    setEmailSaveState('saved');
  }

  function rememberEditorSelection() {
    const editor = emailRef.current;
    const selection = document.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) {
      editorSelectionRef.current = range.cloneRange();
    }
  }

  function runEditorCommand(command: string) {
    if (!emailRef.current || isDraftCreating) return;
    emailRef.current.focus();
    const selection = document.getSelection();
    if (selection && editorSelectionRef.current) {
      selection.removeAllRanges();
      selection.addRange(editorSelectionRef.current);
    }
    document.execCommand(command, false);
    rememberEditorSelection();
    setEmailWordCount(countWords(emailRef.current.innerHTML));
    setEmailSaveState('editing');
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
  const selectedPageCount = new Set(
    forms.filter((_, index) => selectedForms.has(index)).flatMap(form => form.pages),
  ).size;
  const processedDate = formatProcessedDate(job.finished_at);
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
    <div className="return-workspace">
      <header className="record-header">
        <nav className="record-breadcrumb" aria-label="Breadcrumb">
          <span>Returns</span>
          <span aria-hidden="true">/</span>
          <span>{job.original_filename}</span>
        </nav>
        <div className="record-header__title-row">
          <div>
            <h1>{taxYear} ITR — {clientName}</h1>
            <div className="record-metadata">
              <span>{analysisData.return_type ?? 'Income Tax Return'}</span>
              <span aria-hidden="true">•</span>
              <span>{job.original_filename}</span>
              <span aria-hidden="true">•</span>
              <span>Processed {processedDate}</span>
            </div>
          </div>
          <JobStatusBadge status={job.status} />
        </div>
      </header>

      <div className="return-workspace__grid">
        <section className="email-workspace" aria-labelledby="email-preview-heading">
          <div className="panel-heading email-workspace__heading">
            <div>
              <h2 id="email-preview-heading">Email Preview</h2>
              <p>Review and edit the client message before creating the Outlook draft.</p>
            </div>
            <div className="email-workspace__status">
              <span className="soft-badge soft-badge--blue">
                <FileText size={13} aria-hidden="true" />
                Editable
              </span>
              <span className={`soft-badge ${emailSaveState === 'saved' ? 'soft-badge--success' : 'soft-badge--warning'}`}>
                {emailSaveState === 'saved'
                  ? <Check size={13} aria-hidden="true" />
                  : <span className="unsaved-dot" aria-hidden="true" />}
                {emailSaveState === 'saved' ? 'Saved' : 'Unsaved'}
              </span>
              <button type="button" className="text-action" onClick={resetEmailChanges} disabled={isDraftCreating}>
                <RotateCcw size={14} aria-hidden="true" />
                Reset changes
              </button>
            </div>
          </div>

          <div className="editor-shell">
            <div className="editor-toolbar" role="toolbar" aria-label="Email formatting">
              <button type="button" aria-label="Undo" title="Undo" onMouseDown={event => event.preventDefault()} onClick={() => runEditorCommand('undo')}>
                <Undo2 size={16} />
              </button>
              <button type="button" aria-label="Redo" title="Redo" onMouseDown={event => event.preventDefault()} onClick={() => runEditorCommand('redo')}>
                <Redo2 size={16} />
              </button>
              <span className="editor-toolbar__divider" />
              <button type="button" aria-label="Bold" title="Bold" onMouseDown={event => event.preventDefault()} onClick={() => runEditorCommand('bold')}>
                <Bold size={16} />
              </button>
              <button type="button" aria-label="Italic" title="Italic" onMouseDown={event => event.preventDefault()} onClick={() => runEditorCommand('italic')}>
                <Italic size={16} />
              </button>
              <button type="button" aria-label="Underline" title="Underline" onMouseDown={event => event.preventDefault()} onClick={() => runEditorCommand('underline')}>
                <Underline size={16} />
              </button>
              <span className="editor-toolbar__divider" />
              <button type="button" aria-label="Bulleted list" title="Bulleted list" onMouseDown={event => event.preventDefault()} onClick={() => runEditorCommand('insertUnorderedList')}>
                <List size={16} />
              </button>
              <button type="button" aria-label="Numbered list" title="Numbered list" onMouseDown={event => event.preventDefault()} onClick={() => runEditorCommand('insertOrderedList')}>
                <ListOrdered size={16} />
              </button>
            </div>
            <div
              ref={emailRef}
              contentEditable={!isDraftCreating}
              suppressContentEditableWarning
              className="email-preview"
              aria-label="Editable client email"
              onInput={handleEmailInput}
              onBlur={handleEmailBlur}
              onMouseUp={rememberEditorSelection}
              onKeyUp={rememberEditorSelection}
            />
            <div className="editor-footer">
              <span>Body</span>
              <span aria-hidden="true">•</span>
              <span>{emailWordCount} words</span>
              <span className="editor-footer__saved">
                {emailSaveState === 'saved' ? 'Saved' : 'Editing'}
                {emailSaveState === 'saved' && <CheckCircle2 size={15} aria-hidden="true" />}
              </span>
            </div>
          </div>
        </section>

        <aside className="prepare-panel" aria-labelledby="prepare-outlook-heading">
          <div className="prepare-panel__title">
            <Mail size={21} aria-hidden="true" />
            <h2 id="prepare-outlook-heading">Prepare Outlook Draft</h2>
          </div>

          <div className="form-field">
            <label htmlFor="draft-recipient">Recipient</label>
            <input
              ref={toEmailRef}
              id="draft-recipient"
              type="email"
              required
              disabled={isDraftCreating}
              value={toEmail}
              onChange={event => { setToEmail(event.target.value); resetDraftResult(); }}
              placeholder="client@example.com"
              className="input-text"
            />
          </div>

          {hasEconsentForms ? (
            <fieldset className="delivery-fieldset" disabled={isDraftCreating}>
              <legend>Delivery</legend>
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
                          ? 'Summary + Econsent.pdf'
                          : selectedForms.size > 0
                            ? 'Econsent.pdf is unavailable'
                            : 'Summary only — no attachment'}
                    </small>
                  </span>
                </label>
                <label className={`draft-option ${draftMode === 'separate' ? 'draft-option--selected' : ''} ${!econsentB64 || isAttachmentBusy ? 'draft-option--disabled' : ''}`}>
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
                    <small>Separate summary and E-consent drafts</small>
                  </span>
                </label>
              </div>
            </fieldset>
          ) : (
            <div className="delivery-summary">
              <span>Delivery</span>
              <strong>One summary email</strong>
            </div>
          )}

          <div className="prepare-section">
            <div className="prepare-section__heading">
              <h3>E-consent PDF</h3>
              <span className="selection-count">{selectedForms.size} / {forms.length} selected</span>
            </div>

            {forms.length > 0 ? (
              <div className="econsent-list">
                {forms.map((form, index) => (
                  <label
                    key={`${form.form_number}-${index}`}
                    className={`econsent-row ${selectedForms.has(index) ? 'econsent-row--selected' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedForms.has(index)}
                      onChange={() => handleFormToggle(index)}
                      disabled={isFormSelectionDisabled}
                    />
                    <span className="econsent-row__content">
                      <span className="econsent-row__topline">
                        <strong>Form {form.form_number}</strong>
                        <span className="jurisdiction-badge">{form.jurisdiction}</span>
                      </span>
                      <span className="econsent-row__title">{form.title}</span>
                      <span className="econsent-row__pages">
                        {form.pages.length === 1 ? 'Page' : 'Pages'} {form.pages.join(', ')}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="empty-section-copy">No E-consent forms were detected for this return.</p>
            )}

            {isExtracting && <p className="inline-status">Rebuilding Econsent.pdf…</p>}
            {isEconsentLoading && <p className="inline-status">Loading Econsent.pdf…</p>}
            {!isAttachmentBusy && forms.length > 0 && selectedForms.size === 0 && (
              <p className="inline-status inline-status--notice">
                No forms selected. The draft will contain the summary email only.
              </p>
            )}
          </div>

          <div className={`attachment-card ${econsentB64 ? 'attachment-card--ready' : ''}`}>
            <div className="attachment-card__icon"><FileText size={18} aria-hidden="true" /></div>
            <div className="attachment-card__details">
              <strong>{econsentB64 ? 'Econsent.pdf' : 'No attachment'}</strong>
              <span>
                {isAttachmentBusy
                  ? 'Preparing PDF…'
                  : econsentB64
                    ? `${selectedPageCount} ${selectedPageCount === 1 ? 'page' : 'pages'} • Ready`
                    : 'Select a form to include E-consent'}
              </span>
            </div>
            <button
              type="button"
              className="attachment-card__download"
              onClick={downloadEconsent}
              disabled={!canDownload}
              aria-label="Download Econsent.pdf"
            >
              <Download size={15} aria-hidden="true" />
              Download
            </button>
          </div>

          <button
            type="button"
            className="btn btn-primary create-draft-button"
            onClick={handleCreateDraft}
            disabled={!canCreateDraft}
          >
            <Send size={17} aria-hidden="true" />
            {createDraftLabel}
          </button>

          <div className="draft-result" aria-live="polite">
            {draftLinks.map(link => (
              <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer">
                {link.label}
              </a>
            ))}
            {draftState === 'error' && <p className="draft-error">{draftError}</p>}
          </div>

          <p className="draft-safety-note">
            <ShieldCheck size={20} aria-hidden="true" />
            <span>Creates a draft only — nothing is sent automatically.</span>
          </p>
        </aside>
      </div>
    </div>
  );
}
