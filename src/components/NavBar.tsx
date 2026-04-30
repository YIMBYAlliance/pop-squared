"use client";

import Link from "next/link";
import { openModal } from "@/lib/modal-events";

const isDev = process.env.NEXT_PUBLIC_DEV_MODE === "true";

export default function NavBar() {
  return (
    <nav className="bg-white border-b border-gray-200 px-6 py-2.5 flex items-center gap-6">
      <Link href="/" className="text-sm font-bold text-gray-900">
        Pop Squared
      </Link>
      {isDev && (
        <Link
          href="/migrate"
          className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
        >
          Admin
        </Link>
      )}
      <div className="ml-auto flex items-center gap-4 text-sm">
        <button
          onClick={() => openModal("methodology")}
          className="text-gray-600 hover:text-gray-900 underline-offset-2 hover:underline transition-colors"
        >
          Methodology
        </button>
        <button
          onClick={() => openModal("data-quality")}
          className="text-gray-600 hover:text-gray-900 underline-offset-2 hover:underline transition-colors"
        >
          Population data
        </button>
        <button
          onClick={() => openModal("transit")}
          className="text-gray-600 hover:text-gray-900 underline-offset-2 hover:underline transition-colors"
        >
          Travel-time data
        </button>
      </div>
    </nav>
  );
}
