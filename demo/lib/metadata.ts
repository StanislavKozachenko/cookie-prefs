import type { Metadata } from 'next';

export const siteMetadata = (title: string, description: string): Metadata => ({
  title,
  description,
  robots: { index: true, follow: true },
});
