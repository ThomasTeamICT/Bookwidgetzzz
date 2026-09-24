import type { CSSProperties } from 'react';
import type { WidgetTypeId } from '../lib/types';
import { getTypeDef, type WidgetTypeDef } from '../widgets/registry';

export type TileSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const ICON_PX: Record<TileSize, number> = { xs: 14, sm: 17, md: 20, lg: 24, xl: 32 };

/**
 * Tegel met het icoon van een widgetsoort, in de tint van die soort. Puur
 * decoratief: de naam van de soort staat altijd als tekst ernaast.
 */
export function TypeTile({
  type,
  size = 'md',
  className,
}: {
  type: WidgetTypeId | WidgetTypeDef;
  size?: TileSize;
  className?: string;
}) {
  const def = typeof type === 'string' ? getTypeDef(type) : type;
  const style = { '--h': def.hue } as CSSProperties;
  return (
    <span className={`type-tile type-tile-${size}${className ? ` ${className}` : ''}`} style={style} aria-hidden="true">
      <def.Icon size={ICON_PX[size]} strokeWidth={size === 'xs' ? 2.25 : 2} />
    </span>
  );
}
