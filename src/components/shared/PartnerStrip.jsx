import React from 'react';
import { ExternalLink, Tag } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { useActivePartner } from '../../hooks/useActivePartner';
import { partnerLink } from '../../utils/partnerLink';
import { cn } from '@/lib/utils';

// The active shop partner as one quiet line: on calm screens only
// (after a match, practice home), at the bottom of the sidebar and in the TV footer. Nothing when
// there is no partner or it is hidden by the admin's visibility switch.
export function PartnerStrip({ variant = 'card', className }) {
  const { t } = useLanguage();
  const partner = useActivePartner();
  const href = partner ? partnerLink(partner.url) : null;
  if (!href) return null;

  const offer = t('partner.offer', { discount: partner.discount_label, code: partner.code });

  // TV display footer: nobody clicks a TV, so plain text the room can read.
  if (variant === 'tv') {
    return (
      <span className={cn('flex min-w-0 items-center gap-3', className)}>
        <span>{t('partner.label')}</span>
        {partner.image_url
          ? <img src={partner.image_url} alt={partner.name} className="h-7 max-w-28 shrink-0 object-contain" />
          : <span className="min-w-0 max-w-40 truncate font-semibold text-foreground">{partner.name}</span>}
        <span className="truncate text-foreground">{offer}</span>
      </span>
    );
  }
  const linkProps = { href, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `${t('partner.visitShop', { name: partner.name })}: ${offer}` };

  if (variant === 'sidebar') {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton asChild size="lg" tooltip={`${partner.name} · ${offer}`}>
          <a {...linkProps} className="group-data-[collapsible=icon]:justify-center">
            {partner.image_url
              ? <img src={partner.image_url} alt="" className="size-8 shrink-0 rounded-md bg-white object-contain p-0.5" />
              : <Tag className="size-5" />}
            {/* Collapsed sidebar: icon only, the tooltip carries the text. */}
            <span className="grid min-w-0 flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
              <span className="truncate text-xs text-muted-foreground">{t('partner.label')} · {partner.name}</span>
              <span className="truncate text-sm font-medium">{offer}</span>
            </span>
          </a>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return (
    <a
      {...linkProps}
      className={cn(
        'flex min-w-0 items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      {partner.image_url
        ? <img src={partner.image_url} alt="" className="h-6 max-w-24 shrink-0 object-contain" />
        : <span className="min-w-0 max-w-40 truncate font-semibold">{partner.name}</span>}
      <span className="min-w-0 flex-1 truncate">
        <span className="text-muted-foreground">{t('partner.label')} · </span>
        {offer}
      </span>
      <ExternalLink className="size-4 shrink-0 text-muted-foreground" />
    </a>
  );
}
