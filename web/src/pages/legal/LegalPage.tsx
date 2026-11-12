import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PRIVACY, TERMS, type LegalDoc, type LegalLang } from './content';
import './LegalPage.css';

function LegalDocView({ doc, other }: { doc: LegalDoc; other: { to: string; label: string } }) {
  useEffect(() => {
    const previous = document.title;
    document.title = `${doc.title} · VidShare`;
    return () => { document.title = previous; };
  }, [doc.title]);

  return (
    <main className="legal-page" id="main-content">
      <h1 className="legal-title">{doc.title}</h1>
      <p className="legal-meta">{doc.updated}</p>
      <p className="legal-draft" role="note">{doc.draftNote}</p>
      {doc.sections.map((s) => (
        <section key={s.heading} className="legal-section">
          <h2>{s.heading}</h2>
          {s.table && (
            <div className="legal-table-wrap">
              <table>
                <thead><tr>{s.table.head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
                <tbody>{s.table.rows.map((r) => <tr key={r[0]}>{r.map((c) => <td key={c}>{c}</td>)}</tr>)}</tbody>
              </table>
            </div>
          )}
          {s.items && <ul>{s.items.map((i) => <li key={i}>{i}</li>)}</ul>}
          {s.paragraphs?.map((p) => <p key={p}>{p}</p>)}
        </section>
      ))}
      <p className="legal-other"><Link to={other.to}>{other.label}</Link></p>
    </main>
  );
}

function useLang(): LegalLang {
  const { i18n } = useTranslation();
  return i18n.resolvedLanguage === 'en' ? 'en' : 'vi';
}

export function PrivacyPage() {
  const { t } = useTranslation();
  return <LegalDocView doc={PRIVACY[useLang()]} other={{ to: '/terms', label: t('nav.terms') }} />;
}

export function TermsPage() {
  const { t } = useTranslation();
  return <LegalDocView doc={TERMS[useLang()]} other={{ to: '/privacy', label: t('nav.privacy') }} />;
}
