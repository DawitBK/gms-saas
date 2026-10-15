import type { Metadata } from 'next';

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const parseAbsoluteUrl = (value?: string | null) => {
  if (!value) {
    return null;
  }

  try {
    return new URL(trimTrailingSlash(value));
  } catch {
    return null;
  }
};

const appUrl = parseAbsoluteUrl(process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL);

export const appMetadataBase = appUrl ?? undefined;
export const appOrigin = appUrl?.toString() ?? undefined;

export const internalPortalRobots: Metadata['robots'] = {
  index: false,
  follow: false,
  nocache: true,
  googleBot: {
    index: false,
    follow: false,
    noimageindex: true,
  },
};
