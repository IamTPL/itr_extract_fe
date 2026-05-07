import { useRef, useState, DragEvent } from 'react';

interface Props {
  onFile: (f: File) => void;
  error: string;
}

export default function UploadZone({ onFile, error }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function pick(file: File | undefined) {
    if (file?.type === 'application/pdf') onFile(file);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    pick(e.dataTransfer.files[0]);
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f7fa' }}>
      <div style={{ width: '480px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, marginBottom: '0.4rem', color: '#1a1a2e' }}>
          ITR Extract
        </h1>
        <p style={{ color: '#666', marginBottom: '2rem', fontSize: '0.95rem' }}>
          Upload an ITR PDF to generate the Econsent file and client email
        </p>

        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? '#0078d4' : '#c8d0da'}`,
            borderRadius: '12px',
            padding: '3rem 2rem',
            cursor: 'pointer',
            background: dragging ? '#e8f4fd' : '#fff',
            transition: 'all 0.15s ease',
          }}
        >
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📄</div>
          <p style={{ margin: 0, fontWeight: 600, color: '#333' }}>
            Drag &amp; drop ITR PDF here
          </p>
          <p style={{ margin: '0.4rem 0 0', color: '#888', fontSize: '0.88rem' }}>
            or click to browse
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,application/pdf"
            style={{ display: 'none' }}
            onChange={e => pick(e.target.files?.[0])}
          />
        </div>

        {error && (
          <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: '#fff0f0', border: '1px solid #ffcccc', borderRadius: '8px', color: '#cc0000', fontSize: '0.9rem' }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
