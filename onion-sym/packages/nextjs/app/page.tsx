"use client";

import Link from "next/link";
import type { NextPage } from "next";

const ASCII_LOGO = `
 ____   _    ____
|  _ \\ / \\  |  _ \\
| |_) / _ \\ | |_) |
|  __/ ___ \\|  _ <
|_| /_/   \\_\\_| \\_\\
`;

const Home: NextPage = () => {
  return (
    <div className="flex flex-col items-center grow pt-6 px-4">
      <pre className="text-[#00ff88] text-xs sm:text-sm leading-tight font-mono select-none">{ASCII_LOGO}</pre>
      <p className="text-center text-[#555] text-xs uppercase tracking-[0.2em] mt-2">
        private agent router v0.1.0
      </p>

      <div className="mt-8 max-w-2xl w-full space-y-1 font-mono text-sm">
        <div className="text-[#555]">$ par --status</div>
        <div className="text-[#c8c8d0] pl-2">
          <span className="text-[#00ff88]">[ok]</span> onion relay network ........... <span className="text-[#00ff88]">2 hops</span>
        </div>
        <div className="text-[#c8c8d0] pl-2">
          <span className="text-[#00ff88]">[ok]</span> spending policy contract ...... <span className="text-[#00ff88]">deployed</span>
        </div>
        <div className="text-[#c8c8d0] pl-2">
          <span className="text-[#00ff88]">[ok]</span> blind token vault ............ <span className="text-[#00ff88]">5 tokens minted</span>
        </div>
        <div className="text-[#c8c8d0] pl-2">
          <span className="text-[#00ff88]">[ok]</span> on-chain audit log ........... <span className="text-[#00ff88]">deployed</span>
        </div>
        <div className="text-[#c8c8d0] pl-2">
          <span className="text-[#00ff88]">[ok]</span> agent sdk .................... <span className="text-[#00ff88]">ready</span>
        </div>
        <div className="text-[#555] mt-4">$ par --help</div>
      </div>

      <div className="mt-6 max-w-2xl w-full">
        <Link
          href="/demo"
          className="group border border-[#00ff88] hover:border-[#00ff88] p-5 transition-all bg-[#0e0e18] hover:bg-[#00ff8808] block mb-3"
        >
          <div className="text-[#00ff88] font-bold text-sm group-hover:text-[#00ff88]">
            ▶ try it — send a private request now
          </div>
          <div className="text-[#555] text-xs mt-2 leading-relaxed">
            connect your wallet, pick a URL, and route it through the onion relay network. pay 0.01 USDC per hop on Base Sepolia. see the decrypted response — the service never sees your IP.
          </div>
        </Link>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link
            href="/spending"
            className="group border border-[#1a1a2e] hover:border-[#ffcc00] p-4 transition-all bg-[#0e0e18]"
          >
            <div className="text-[10px] text-[#333] uppercase tracking-[0.2em]">01</div>
            <div className="text-[#ffcc00] font-bold text-sm mt-1">
              /spending
            </div>
            <div className="text-[#555] text-xs mt-2 leading-relaxed">
              on-chain spending policy. max per tx, max per day, allowed services. agent cannot exceed.
            </div>
          </Link>

          <Link
            href="/tokens"
            className="group border border-[#1a1a2e] hover:border-[#00ccff] p-4 transition-all bg-[#0e0e18]"
          >
            <div className="text-[10px] text-[#333] uppercase tracking-[0.2em]">02</div>
            <div className="text-[#00ccff] font-bold text-sm mt-1">
              /tokens
            </div>
            <div className="text-[#555] text-xs mt-2 leading-relaxed">
              blind payment tokens. hash-commitment scheme. service gets paid, no idea who paid.
            </div>
          </Link>

          <Link
            href="/audit"
            className="group border border-[#1a1a2e] hover:border-[#ff8800] p-4 transition-all bg-[#0e0e18]"
          >
            <div className="text-[10px] text-[#333] uppercase tracking-[0.2em]">03</div>
            <div className="text-[#ff8800] font-bold text-sm mt-1">
              /audit
            </div>
            <div className="text-[#555] text-xs mt-2 leading-relaxed">
              on-chain audit log. payload hashes per circuit. proves routing without revealing data.
            </div>
          </Link>

          <Link
            href="/debug"
            className="group border border-[#1a1a2e] hover:border-[#555] p-4 transition-all bg-[#0e0e18]"
          >
            <div className="text-[10px] text-[#333] uppercase tracking-[0.2em]">04</div>
            <div className="text-[#555] font-bold text-sm mt-1">
              /debug
            </div>
            <div className="text-[#555] text-xs mt-2 leading-relaxed">
              interact directly with deployed contracts on Base Sepolia.
            </div>
          </Link>
        </div>
      </div>

      <a
        href="https://github.com/mytraffichums/par-relay/blob/main/private-agent-router/SKILL.md"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-8 max-w-2xl w-full border border-[#1a1a2e] hover:border-[#cc66ff] p-4 transition-all bg-[#0e0e18] hover:bg-[#cc66ff08] block text-center"
      >
        <div className="text-[#cc66ff] font-bold text-sm">
          are you an agent? grab skill.md
        </div>
        <div className="text-[#555] text-xs mt-1">
          machine-readable interface - no SDK needed
        </div>
      </a>

      <div className="mt-6 mb-8 text-[10px] text-[#222] uppercase tracking-[0.3em] font-mono">
        agent &rarr; relay_b &rarr; relay_a &rarr; destination
      </div>
    </div>
  );
};

export default Home;
