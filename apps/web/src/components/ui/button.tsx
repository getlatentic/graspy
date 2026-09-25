import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { buttonStyles, type Size, type Variant } from "./button-styles";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonStyles(variant, size), className)}
      {...props}
    />
  );
}
