import * as C from "@radix-ui/react-collapsible";
import type { ComponentProps } from "react";
import { cn } from "../../lib/utils";

export const Collapsible = C.Root;
export const CollapsibleTrigger = C.Trigger;
export function CollapsibleContent({ className, ...p }: ComponentProps<typeof C.Content>) {
  return (
    <C.Content
      {...p}
      className={cn("data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up", className)}
    />
  );
}
