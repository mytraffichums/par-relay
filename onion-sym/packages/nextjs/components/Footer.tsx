import React from "react";
import Link from "next/link";
import { useFetchNativeCurrencyPrice } from "@scaffold-ui/hooks";
import { hardhat } from "viem/chains";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { SwitchTheme } from "~~/components/SwitchTheme";
import { Faucet } from "~~/components/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";

export const Footer = () => {
  const { targetNetwork } = useTargetNetwork();
  const isLocalNetwork = targetNetwork.id === hardhat.id;
  const { price: nativeCurrencyPrice } = useFetchNativeCurrencyPrice();

  return (
    <div className="min-h-0 py-3 px-1 mb-11 lg:mb-0 border-t border-[#1a1a2e]">
      <div>
        <div className="fixed flex justify-between items-center w-full z-10 p-4 bottom-0 left-0 pointer-events-none">
          <div className="flex flex-col md:flex-row gap-2 pointer-events-auto">
            {nativeCurrencyPrice > 0 && (
              <div className="btn btn-sm font-normal gap-1 cursor-auto bg-transparent border-[#1a1a2e] text-[#555]">
                <span className="text-[#00ff88]">ETH</span>
                <span>${nativeCurrencyPrice.toFixed(2)}</span>
              </div>
            )}
            {isLocalNetwork && (
              <>
                <Faucet />
                <Link href="/blockexplorer" passHref className="btn btn-sm font-normal gap-1 bg-transparent border-[#1a1a2e] text-[#555] hover:text-[#00ccff]">
                  <MagnifyingGlassIcon className="h-4 w-4" />
                  <span>explorer</span>
                </Link>
              </>
            )}
          </div>
          <SwitchTheme className={`pointer-events-auto ${isLocalNetwork ? "self-end md:self-auto" : ""}`} />
        </div>
      </div>
      <div className="w-full">
        <div className="flex justify-center items-center gap-4 text-[10px] text-[#333] uppercase tracking-[0.15em] font-mono">
          <span>relay_a:8001</span>
          <span className="text-[#1a1a2e]">|</span>
          <span>relay_b:8002</span>
          <span className="text-[#1a1a2e]">|</span>
          <span>service:9000</span>
          <span className="text-[#1a1a2e]">|</span>
          <span>audit:8003</span>
          <span className="text-[#1a1a2e]">|</span>
          <span>chain:8545</span>
        </div>
      </div>
    </div>
  );
};
