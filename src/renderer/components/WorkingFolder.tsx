import { useStore } from '../store/useStore';
import { api } from '../services/api';
import type { Material } from '../../types';

const TYPE_LABELS: Record<Material['type'], string> = {
  textbook: 'Textbook',
  syllabus: 'Syllabus',
  guide: 'Study Guide',
  exam: 'Exam / Quiz',
  other: 'Other',
};

const SUPPORTED_EXTS = ['.pdf', '.docx', '.pptx', '.txt', '.md'];

export default function WorkingFolder() {
  const { uploadedMaterials, chapters, removeMaterial, courseInfo, addMaterial } = useStore();

  async function handlePickFiles() {
    const paths = await api.file.selectMaterials();
    if (!paths.length) return;
    for (const p of paths) {
      const name = p.split('/').pop() ?? p;
      try {
        const material = await api.file.uploadMaterial(p, name);
        addMaterial(material);
      } catch (e) { console.error('Upload failed', e); }
    }
    const state = useStore.getState();
    api.config.save({ subjects: state.subjects, activeSubjectId: state.activeSubjectId }).catch(() => {});
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    for (const file of Array.from(e.dataTransfer.files)) {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!SUPPORTED_EXTS.includes(ext)) continue;
      try {
        const filePath = (file as File & { path: string }).path;
        const material = await api.file.uploadMaterial(filePath, file.name);
        addMaterial(material);
      } catch (e) { console.error('Upload failed', e); }
    }
    const state = useStore.getState();
    api.config.save({ subjects: state.subjects, activeSubjectId: state.activeSubjectId }).catch(() => {});
  }

  return (
    <div
      className="flex flex-col h-full overflow-y-auto"
      style={{ backgroundColor: '#FEFEFE' }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* Materials */}
      <section className="px-4 pt-4 pb-3">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#666666', margin: 0 }}>Materials</h3>
          <button
            onClick={handlePickFiles}
            title="Add file"
            style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px',
              borderRadius: 6, border: '1px solid #DEDAD4',
              backgroundColor: 'transparent', cursor: 'pointer',
              fontSize: 11, color: '#888', fontFamily: 'inherit',
            }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add
          </button>
        </div>

        {uploadedMaterials.length === 0 ? (
          <div
            onClick={handlePickFiles}
            style={{
              border: '2px dashed #DEDAD4', borderRadius: 10,
              padding: '16px', textAlign: 'center',
              cursor: 'pointer', color: '#AAA', fontSize: 12, lineHeight: 1.6,
            }}
          >
            Drop files here or click to add
            <br />
            <span style={{ fontSize: 10, letterSpacing: '0.03em' }}>PDF · DOCX · PPTX · TXT · MD</span>
          </div>
        ) : (
          <ul className="space-y-1">
            {uploadedMaterials.map((mat) => (
              <li key={mat.id} className="flex items-start gap-2 px-2 py-1.5 rounded-md group" style={{ color: '#1a1a1a' }}>
                <span style={{ color: '#888', marginTop: 1 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate leading-tight">{mat.name}</p>
                  <p className="text-xs" style={{ color: '#888' }}>{TYPE_LABELS[mat.type]}</p>
                </div>
                <button
                  onClick={() => {
                    removeMaterial(mat.id);
                    const state = useStore.getState();
                    api.config.save({ subjects: state.subjects }).catch(() => {});
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                  style={{ color: '#aaa', background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
                  title="Remove"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mx-4" style={{ borderTop: '1px solid #E8E0D5' }} />

      {/* Chapters */}
      <section className="px-4 pt-3 pb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#666666' }}>Chapters</h3>
        {chapters.length === 0 ? (
          <p className="text-xs" style={{ color: '#aaa' }}>Chat with Grace to generate chapters.</p>
        ) : (
          <ul className="space-y-1">
            {chapters.map((ch) => (
              <li key={ch.id} className="text-xs px-2 py-1.5 rounded-md hover:bg-amber-50 cursor-pointer" style={{ color: '#1a1a1a' }}>
                {ch.title}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mx-4" style={{ borderTop: '1px solid #E8E0D5' }} />

      {/* Quick Stats */}
      <section className="px-4 pt-3 pb-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#666666' }}>Info</h3>
        <dl className="space-y-1">
          <div className="flex justify-between">
            <dt className="text-xs" style={{ color: '#888' }}>Course</dt>
            <dd className="text-xs font-medium truncate ml-2 text-right" style={{ color: '#1a1a1a', maxWidth: 120 }}>
              {courseInfo.name || '—'}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-xs" style={{ color: '#888' }}>Files</dt>
            <dd className="text-xs font-medium" style={{ color: '#1a1a1a' }}>{uploadedMaterials.length}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-xs" style={{ color: '#888' }}>Chapters</dt>
            <dd className="text-xs font-medium" style={{ color: '#1a1a1a' }}>{chapters.length}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
