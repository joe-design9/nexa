'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AppIndex() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/app/channels/@me');
  }, [router]);
  return <div className="flex-1 bg-nexa-bg" />;
}
