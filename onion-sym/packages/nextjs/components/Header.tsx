"use client";

import React, { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { hardhat } from "viem/chains";
import { Bars3Icon } from "@heroicons/react/24/outline";
import { FaucetButton, RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useOutsideClick, useTargetNetwork } from "~~/hooks/scaffold-eth";

type HeaderMenuLink = {
  label: string;
  href: string;
  shortcut?: string;
};

export const menuLinks: HeaderMenuLink[] = [
  { label: "home", href: "/", shortcut: "~" },
  { label: "demo", href: "/demo", shortcut: "r" },
  { label: "dashboard", href: "/dashboard", shortcut: "d" },
  { label: "spending", href: "/spending", shortcut: "s" },
  { label: "tokens", href: "/tokens", shortcut: "t" },
  { label: "audit", href: "/audit", shortcut: "a" },
  { label: "debug", href: "/debug", shortcut: "x" },
];

export const HeaderMenuLinks = () => {
  const pathname = usePathname();

  return (
    <>
      {menuLinks.map(({ label, href, shortcut }) => {
        const isActive = pathname === href;
        return (
          <li key={href}>
            <Link
              href={href}
              passHref
              className={`${
                isActive
                  ? "text-[#00ff88] border-b border-[#00ff88]"
                  : "text-[#555] hover:text-[#00ff88]"
              } px-3 py-1.5 text-xs uppercase tracking-widest font-mono transition-colors`}
            >
              {shortcut && <span className="text-[#333] mr-1">[{shortcut}]</span>}
              {label}
            </Link>
          </li>
        );
      })}
    </>
  );
};

export const Header = () => {
  const { targetNetwork } = useTargetNetwork();
  const isLocalNetwork = targetNetwork.id === hardhat.id;

  const burgerMenuRef = useRef<HTMLDetailsElement>(null);
  useOutsideClick(burgerMenuRef, () => {
    burgerMenuRef?.current?.removeAttribute("open");
  });

  return (
    <div className="sticky lg:static top-0 navbar min-h-0 shrink-0 justify-between z-20 px-0 sm:px-2 bg-[#0a0a0f] border-b border-[#1a1a2e]">
      <div className="navbar-start w-auto lg:w-1/2">
        <details className="dropdown" ref={burgerMenuRef}>
          <summary className="ml-1 btn btn-ghost lg:hidden hover:bg-transparent">
            <Bars3Icon className="h-1/2" />
          </summary>
          <ul
            className="menu menu-compact dropdown-content mt-3 p-2 shadow-sm bg-[#0e0e18] border border-[#1a1a2e] rounded-md w-52"
            onClick={() => {
              burgerMenuRef?.current?.removeAttribute("open");
            }}
          >
            <HeaderMenuLinks />
          </ul>
        </details>
        <Link href="/" passHref className="hidden lg:flex items-center gap-3 ml-4 mr-6 shrink-0">
          <div className="flex flex-col">
            <span className="text-[#00ff88] font-bold text-lg tracking-wider">PAR</span>
            <span className="text-[#333] text-[10px] uppercase tracking-[0.2em]">private agent router</span>
          </div>
        </Link>
        <ul className="hidden lg:flex lg:flex-nowrap menu menu-horizontal px-1 gap-0">
          <HeaderMenuLinks />
        </ul>
      </div>
      <div className="navbar-end grow mr-4 gap-2">
        <div className="text-[10px] text-[#333] uppercase tracking-wider hidden md:block">
          anvil:8545
        </div>
        <RainbowKitCustomConnectButton />
        {isLocalNetwork && <FaucetButton />}
      </div>
    </div>
  );
};
