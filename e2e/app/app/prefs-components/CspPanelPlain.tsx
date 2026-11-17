'use client';

import { useEffect, useState } from 'react';

export function CspPanelPlain() {
  const [hydrated, setHydrated] = useState('no');
  useEffect(() => setHydrated('yes'), []);
  return <p>hydrated: <span data-testid="hydrated">{hydrated}</span></p>;
}
