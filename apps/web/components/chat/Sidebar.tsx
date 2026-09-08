import Link from "next/link";

export default function Sidebar() {
  return (
    <aside className="flex w-64 flex-col border-r  p-4">
      <Link
        href="/chat"
        className="mb-6 rounded-lg border px-4 py-2 text-center"
      >
        + New chat
      </Link>

      <nav className="space-y-1">
        <Link
          href="/chat/abc123"
          className="block rounded-lg px-3 py-2 hover:bg-zinc-900"
        >
          React Hooks
        </Link>

        <Link
          href="/chat/xyz789"
          className="block rounded-lg px-3 py-2 hover:bg-zinc-900"
        >
          AI Architecture
        </Link>
      </nav>
    </aside>
  );
}