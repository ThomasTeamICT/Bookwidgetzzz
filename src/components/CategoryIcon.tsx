import { ClipboardCheck, Gamepad2, Image as ImageIcon, School, SquareFunction, type LucideIcon } from 'lucide-react';
import type { WidgetCategory } from '../lib/types';

/**
 * Icoon per categorie van widgetsoorten. Staat bewust niet in de registry:
 * die zit in de hoofdbundel van de leerling, en een leerling ziet nooit een
 * categorie.
 */
const CATEGORY_ICON: Record<WidgetCategory, LucideIcon> = {
  test: ClipboardCheck,
  game: Gamepad2,
  picture: ImageIcon,
  math: SquareFunction,
  classroom: School,
};

export function CategoryIcon({ id, size = 20 }: { id: WidgetCategory; size?: number }) {
  const Icon = CATEGORY_ICON[id];
  return <Icon size={size} aria-hidden="true" />;
}
