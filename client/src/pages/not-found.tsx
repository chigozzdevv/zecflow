export function NotFoundPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white px-4">
      <div className="text-sm uppercase tracking-[0.2em] text-zinc-500 mb-2">404</div>
      <h1 className="text-xl font-semibold mb-1">Page not found</h1>
      <p className="text-sm text-zinc-400 max-w-sm text-center">
        This route does not exist. Check the URL or use the navigation to reach a valid page.
      </p>
    </div>
  );
}
