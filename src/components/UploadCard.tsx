import { useRef, useState } from 'react';
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

  const zoneClass = [
    'upload-zone',
    dragOver ? 'upload-zone--drag-over' : '',
    busy ? 'upload-zone--busy' : '',
  ].filter(Boolean).join(' ');

  return (
    <section>
      <div
        className={zoneClass}
        onClick={() => { if (!busy) inputRef.current?.click(); }}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files[0];
          if (file && !busy) handle(file);
        }}
      >
        <div className="upload-zone__icon">↑</div>
        {busy ? (
          <p className="upload-zone__label">Uploading…</p>
        ) : (
          <>
            <p className="upload-zone__label">Drop PDF here or click to browse</p>
            <p className="upload-zone__hint">Max {MAX_MB} MB · PDF only</p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          disabled={busy}
          onChange={e => e.target.files?.[0] && handle(e.target.files[0])}
          style={{ display: 'none' }}
        />
      </div>
      {error && <p className="upload-error">{error}</p>}
    </section>
  );
}
