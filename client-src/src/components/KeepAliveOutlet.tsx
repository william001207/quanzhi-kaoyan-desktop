import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useLocation, Outlet, useOutlet } from 'react-router-dom';

interface KeepAliveOutletProps {
  keepPaths: string[];
  max?: number;
}

interface CachedNode {
  key: string;
  element: React.ReactElement | null;
}

const KeepAliveOutlet: React.FC<KeepAliveOutletProps> = ({ keepPaths, max = 4 }) => {
  const location = useLocation();
  const outlet = useOutlet();
  const [cached, setCached] = useState<CachedNode[]>([]);
  const orderRef = useRef<string[]>([]);
  const currentPath = location.pathname;

  const shouldKeep = keepPaths.some((p) => currentPath === p);

  useEffect(() => {
    if (!outlet || !shouldKeep) return;
    const key = currentPath;
    setCached((prev) => {
      const existing = prev.find((c) => c.key === key);
      if (existing) return prev;
      const newCached = [...prev, { key, element: outlet }];
      orderRef.current = [...orderRef.current.filter((k) => k !== key), key];
      while (orderRef.current.length > max) {
        const toRemove = orderRef.current[0];
        const isProtected = keepPaths.some((p) => toRemove === p);
        if (isProtected) {
          orderRef.current.push(orderRef.current.shift()!);
          if (orderRef.current.every((k) => keepPaths.some((p) => k === p))) {
            break;
          }
        } else {
          orderRef.current = orderRef.current.slice(1);
          return newCached.filter((c) => c.key !== toRemove);
        }
      }
      return newCached;
    });
  }, [currentPath, outlet, shouldKeep, keepPaths, max]);

  if (!shouldKeep) {
    return <Outlet />;
  }

  return (
    <div className="h-full w-full">
      {cached.map((c) => (
        <div
          key={c.key}
          style={{ display: c.key === currentPath ? 'block' : 'none' }}
          className="h-full w-full"
        >
          {c.element}
        </div>
      ))}
      {cached.length === 0 && outlet}
    </div>
  );
};

export default KeepAliveOutlet;
