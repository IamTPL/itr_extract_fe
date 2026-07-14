import { useRef, useState } from 'react';
import { LoaderCircle, Plus } from 'lucide-react';
import { ApiError } from '../lib/apiClient';
import { MAX_FILE_SIZE_BYTES } from '../lib/constants';

const MAX_MB = (MAX_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0);

export function UploadCard({ onUpload }: { onUpload: (file: File) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handle = async (file: File) => {
    setError(null);
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Only PDF files are accepted.');
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError(`File too large. Max ${MAX_MB} MB.`);
      return;
    }
    setBusy(true);
    try {
      await onUpload(file);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 413) setError(`File too large. Max ${MAX_MB} MB.`);
        else if (err.status === 429) setError('Too many active jobs. Please wait for current jobs to finish.');
        else setError(err.message || `Upload failed (${err.status})`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Upload failed. Please try again.');
      }
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <section
      className={`sidebar-upload${dragOver ? ' sidebar-upload--drag-over' : ''}`}
      aria-label="PDF upload"
      onDragOver={event => {
        event.preventDefault();
        if (!busy) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={event => {
        event.preventDefault();
        setDragOver(false);
        const file = event.dataTransfer.files[0];
        if (file && !busy) handle(file);
      }}
    >
      <button
        type="button"
        className="btn btn-primary sidebar-upload__button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
      >
        {busy
          ? <LoaderCircle className="spin" size={17} aria-hidden="true" />
          : <Plus size={17} aria-hidden="true" />}
        {busy ? 'Processing PDF…' : 'Process New PDF'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        aria-label="Select PDF to process"
        disabled={busy}
        onChange={e => e.target.files?.[0] && handle(e.target.files[0])}
        hidden
      />
      {error && <p className="upload-error" role="alert">{error}</p>}
    </section>
  );
}
