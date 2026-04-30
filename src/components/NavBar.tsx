"use client";

import Link from "next/link";

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
    </nav>
  );
}
