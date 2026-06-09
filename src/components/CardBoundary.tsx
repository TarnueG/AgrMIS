import { Component, ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

interface Props { children: ReactNode; }
interface State { hasError: boolean; }

// Isolated per-card error boundary (spec 2): a render error in one card shows an inline
// fallback with retry instead of crashing the surrounding cards.
export class CardBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch() {
    // Swallowed on purpose — one card must not blank out the others.
  }

  render() {
    if (this.state.hasError) {
      return (
        <Card>
          <CardContent className="p-5 flex items-center justify-between">
            <p className="text-sm text-destructive">This section couldn't be displayed.</p>
            <Button size="sm" variant="outline" onClick={() => this.setState({ hasError: false })} className="border border-input bg-background text-white hover:bg-accent">
              <RefreshCw className="h-3 w-3 mr-1" />Retry
            </Button>
          </CardContent>
        </Card>
      );
    }
    return this.props.children;
  }
}
