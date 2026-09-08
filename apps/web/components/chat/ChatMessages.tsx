export default function ChatMessages() {
  return (
    <section className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
      <div className="self-end rounded-2xl bg-blue-900 px-4 py-3 text-white">
        Explain React Fiber.
      </div>

      <div className="max-w-2xl rounded-2xl bg-zinc-900 text-white px-4 py-3">
        React Fiber is the reconciliation architecture used by React to
        represent and process updates to the component tree.
      </div>
    </section>
  );
}