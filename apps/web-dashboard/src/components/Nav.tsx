'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Overview' },
  { href: '/opportunities', label: 'Pipeline' },
  { href: '/previews', label: '3D previews' },
  { href: '/reels', label: 'Reels' },
  { href: '/evals', label: 'Eval gate' },
  { href: '/settings', label: 'Settings' },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="nav">
      {LINKS.map((link) => {
        const active = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
        return (
          <Link key={link.href} href={link.href} data-active={active}>
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
