'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { prefs } from './prefs';

export async function setLocale(path: string, formData: FormData) {
  const value = String(formData.get('value') ?? 'de');
  // `await` also works on Next 14, where cookies() is synchronous.
  (await cookies()).set(prefs.locale.toCookie(value));
  revalidatePath(path);
}
