import { useState } from 'react';
import { MAX_FILE_SIZE_BYTES } from '../lib/constants';

export function UploadCard({ onUpload }: { onUpload: (file: File) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handle = async (file: File) => {
    setError(null);
    if (!file.name.toLowerCase().endsWith('.pdf')) { setError('Chỉ chấp nhận PDF'); return; }
    if (file.size > MAX_FILE_SIZE_BYTES) { setError('File quá lớn'); return; }
    setBusy(true);
    try { await onUpload(file); } finally { setBusy(false); }
  };

  return (
    <section style={{ border: '2px dashed #aaa', padding: 24, textAlign: 'center' }}>
      <input type="file" accept="application/pdf" disabled={busy}
             onChange={e => e.target.files?.[0] && handle(e.target.files[0])} />
      {busy && <p>Đang upload...</p>}
      {error && <p style={{ color: '#c33' }}>{error}</p>}
    </section>
  );
}
