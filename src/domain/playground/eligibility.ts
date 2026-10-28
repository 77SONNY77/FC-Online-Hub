import { fieldVerificationSchema } from '@/contracts/catalog';
export function verifiedPurchaseData(dataType: string, status: string, fields: unknown) {
  if (status === 'REJECTED') return false;
  if (dataType === 'MOCK') return true;
  if (dataType !== 'OFFICIAL' || status !== 'VERIFIED') return false;
  const result = fieldVerificationSchema.safeParse(fields);
  return result.success && ['name', 'price', 'currency', 'components'].every(key => result.data[key as keyof typeof result.data] === 'VERIFIED');
}
