import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import { buttonStyles } from "@/components/ui/button-styles";
import { cn } from "@/lib/cn";
import { clearStart } from "@/lib/start-intent";

export function StartLearning({
  size = "lg",
  className,
}: {
  size?: "sm" | "lg";
  className?: string;
}) {
  return (
    <Link
      to="/app"
      onClick={clearStart}
      className={cn(
        buttonStyles("primary", size),
        "whitespace-nowrap",
        className,
      )}
    >
      Start learning
      {size === "lg" && (
        <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
      )}
    </Link>
  );
}
