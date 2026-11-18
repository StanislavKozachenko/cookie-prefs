import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';

/** Self-hosted Geist (no request to a font service), as CSS variables on `<body>`. */
export const fontClasses = `${GeistSans.variable} ${GeistMono.variable}`;
