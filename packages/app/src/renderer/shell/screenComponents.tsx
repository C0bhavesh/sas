import type { ComponentType } from 'react';
import { Help } from '../screens/Help';
import { Home } from './Home';
import { SCREENS, type ScreenId } from './screens';

function placeholder(title: string): ComponentType {
  return function Placeholder() {
    return (
      <div className="panel">
        <h2>{title}</h2>
        <p className="muted">This screen is built in a later task.</p>
      </div>
    );
  };
}

const placeholders = Object.fromEntries(SCREENS.map((s) => [s.id, placeholder(s.title)])) as Record<ScreenId, ComponentType<any>>;

/** Every screen id maps to a component. Later tasks replace the placeholders. */
export const SCREEN_COMPONENTS: Record<ScreenId, ComponentType<any>> = {
  ...placeholders,
  home: Home,
  help: Help,
};
