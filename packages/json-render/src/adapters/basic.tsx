/** Layout, text and media adapters: JSON props → @liquid-gpu/react components (icon names → nodes). */
import {
  Avatar,
  AvatarGroup,
  Badge,
  Grid,
  HStack,
  Heading,
  Icon,
  Image,
  Skeleton,
  Spacer,
  Tag,
  Text,
  VStack,
  ZStack,
  type GridColumn,
  type IconWeight,
} from '@liquid-gpu/react';
import { icon } from '../runtime';
import { defined, type P } from './types';

export function VStackAdapter({ element, children }: P<'VStack'>) {
  return <VStack {...defined(element.props)}>{children}</VStack>;
}
export function HStackAdapter({ element, children }: P<'HStack'>) {
  return <HStack {...defined(element.props)}>{children}</HStack>;
}
export function ZStackAdapter({ element, children }: P<'ZStack'>) {
  return <ZStack {...defined(element.props)}>{children}</ZStack>;
}
export function SpacerAdapter({ element }: P<'Spacer'>) {
  return <Spacer {...defined(element.props)} />;
}
export function GridAdapter({ element, children }: P<'Grid'>) {
  const { columns, alignment, ...rest } = element.props;
  const fill = alignment === 'fill';
  return (
    <Grid
      {...defined(rest)}
      {...(alignment && !fill ? { alignment } : {})}
      {...(fill ? { style: { justifyItems: 'stretch', alignItems: 'stretch' } } : {})}
      {...(columns !== undefined ? { columns: columns as number | GridColumn[] } : {})}
    >
      {children}
    </Grid>
  );
}

export function TextAdapter({ element }: P<'Text'>) {
  const { text, ...rest } = element.props;
  return <Text {...defined(rest)}>{text ?? ''}</Text>;
}
export function HeadingAdapter({ element }: P<'Heading'>) {
  const { text, ...rest } = element.props;
  return <Heading {...defined(rest)}>{text ?? ''}</Heading>;
}

export function IconAdapter({ element }: P<'Icon'>) {
  const { name, weight, ...rest } = element.props;
  return <Icon name={name ?? 'questionmark.square'} {...defined(rest)} {...(weight ? { weight: weight as IconWeight } : {})} />;
}
export function ImageAdapter({ element }: P<'Image'>) {
  return <Image {...defined(element.props)} />;
}
export function AvatarAdapter({ element }: P<'Avatar'>) {
  return <Avatar {...defined(element.props)} />;
}
export function AvatarGroupAdapter({ element }: P<'AvatarGroup'>) {
  const { items, ...rest } = element.props;
  return <AvatarGroup items={(Array.isArray(items) ? items : []).map((it) => defined(it))} {...defined(rest)} />;
}
export function BadgeAdapter({ element }: P<'Badge'>) {
  return <Badge {...defined(element.props)} />;
}
export function TagAdapter({ element }: P<'Tag'>) {
  const { icon: name, label, ...rest } = element.props;
  return <Tag label={label ?? ''} {...defined(rest)} {...(name ? { icon: icon(name, 13) } : {})} />;
}
export function SkeletonAdapter({ element }: P<'Skeleton'>) {
  return <Skeleton {...defined(element.props)} />;
}
