import { useEffect, useState } from 'react';

// Simple placeholder to gate rendering until client-side hydration.
export default function ProtectContent() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  if (!ready) return null;
  return null;
}
