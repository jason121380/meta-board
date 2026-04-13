/**
 * Root application component. Currently a Phase 0 placeholder while the
 * scaffold is being set up. Router, auth provider, and view components
 * will be wired in Phase 2.
 */
export function App() {
  return (
    <div className="flex h-screen items-center justify-center font-sans">
      <div className="text-center">
        <div className="mb-2 text-2xl font-bold text-ink">
          METADASH <span className="text-orange">by LURE</span>
        </div>
        <div className="text-sm text-gray-500">Phase 0 scaffold — React rewrite in progress.</div>
      </div>
    </div>
  );
}
