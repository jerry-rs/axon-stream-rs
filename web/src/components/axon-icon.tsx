import React from "react";
import { cn } from "@/lib/utils";

export interface AxonIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
}

export const AxonIcon = React.forwardRef<SVGSVGElement, AxonIconProps>(
  ({ className, size = 24, ...props }, ref) => {
    return (
      <svg
        ref={ref}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn("shrink-0 transition-colors", className)}
        {...props}
      >
        {/* Axon A-Frame */}
        <path d="M 4 19 L 12 4 L 20 19" />
        <path d="M 8 13 L 16 13" />

        {/* Nodes */}
        <circle cx="12" cy="4" r="1.75" className="fill-background stroke-foreground" strokeWidth="1.5" />
        <circle cx="12" cy="13" r="1.25" className="fill-foreground" />
        <circle cx="4" cy="19" r="1.25" className="fill-muted-foreground" />
        <circle cx="20" cy="19" r="1.25" className="fill-muted-foreground" />
      </svg>
    );
  }
);

AxonIcon.displayName = "AxonIcon";
