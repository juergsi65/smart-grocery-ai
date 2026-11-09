import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "../../lib/utils";

/** 44px grosses Touch-Ziel um eine 26px Box; Haken poppt beim Aktivieren. */
export function Checkbox({ className, ...p }: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      {...p}
      className={cn("group relative grid size-11 shrink-0 place-items-center rounded-full outline-offset-0", className)}
    >
      <span className="grid size-[26px] place-items-center rounded-full border-2 border-muted-foreground/60 bg-card transition-colors group-data-[state=checked]:border-primary group-data-[state=checked]:bg-primary">
        <CheckboxPrimitive.Indicator className="animate-check-pop text-primary-foreground">
          <Check className="size-4" strokeWidth={3.5} />
        </CheckboxPrimitive.Indicator>
      </span>
    </CheckboxPrimitive.Root>
  );
}
