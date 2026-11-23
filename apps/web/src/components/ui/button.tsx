import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cn } from "@/lib/cn";
import { buttonStyles, type Size, type Variant } from "./button-styles";

type ButtonProps = ButtonPrimitive.Props & {
  variant?: Variant;
  size?: Size;
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonProps) {
  return (
    <ButtonPrimitive
      className={cn(buttonStyles(variant, size), className)}
      data-destructive={variant === "danger" ? "" : undefined}
      {...props}
    />
  );
}
