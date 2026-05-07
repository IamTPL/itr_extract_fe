export default function ProcessingState() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f7fa' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem', animation: 'spin 2s linear infinite' }}>⚙️</div>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 600, color: '#1a1a2e', marginBottom: '0.5rem' }}>
          Analyzing PDF with Gemini AI…
        </h2>
        <p style={{ color: '#666', fontSize: '0.95rem' }}>
          This takes 30–60 seconds. Please do not close the tab.
        </p>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}
