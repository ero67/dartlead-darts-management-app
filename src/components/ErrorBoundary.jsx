import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';

// Error boundaries must be class components (React has no hook equivalent),
// so a functional wrapper injects t() from the language context.
class ErrorBoundaryInner extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled render error:', error, info?.componentStack);
  }

  render() {
    if (this.state.hasError) {
      const { t } = this.props;
      return (
        <div className="unauthorized-container">
          <h2>{t('errorBoundary.title')}</h2>
          <p>{t('errorBoundary.message')}</p>
          <button
            className="create-tournament-btn"
            onClick={() => window.location.reload()}
            style={{ marginTop: '1rem' }}
          >
            {t('errorBoundary.reload')}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function ErrorBoundary({ children }) {
  const { t } = useLanguage();
  return <ErrorBoundaryInner t={t}>{children}</ErrorBoundaryInner>;
}
