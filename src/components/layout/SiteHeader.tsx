'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { PRIMARY_NAV, isActive } from './nav';
import { ThemeToggle } from './ThemeToggle';
import { LogoMark } from './LogoMark';

export function SiteHeader() {
  const pathname = usePathname() ?? '/';
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  // Close the drawer after navigation.
  useEffect(() => {
    dialogRef.current?.close();
  }, [pathname]);

  const openDrawer = () => {
    dialogRef.current?.showModal();
    setOpen(true);
  };
  const closeDrawer = () => dialogRef.current?.close();

  return (
    <header data-site-header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 rounded-md text-text no-underline" aria-label="Lakshya home">
          <LogoMark />
          <span className="font-display text-xl font-semibold tracking-tight">Lakshya</span>
        </Link>

        <nav aria-label="Primary" className="ml-auto hidden xl:block">
          <ul className="flex items-center gap-1">
            {PRIMARY_NAV.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={`rounded-md px-2.5 py-2 text-sm font-medium no-underline transition-colors ${
                      active ? 'bg-brand-soft text-brand-strong' : 'text-text hover:bg-surface-2'
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-2 xl:ml-2">
          <ThemeToggle />
          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-medium text-text hover:bg-surface-2 xl:hidden"
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={openDrawer}
          >
            <Menu aria-hidden="true" size={18} />
            Menu
          </button>
        </div>
      </div>

      <dialog
        id="mobile-nav"
        ref={dialogRef}
        aria-label="Site menu"
        onClose={() => setOpen(false)}
        onClick={(e) => {
          // A click on the backdrop (the dialog element itself) closes the drawer.
          if (e.target === dialogRef.current) closeDrawer();
        }}
        className="m-0 ml-auto h-dvh max-h-dvh w-[min(22rem,88vw)] max-w-none border-l border-line bg-surface p-0 text-text backdrop:bg-black/50"
      >
        <div className="flex h-full flex-col">
          <div className="flex h-16 items-center justify-between border-b border-line px-4">
            <span className="font-display text-lg font-semibold">Menu</span>
            <button
              type="button"
              onClick={closeDrawer}
              className="inline-flex h-10 w-10 items-center justify-center rounded-md hover:bg-surface-2"
              aria-label="Close menu"
            >
              <X aria-hidden="true" size={20} />
            </button>
          </div>
          <nav aria-label="Mobile primary" className="flex-1 overflow-y-auto p-2">
            <ul className="space-y-1">
              <li>
                <Link
                  href="/"
                  onClick={closeDrawer}
                  aria-current={pathname === '/' ? 'page' : undefined}
                  className={`block rounded-md px-3 py-2.5 no-underline ${pathname === '/' ? 'bg-brand-soft text-brand-strong' : 'text-text hover:bg-surface-2'}`}
                >
                  <span className="font-medium">Home</span>
                </Link>
              </li>
              {PRIMARY_NAV.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={closeDrawer}
                      aria-current={active ? 'page' : undefined}
                      className={`block rounded-md px-3 py-2.5 no-underline ${active ? 'bg-brand-soft text-brand-strong' : 'text-text hover:bg-surface-2'}`}
                    >
                      <span className="block font-medium">{item.label}</span>
                      <span className="block text-sm text-muted">{item.description}</span>
                    </Link>
                    {item.children && (
                      <ul className="mt-1 ml-3 space-y-1 border-l border-line pl-2">
                        {item.children.map((c) => (
                          <li key={c.href}>
                            <Link
                              href={c.href}
                              onClick={closeDrawer}
                              aria-current={pathname === c.href ? 'page' : undefined}
                              className={`block rounded-md px-3 py-2 text-sm no-underline ${pathname === c.href ? 'bg-brand-soft text-brand-strong' : 'text-text hover:bg-surface-2'}`}
                            >
                              {c.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </dialog>
    </header>
  );
}
