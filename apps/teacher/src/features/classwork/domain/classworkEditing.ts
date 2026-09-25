export const classworkEditCharacterLimit = 12_000;

export type ClassworkEditValidation =
  | { readonly valid: true; readonly text: string }
  | { readonly valid: false; readonly message: string };

export function validateClassworkEdit(value: string): ClassworkEditValidation {
  const text = value.trim();
  if (!text) {
    return { valid: false, message: "Add lesson content before saving this change." };
  }
  if ([...text].length > classworkEditCharacterLimit) {
    return {
      valid: false,
      message: "This lesson block is too long to save. Keep it under 12,000 characters.",
    };
  }
  const normalized = text.toLocaleLowerCase();
  if (text.includes("![") || normalized.includes("<img")) {
    return {
      valid: false,
      message: "Images cannot be added inside lesson text. Keep approved source figures in their existing positions.",
    };
  }
  return { valid: true, text };
}
