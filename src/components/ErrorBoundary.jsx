import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { Button } from '@/components/ui/button';

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
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-8 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
            <AlertTriangle className="size-6" />
          </div>
          <h2 className="text-xl font-semibold tracking-tight">{t('errorBoundary.title')}</h2>
          <p className="max-w-md text-sm text-muted-foreground">{t('errorBoundary.message')}</p>
          <Button className="mt-2" onClick={() => window.location.reload()}>
            {t('errorBoundary.reload')}
          </Button>
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
