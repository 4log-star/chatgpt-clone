import Sidebar from "@/components/chat/Sidebar";

export default function ChatLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex h-screen">
            <Sidebar />

            <main className="flex min-w-0 flex-1">
                {children}
            </main>
        </div>
    );
}