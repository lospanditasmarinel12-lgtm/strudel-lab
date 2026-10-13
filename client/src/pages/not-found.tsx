export default function NotFound() {
  return (
    <div className="h-screen flex items-center justify-center bg-strudel-dark text-white font-mono">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-strudel-primary mb-4">404</h1>
        <p className="text-muted-foreground mb-6">Page not found</p>
        <a
          href="/"
          className="text-strudel-accent hover:underline text-sm"
        >
          Back to Studio
        </a>
      </div>
    </div>
  );
}
